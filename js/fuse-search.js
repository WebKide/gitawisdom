/**
 * fuse-search.js
 * Wisdom Oracle — Gītā corpus builder and Fuse.js search engine
 */

'use strict';

import { BG_CHAPTER_INFO, loadChapterData } from './gitacore.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_CHAPTERS = 18;

const BASE_OPTIONS = {
  threshold:          0.35,  // ← FIX A: tighter threshold (was 0.4)
  ignoreLocation:     false,  // ← FIX A: require matches near their natural position (was true)
  includeScore:       true,
  includeMatches:     true,
  minMatchCharLength: 3,      // ← FIX A: require 3+ chars (was 2)
  ignoreDiacritics:   true,
  distance:           64,     // ← FIX A: limit how far matches can stray from expected position
};

const KEYS_VERSE   = [
  { name: 'translation', weight: 0.7 },
  { name: 'verseText',   weight: 0.3 },
];

const KEYS_PURPORT = [
  { name: 'purport', weight: 1.0 },
];

const STOPWORDS = {
  the: true, a: true, an: true,
  of: true, in: true, on: true,
  for: true, to: true, and: true, is: true,
  not: true
};

function buildQuery(term) {
  if (!term) return { phrase: '', anchor: '' };

  var words = term
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .split(/\s+/);

  // remove leading stopwords only for phrase
  while (words.length && STOPWORDS[words[0]]) {
    words.shift();
  }

  var phrase = words.join(' ');
  var anchor = words[0] || '';

  return { phrase: phrase, anchor: anchor };
}

