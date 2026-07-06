/**
 * fuse-search.js
 * Wisdom Oracle — Gītā corpus builder + inverted-index search engine
 *
 * Retrieval/ranking model:
 *   1. Query is normalized identically to indexed text (lowercase, NFD,
 *      diacritics stripped, punctuation stripped).
 *   2. Query is truncated to the first 5 raw terms, then leading stopwords
 *      are dropped (matches product spec).
 *   3. Primary ranking is done via a per-field inverted index:
 *        - term coverage (how many distinct query terms matched)
 *        - term rarity (per-field IDF)
 *        - term proximity (smallest window covering matched terms)
 *        - exact phrase bonus (large, dominates other factors)
 *      Verse mode indexes Translation-En (higher weight) and Verse-Text
 *      (lower weight) as SEPARATE fields — not concatenated — so Sanskrit/
 *      IAST queries (e.g. "karmaṇy", "dharma") get first-class scoring
 *      against Verse-Text instead of relying on fuzzy fallback.
 *      Purport mode indexes Purport-En only, and purports that are just the
 *      placeholder "No purport for this śloka." are excluded entirely.
 *   4. Fuse.js is used ONLY as a fallback when exact retrieval returns too
 *      few candidates (typo tolerance / fuzzy recovery). Fallback hits are
 *      always appended after exact hits — never interleaved or allowed to
 *      outrank an exact/phrase match.
 */

'use strict';

import { BG_CHAPTER_INFO, loadChapterData } from './gitacore.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_CHAPTERS = 18;
const NO_PURPORT_TEXT = 'No purport for this śloka.';

const MIN_EXACT_RESULTS  = 5;   // if exact search returns fewer, top up with Fuse
const PROXIMITY_WEIGHT   = 2;   // higher = proximity between matched terms matters more
const EXACT_PHRASE_BONUS = 50;  // deliberately large — must dominate idf/proximity scores
const MAX_QUERY_TERMS    = 5;   // hard cap on raw query terms considered

const BASE_OPTIONS = {
  threshold:          0.35,
  ignoreLocation:     false,
  includeScore:       true,
  includeMatches:     true,
  minMatchCharLength: 3,
  ignoreDiacritics:   true,
  distance:           64,
};

const KEYS_VERSE = [
  { name: 'translation', weight: 0.7 },
  { name: 'verseText',   weight: 0.3 },
];

const KEYS_PURPORT = [
  { name: 'purport', weight: 1.0 },
];

// Field configs for the inverted index (distinct from Fuse's KEYS_* above —
// these drive exact-match scoring weights, Fuse's are only used in fallback).
const FIELD_CONFIG_VERSE = [
  { name: 'translation', weight: 1.0 },
  { name: 'verseText',   weight: 0.4 },
];
const FIELD_CONFIG_PURPORT = [
  { name: 'purport', weight: 1.0 },
];

const STOPWORDS = {
  an: true,
  and: true,
  dharma: false,
  for: true,
  god: false,
  in: true,
  karma: false,
  krishna: false,
  krsna: false,
  kṛṣṇa: false,
  lord: false,
  of: true,
  on: true,
  one: true,
  personality: false,
  supreme: false,
  to: true,
  yoga: false
};

// ─── Normalization (identical for indexed text and queries) ───────────────────
function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')                    // decompose accented/IAST chars
    .replace(/[\u0300-\u036f]/g, '')     // strip combining diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWord(w) {
  return normalizeText(w);
}

// Tokenizes ORIGINAL (non-normalized) text so char offsets line up with the
// text actually rendered in the UI, while each token's comparison key is
// normalized for matching.
function extractTokensWithOffsets(text) {
  const tokens = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      norm:  normalizeWord(m[0]),
      start: m.index,
      end:   m.index + m[0].length - 1,
    });
  }
  return tokens;
}

