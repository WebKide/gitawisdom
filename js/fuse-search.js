/**
 * fuse-search.js
 * Wisdom Oracle — Gītā corpus builder and Fuse.js search engine
 *
 * Loads all 18 chapter JSON files (already SW-cached), flattens them into a
 * single searchable corpus, and wraps Fuse.js for verse and purport search.
 *
 * Fuse is expected as a global loaded by js/lib/fuse.min.js before this module
 * is evaluated. A guard logs a clear error if it is missing.
 */

'use strict';

import { BG_CHAPTER_INFO, loadChapterData } from './gitacore.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_CHAPTERS = 18;

const BASE_OPTIONS = {
  threshold:          0.4,
  ignoreLocation:     true,
  includeScore:       true,
  includeMatches:     true,
  minMatchCharLength: 2,
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
    .replace(/[^\w\s]/g, ' ')
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
    this.corpus = [];   // flat array — one object per verse / grouped verse
    this.ready  = false;
    this._fuse  = null;
    this._mode  = 'verse';
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  /**
   * Load all 18 chapters and build the Fuse index.
   * Returns a promise that resolves when indexing is complete.
   *
   * @returns {Promise<void>}
   */
  async init() {
    if (typeof Fuse === 'undefined') {
      console.error('[GitaSearch] Fuse is not loaded. Ensure js/lib/fuse.min.js is included before app.js.');
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
        if (!ref) return; // skip malformed / comment-only entries

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

  /**
   * Run a fuzzy search.
   *
   * @param {string}           term — the search query
   * @param {'verse'|'purport'} mode — which field set to search
   * @returns {Array} Fuse result objects with item, score, and matches
   */
  search(term, mode = 'verse') {
    if (!this.ready || !term.trim()) return [];

    if (mode !== this._mode) this._buildIndex(mode);

    var q = buildQuery(term);

    // If only one word → normal Fuse search
    if (!q.phrase || q.phrase === q.anchor) {
      return this._fuse.search(q.anchor || q.phrase);
    }

    // Phrase search (primary signal)
    var phraseResults = this._fuse.search(q.phrase);

    // Anchor fallback (secondary signal)
    var anchorResults = q.anchor
      ? this._fuse.search(q.anchor)
      : [];

    return mergeResults(phraseResults, anchorResults);
  }


  /**
   * Extract a ~12-word highlighted snippet from a Fuse match.
   * Returns an HTML string; matched region is wrapped in <mark>.
   *
   * @param {object}            result — Fuse result object
   * @param {'verse'|'purport'} mode   — which field the match is in
   * @returns {string} HTML snippet with highlighted matches
   */
  buildSnippet(result, mode) {
    const field = mode === 'purport' ? 'purport' : 'translation';
    const text  = result.item[field] ?? '';

    const match = result.matches?.find(m => m.key === field);

    if (!match || !match.indices || !text) {
      return this._escHtml(text.slice(0, 130)) + (text.length > 130 ? '…' : '');
    }

    // STEP 1: build fully highlighted full text
    let highlighted = '';
    let lastIndex = 0;

    const indices = match.indices;

    for (let i = 0; i < indices.length; i++) {
      const [start, end] = indices[i];

      // skip tiny noise matches
      if ((end - start) < 2) continue;

      highlighted += this._escHtml(text.slice(lastIndex, start));
      highlighted += '<mark>' +
                     this._escHtml(text.slice(start, end + 1)) +
                     '</mark>';
      lastIndex = end + 1;
    }

    highlighted += this._escHtml(text.slice(lastIndex));

    // STEP 2: now slice context around FIRST match position
    const first = indices[0]?.[0] ?? 0;

    const words = highlighted.split(/\s+/);

    let charCount = 0;
    let wordIdx = 0;

    for (let i = 0; i < words.length; i++) {
      if (charCount >= first) {
        wordIdx = i;
        break;
      }
      charCount += words[i].length + 1;
    }

    const from = Math.max(0, wordIdx - 5);
    const to   = Math.min(words.length, wordIdx + 8);

    return (
      (from > 0 ? '…' : '') +
      words.slice(from, to).join(' ') +
      (to < words.length ? '…' : '')
    );
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Rebuilds the Fuse index with the appropriate keys for the current mode.
   * @param {'verse'|'purport'} mode
   */
  _buildIndex(mode) {
    const keys  = mode === 'purport' ? KEYS_PURPORT : KEYS_VERSE;
    this._fuse  = new Fuse(this.corpus, { ...BASE_OPTIONS, keys });
    this._mode  = mode;
  }

  /**
   * Parses a "TEXT 4" or "TEXTS 26-27" string into a canonical ref.
   * "TEXT 4" → "4"  |  "TEXTS 26-27" → "26-27"  |  "" → null
   *
   * @param {string} textNum — the raw Text-num field from JSON
   * @returns {string|null} the canonical reference or null if malformed
   */
  _parseRef(textNum) {
    const ref = textNum.replace(/^TEXTS?\s+/i, '').trim();
    return ref || null;
  }

  /**
   * Escapes HTML special characters.
   * @param {string} str
   * @returns {string}
   */
  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Escapes regex special characters for safe inclusion in a RegExp.
   * @param {string} str
   * @returns {string}
   */
  _escRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ─── merge helper (IMPORTANT) ─────────────────────────────────────────────────
function mergeResults(a, b) {
  var map = new Map();

  function add(list, weight) {
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var key = item.item.chapter + ':' + item.item.ref;

      if (!map.has(key)) {
        map.set(key, {
          item: item.item,
          score: item.score * weight,
          matches: item.matches
        });
      } else {
        var existing = map.get(key);
        existing.score = Math.min(existing.score, item.score * weight);
      }
    }
  }

  add(a, 1.0);   // phrase = higher priority
  add(b, 1.15);  // anchor = slightly lower priority

  return Array.from(map.values())
    .sort((x, y) => x.score - y.score);
}