// ─── GitaSearch ───────────────────────────────────────────────────────────────
export class GitaSearch {
  constructor() {
    this.corpus = [];
    this.ready  = false;
    this._fuse  = null;
    this._mode  = 'verse';
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

        this.corpus.push({
          chapter,
          ref,
          chapterTitle: info?.chapter_title ?? `Chapter ${chapter}`,
          translation:  (verse['Translation-En'] ?? '').trim(),
          verseText:    (verse['Verse-Text']     ?? '').trim(),
          purport:      (verse['Purport-En']     ?? '').trim(),
        });
      });
    });

    this._buildIndex('verse');
    this.ready = true;
  }

  search(term, mode = 'verse') {
    if (!this.ready || !term.trim()) return [];

    if (mode !== this._mode) this._buildIndex(mode);

    var q = buildQuery(term);

    // Single word: search once
    if (!q.phrase.includes(' ')) {
      if (!q.phrase || q.phrase.length < BASE_OPTIONS.minMatchCharLength) {
        return [];
      }
      return this._fuse.search(q.phrase || q.anchor);
    }

    // Multi-word: phrase search (primary) + anchor fallback (secondary)
    var phraseResults = this._fuse.search(q.phrase);
    var anchorResults = q.anchor && q.anchor.length >= BASE_OPTIONS.minMatchCharLength
      ? this._fuse.search(q.anchor)
      : [];

    return mergeResults(phraseResults, anchorResults);
  }

  buildSnippet(result, mode) {
    const field = mode === 'purport' ? 'purport' : 'translation';
    const text  = result.item[field] ?? '';

    // Collect all match indices for this field, merge overlaps
    const allIndices = [];
    (result.matches || []).forEach(m => {
      if (m.key === field && m.indices) {
        m.indices.forEach(([s, e]) => {
          if ((e - s + 1) >= 3) {  // ← FIX B: filter tiny matches
            allIndices.push([s, e]);
          }
        });
      }
    });

    if (!allIndices.length || !text) {
      return this._escHtml(text.slice(0, 130)) + (text.length > 130 ? '…' : '');
    }

    // ← FIX B: merge overlapping/adjacent indices
    const mergedIndices = mergeOverlappingIndices(allIndices);

    // Find the best (longest) match to center the snippet around
    let bestIdx = 0;
    let bestLen = 0;
    mergedIndices.forEach(([s, e], i) => {
      const len = e - s + 1;
      if (len > bestLen) { bestLen = len; bestIdx = i; }
    });

    const centerPos = mergedIndices[bestIdx][0];

    // Extract word window around center position
    const textBeforeCenter = text.slice(0, centerPos);
    const wordIdx = textBeforeCenter.split(/\s+/).length - 1;

    const allWords = text.split(/\s+/);
    const from = Math.max(0, wordIdx - 5);
    const to   = Math.min(allWords.length, wordIdx + 8);

    // Build character position map: word index → char position in text
    let charPos = 0;
    const wordCharStarts = [];
    for (let i = 0; i < allWords.length; i++) {
      wordCharStarts.push(charPos);
      charPos += allWords[i].length + 1; // +1 for space
    }

    const sliceStart = wordCharStarts[from] ?? 0;
    const sliceEnd = (to < allWords.length ? wordCharStarts[to] : text.length) - 1;

    const sliceText = text.slice(sliceStart, sliceEnd);

    // Apply highlights within slice (slice-relative positions)
    let highlighted = '';
    let lastIdx = 0;

    mergedIndices.forEach(([s, e]) => {
      // Clamp to slice bounds
      const effStart = Math.max(s, sliceStart);
      const effEnd = Math.min(e, sliceEnd - 1);

      if (effStart > effEnd) return;

      const relStart = effStart - sliceStart;
      const relEnd = effEnd - sliceStart;

      if (relStart < lastIdx) return; // skip if already processed

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
    const keys  = mode === 'purport' ? KEYS_PURPORT : KEYS_VERSE;
    this._fuse  = new Fuse(this.corpus, { ...BASE_OPTIONS, keys });
    this._mode  = mode;
  }

  _parseRef(textNum) {
    const ref = textNum.replace(/^TEXTS?\s+/i, '').trim();
    return ref || null;
  }

  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

// ─── merge overlapping indices ────────────────────────────────────────────────
function mergeOverlappingIndices(indices) {
  if (!indices.length) return [];
  const sorted = [...indices].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr[0] <= last[1] + 1) { // overlapping or adjacent
      last[1] = Math.max(last[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

// ─── merge results ──────────────────────────────────────────────────────────
function mergeResults(a, b) {
  var map = new Map();

  function add(list, weight) {
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var key = item.item.chapter + ':' + item.item.ref;

      if (!map.has(key)) {
        // ← FIX C: deduplicate and merge match indices before storing
        const mergedMatches = mergeMatchIndices(item.matches);
        map.set(key, {
          item: item.item,
          score: item.score * weight,
          rawScore: item.score,
          matches: mergedMatches
        });
      } else {
        var existing = map.get(key);
        var newWeighted = item.score * weight;
        if (newWeighted < existing.score) {
          existing.score = newWeighted;
          existing.rawScore = item.score;
        }
        // Merge and deduplicate match indices
        if (item.matches) {
          existing.matches = mergeMatchArrays(existing.matches, item.matches);
        }
      }
    }
  }

  add(a, 1.0);
  add(b, 1.15);

  return Array.from(map.values())
    .map(({ item, score, matches }) => ({ item, score, matches }))
    .sort((x, y) => x.score - y.score);
}

// ← FIX C: merge match indices within a single matches array
function mergeMatchIndices(matches) {
  if (!matches) return [];
  const byKey = {};
  matches.forEach(m => {
    if (!m.indices) return;
    const k = m.key || 'default';
    if (!byKey[k]) byKey[k] = [];
    m.indices.forEach(([s, e]) => {
      if ((e - s + 1) >= 3) { // filter tiny matches
        byKey[k].push([s, e]);
      }
    });
  });
  const result = [];
  Object.keys(byKey).forEach(key => {
    const merged = mergeOverlappingIndices(byKey[key]);
    merged.forEach(([s, e]) => {
      result.push({ key, indices: [[s, e]], score: 0 });
    });
  });
  return result;
}

// ← FIX C: merge two matches arrays from different searches
function mergeMatchArrays(a, b) {
  const byKey = {};
  [...(a || []), ...(b || [])].forEach(m => {
    if (!m.indices) return;
    const k = m.key || 'default';
    if (!byKey[k]) byKey[k] = [];
    m.indices.forEach(([s, e]) => {
      if ((e - s + 1) >= 3) {
        byKey[k].push([s, e]);
      }
    });
  });
  const result = [];
  Object.keys(byKey).forEach(key => {
    const merged = mergeOverlappingIndices(byKey[key]);
    merged.forEach(([s, e]) => {
      result.push({ key, indices: [[s, e]], score: 0 });
    });
  });
  return result;
}