// ─── Query builder ──────────────────────────────────────────────────────────
// Anchor-word fallback is fully removed. Truncation happens on the RAW
// (pre-stopword-strip) word list so leading stopwords still count toward the
// 5-term budget, matching spec:
//   "the captains who are especially qualified to lead"
//     -> first 5 raw terms: ["the","captains","who","are","especially"]
//     -> drop leading "the": "captains who are especially"
function buildQuery(term) {
  if (!term) return { phrase: '', scoringTerms: [] };

  const normalized = normalizeText(term);
  const allWords = normalized.split(' ').filter(Boolean);

  const truncated = allWords.slice(0, MAX_QUERY_TERMS);

  while (truncated.length && STOPWORDS[truncated[0]]) {
    truncated.shift(); // leading stopwords only, within the 5-word window
  }

  const phrase = truncated.join(' ');
  // Scoring/index lookup excludes ALL stopwords, not just leading ones
  const scoringTerms = truncated.filter(w => w.length >= 2 && !STOPWORDS[w]);

  return { phrase, scoringTerms };
}

// ─── Inverted index (multi-field) ──────────────────────────────────────────
class InvertedIndex {
  // fieldConfigs: [{ name: 'translation', weight: 1.0 }, ...]
  constructor(docs, fieldConfigs) {
    this.docs = docs;
    this.fieldNames = fieldConfigs.map(f => f.name);
    this.postings = new Map();  // field -> term -> Map(docIdx -> occurrences[])
    this.df       = new Map();  // field -> term -> doc count
    this.idf      = new Map();  // field -> term -> idf
    this.normText = new Map();  // field -> docIdx -> normalized full text
    this._build();
  }

  _build() {
    this.fieldNames.forEach(name => {
      this.postings.set(name, new Map());
      this.df.set(name, new Map());
      this.normText.set(name, []);
    });

    this.docs.forEach((doc, docIdx) => {
      this.fieldNames.forEach(name => {
        const text = doc[name] ?? '';
        this.normText.get(name)[docIdx] = normalizeText(text);

        const postings = this.postings.get(name);
        const df = this.df.get(name);
        const seen = new Set();
        let contentPos = 0; // position counter over indexed (non-stopword) tokens only

        extractTokensWithOffsets(text).forEach((tok, pos) => {
          if (tok.norm.length < 2 || STOPWORDS[tok.norm]) return;

          if (!postings.has(tok.norm)) postings.set(tok.norm, new Map());
          const docMap = postings.get(tok.norm);
          if (!docMap.has(docIdx)) docMap.set(docIdx, []);
          docMap.get(docIdx).push({ pos, start: tok.start, end: tok.end });
          contentPos++; // only advances for stored tokens

          seen.add(tok.norm);
        });

        seen.forEach(t => df.set(t, (df.get(t) || 0) + 1));
      });
    });

    this.N = this.docs.length;
    this.fieldNames.forEach(name => {
      const df = this.df.get(name);
      const idf = new Map();
      df.forEach((count, term) => {
        idf.set(term, Math.log((this.N + 1) / (count + 1)) + 1);
      });
      this.idf.set(name, idf);
    });
  }

  getPostings(field, term) {
    return this.postings.get(field)?.get(term) || null;
  }

  // Unseen term -> treated as maximally rare/informative. This only assigns
  // a weight; it never manufactures a match (postings lookup already
  // returned null upstream in that case).
  getIdf(field, term) {
    const val = this.idf.get(field)?.get(term);
    return val !== undefined ? val : Math.log(this.N + 1) + 1;
  }

  getNormText(field, docIdx) {
    return this.normText.get(field)[docIdx];
  }
}

// ─── Proximity scoring ──────────────────────────────────────────────────────
// Smallest token-position window that covers every distinct matched term.
function proximityBonus(termMap) {
  const terms = Array.from(termMap.keys());
  if (terms.length < 2) return 0;

  const merged = [];
  terms.forEach(t => termMap.get(t).forEach(o => merged.push({ pos: o.pos, term: t })));
  merged.sort((a, b) => a.pos - b.pos);

  const need = terms.length;
  const count = new Map();
  let have = 0, left = 0, bestSpan = Infinity;

  for (let right = 0; right < merged.length; right++) {
    const t = merged[right].term;
    count.set(t, (count.get(t) || 0) + 1);
    if (count.get(t) === 1) have++;

    while (have === need) {
      bestSpan = Math.min(bestSpan, merged[right].pos - merged[left].pos);
      const lt = merged[left].term;
      count.set(lt, count.get(lt) - 1);
      if (count.get(lt) === 0) have--;
      left++;
    }
  }

  return bestSpan === Infinity ? 0 : PROXIMITY_WEIGHT / (bestSpan + 1);
}

// ─── Exact/primary search (multi-field weighted) ───────────────────────────
function exactSearch(index, query, fieldConfigs) {
  const { phrase, scoringTerms } = query;
  if (!scoringTerms.length) return [];

  // docIdx -> Map(fieldName -> Map(term -> occurrences[]))
  const candidateDocs = new Map();

  fieldConfigs.forEach(({ name }) => {
    scoringTerms.forEach(term => {
      const postings = index.getPostings(name, term);
      if (!postings) return;
      postings.forEach((occurrences, docIdx) => {
        if (!candidateDocs.has(docIdx)) candidateDocs.set(docIdx, new Map());
        const fieldMap = candidateDocs.get(docIdx);
        if (!fieldMap.has(name)) fieldMap.set(name, new Map());
        fieldMap.get(name).set(term, occurrences);
      });
    });
  });

  const results = [];

  candidateDocs.forEach((fieldMap, docIdx) => {
    let totalScore = 0;
    const matches = [];

    fieldConfigs.forEach(({ name, weight }) => {
      const termMap = fieldMap.get(name);
      if (!termMap) return;

      let fieldTermScore = 0;
      termMap.forEach((occurrences, term) => {
        const idf = index.getIdf(name, term);
        fieldTermScore += idf * (1 + 0.1 * Math.min(occurrences.length - 1, 5));
      });

      /* const coverageRatio = termMap.size / scoringTerms.length;
      const proxBonus = proximityBonus(termMap);
      let fieldScore = fieldTermScore * (0.5 + 0.5 * coverageRatio) + proxBonus;
      */

      const proxBonus = proximityBonus(termMap);

      const coverageBonus = Math.pow(termMap.size, 1.4);

      let fieldScore =
          fieldTermScore +
          coverageBonus +
          proxBonus;

      /* if (phrase.includes(' ') && index.getNormText(name, docIdx).includes(phrase)) {
        fieldScore += EXACT_PHRASE_BONUS;
      }
      */
      const phraseBonus = computePhraseBonus(
          scoringTerms,
          termMap
      );

      fieldScore += phraseBonus;

      totalScore += fieldScore * weight;

      const spans = [];
      termMap.forEach(occurrences => occurrences.forEach(o => spans.push([o.start, o.end])));
      if (spans.length) matches.push({ key: name, indices: mergeOverlappingIndices(spans) });
    });

    if (totalScore > 0) results.push({ docIdx, score: totalScore, matches });
  });

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ─── NEW FUNCT ───────────────────────────────────────────────────────────────
function computePhraseBonus(queryTerms, termMap) {

    if (queryTerms.length < 2) return 0;

    let consecutive = 1;
    let best = 0;

    for (let i = 0; i < queryTerms.length - 1; i++) {

        const a = termMap.get(queryTerms[i]);
        const b = termMap.get(queryTerms[i + 1]);

        if (!a || !b) {
          consecutive = 1;
          continue;
        }

        let adjacent = false;

        for (const pa of a) {
            for (const pb of b) {

                if (pb.pos === pa.pos + 1) {
                    adjacent = true;
                    break;
                }
            }
            if (adjacent) break;
        }

        if (adjacent) {
            consecutive++;
            best = Math.max(best, consecutive);
        } else {
            consecutive = 1;
        }
    }

    return EXACT_PHRASE_BONUS * (best / queryTerms.length);
}

// ─── GitaSearch ───────────────────────────────────────────────────────────────
export class GitaSearch {
  constructor() {
    this.corpus = [];
    this.ready  = false;
    this._fuse  = null;
    this._invertedIndex = null;
    this._fieldConfigs  = null;
    this._mode  = null;
  }

  async init() {
    if (typeof Fuse === 'undefined') {
      console.error('[GitaSearch] Fuse is not loaded.');
      return;
    }

    const chapters = await Promise.all(
      Array.from({ length: TOTAL_CHAPTERS }, (_, i) => loadChapterData(i + 1))
    );

    this.corpus = [];

    chapters.forEach((chapterData, idx) => {
      const chapter = idx + 1;
      const info    = BG_CHAPTER_INFO[chapter];
      const verses  = chapterData?.Verses ?? [];

      verses.forEach(verse => {
        const ref = this._parseRef(verse['Text-num'] ?? '');
        if (!ref) return;

        const purportText = (verse['Purport-En'] ?? '').trim();
        const hasPurport = purportText.length > 0 && purportText !== NO_PURPORT_TEXT;

        this.corpus.push({
          chapter,
          ref,
          chapterTitle: info?.chapter_title ?? `Chapter ${chapter}`,
          translation:  (verse['Translation-En'] ?? '').trim(),
          verseText:    (verse['Verse-Text']     ?? '').trim(),
          purport:      purportText,
          hasPurport,
        });
      });
    });

    this._buildIndex('verse');
    this.ready = true;
  }

  search(term, mode = 'verse') {
    if (!this.ready) return [];
    const raw = (term || '').trim();
    if (!raw) return [];

    if (mode !== this._mode) this._buildIndex(mode);

    const query = buildQuery(raw);
    if (!query.scoringTerms.length) return [];

    const exactHits = exactSearch(this._invertedIndex, query, this._fieldConfigs);
    const exactResults = exactHits.map(r => ({
      item:    this._invertedIndex.docs[r.docIdx],
      score:   r.score,
      matches: r.matches,
    }));

    let fallbackResults = [];
    if (exactResults.length < MIN_EXACT_RESULTS) {
      const existingKeys = new Set(exactResults.map(r => r.item.chapter + ':' + r.item.ref));

      fallbackResults = this._fuse.search(query.phrase || raw)
        .filter(hit => !existingKeys.has(hit.item.chapter + ':' + hit.item.ref))
        .map(hit => ({ item: hit.item, score: 1 - hit.score, matches: hit.matches }))
        .sort((a, b) => b.score - a.score);
    }

    // Fallback (fuzzy) hits are always appended after exact hits — never
    // interleaved, so they can never outrank a real term/phrase match.
    return [...exactResults, ...fallbackResults];
  }

  getHighlightTerms(term) {
    return buildQuery(term).scoringTerms;
  }

  buildSnippet(result, mode) {
    const field = mode === 'purport' ? 'purport' : 'translation';
    const text  = result.item[field] ?? '';

    const allIndices = [];
    (result.matches || []).forEach(m => {
      if (m.key === field && m.indices) {
        m.indices.forEach(([s, e]) => {
          if ((e - s + 1) >= 3) {
            allIndices.push([s, e]);
          }
        });
      }
    });

    if (!allIndices.length || !text) {
      return this._escHtml(text.slice(0, 130)) + (text.length > 130 ? '…' : '');
    }

    const snappedIndices = allIndices.map(([s, e]) => snapToWordBoundaries(text, s, e));

    const mergedIndices = bridgeStopwordGaps(
      mergeOverlappingIndices(allIndices),
      text
    );

    let bestIdx = 0;
    let bestLen = 0;
    mergedIndices.forEach(([s, e], i) => {
      const len = e - s + 1;
      if (len > bestLen) { bestLen = len; bestIdx = i; }
    });

    const centerPos = mergedIndices[bestIdx][0];

    const textBeforeCenter = text.slice(0, centerPos);
    const wordIdx = textBeforeCenter.split(/\s+/).length - 1;

    const allWords = text.split(/\s+/);
    const from = Math.max(0, wordIdx - 5);
    const to   = Math.min(allWords.length, wordIdx + 8);

    let charPos = 0;
    const wordCharStarts = [];
    for (let i = 0; i < allWords.length; i++) {
      wordCharStarts.push(charPos);
      charPos += allWords[i].length + 1;
    }

    const sliceStart = wordCharStarts[from] ?? 0;
    const sliceEnd = (to < allWords.length ? wordCharStarts[to] : text.length) - 1;

    const sliceText = text.slice(sliceStart, sliceEnd);

    let highlighted = '';
    let lastIdx = 0;

    mergedIndices.forEach(([s, e]) => {
      const effStart = Math.max(s, sliceStart);
      const effEnd = Math.min(e, sliceEnd - 1);

      if (effStart > effEnd) return;

      const relStart = effStart - sliceStart;
      const relEnd = effEnd - sliceStart;

      if (relStart < lastIdx) return;

      highlighted += this._escHtml(sliceText.slice(lastIdx, relStart));
      highlighted += '<mark>' + this._escHtml(sliceText.slice(relStart, relEnd + 1)) + '</mark>';
      lastIdx = relEnd + 1;
    });

    highlighted += this._escHtml(sliceText.slice(lastIdx));

    return (
      (from > 0 ? '…' : '') +
      highlighted +
      (to < allWords.length ? '…' : '')
    );
  }

  _buildIndex(mode) {
    const fieldConfigs = mode === 'purport' ? FIELD_CONFIG_PURPORT : FIELD_CONFIG_VERSE;
    const keys   = mode === 'purport' ? KEYS_PURPORT : KEYS_VERSE;
    const source = mode === 'purport'
      ? this.corpus.filter(v => v.hasPurport)
      : this.corpus;

    // Fuse is now fallback-only (typo tolerance when exact search is thin).
    this._fuse          = new Fuse(source, { ...BASE_OPTIONS, keys });
    this._invertedIndex = new InvertedIndex(source, fieldConfigs);
    this._fieldConfigs  = fieldConfigs;
    this._mode          = mode;
  }

  _parseRef(textNum) {
    const ref = textNum.replace(/^TEXTS?\s+/i, '').trim();
    return ref || null;
  }

  _escHtml(str) {
    return escapeHtml(str);
  }
}

// ─── Fix: "bridging" pass that closes small gaps between marks ───────────────
function bridgeStopwordGaps(indices, text) {
  if (indices.length < 2) return indices;

  const sorted = [...indices].sort((a, b) => a[0] - b[0]);
  const bridged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = bridged[bridged.length - 1];
    const curr = sorted[i];

    const gapText = text.slice(prev[1] + 1, curr[0]).trim().toLowerCase();
    const gapWords = gapText.split(/\s+/).filter(Boolean);

    // Bridge if the gap is empty, or is made up entirely of short stopwords
    // (e.g. "is", "of", "the") — this is purely cosmetic and never touches scoring.
    const isBridgeable = gapWords.length <= 2 &&
      gapWords.every(w => STOPWORDS[w] || w.length <= 2);

    if (isBridgeable) {
      prev[1] = Math.max(prev[1], curr[1]);
    } else {
      bridged.push(curr);
    }
  }

  return bridged;
}

// ─── merge overlapping indices ────────────────────────────────────────────────
function mergeOverlappingIndices(indices) {
  if (!indices.length) return [];
  const sorted = [...indices].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

// ─── snap raw indices to whole-word boundaries (display-only) ─────────────────
// Fuse fallback matches are character-level and can land mid-word (e.g. a
// fuzzy match ending inside "maintainer"). This expands any such span so the
// rendered <mark> always starts and ends on a full word.
function snapToWordBoundaries(text, start, end) {
  const isWordChar = ch => /[\p{L}\p{N}]/u.test(ch || '');

  let s = start;
  while (s > 0 && isWordChar(text[s]) && isWordChar(text[s - 1])) s--;

  let e = end;
  while (e < text.length - 1 && isWordChar(text[e]) && isWordChar(text[e + 1])) e++;

  return [s, e];
}

// ─── html escape (standalone, shared) ──────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── highlight matched terms in full text (verse/purport display) ─────────
export function highlightTerms(text, terms) {
  if (!text) return '';
  if (!terms || !terms.length) return escapeHtml(text);

  const termSet = new Set(terms.map(normalizeWord));
  const spans = extractTokensWithOffsets(text)
    .filter(tok => termSet.has(tok.norm))
    .map(tok => [tok.start, tok.end]);

  if (!spans.length) return escapeHtml(text);

  const merged = bridgeStopwordGaps(mergeOverlappingIndices(spans), text);

  let result = '';
  let lastIdx = 0;
  merged.forEach(([s, e]) => {
    result += escapeHtml(text.slice(lastIdx, s));
    result += '<mark>' + escapeHtml(text.slice(s, e + 1)) + '</mark>';
    lastIdx = e + 1;
  });
  result += escapeHtml(text.slice(lastIdx));
  return result;
}