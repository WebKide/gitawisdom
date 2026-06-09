/**
 * fuse-search.js
 * Wisdom Oracle — Gītā corpus builder and Fuse.js search engine (v1.0.10)
 *
 * Loads all 18 chapter JSON files (already SW-cached), flattens them into a
 * single searchable corpus, and wraps Fuse.js for verse and purport search.
 *
 * Fuse is expected as a global loaded by js/lib/fuse.min.js before this module
 * is evaluated. A guard logs a clear error if it is missing.
 *
 * Renamed from search.js to fuse-search.js per v1.0.10 architecture.
 */

'use strict';

import { BG_CHAPTER_INFO, loadChapterData } from './gitacore.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_CHAPTERS = 18;

const BASE_OPTIONS = {
  threshold:          0.3,
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

    // Rebuild index only when mode changes — rebuilding is fast (<10 ms)
    if (mode !== this._mode) this._buildIndex(mode);

    return this._fuse.search(term.trim());
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

    if (!match || !text) {
      // Fallback: first 130 chars
      return this._escHtml(text.slice(0, 130)) + (text.length > 130 ? '…' : '');
    }

    const [matchStart] = match.indices[0] ?? [0, 0];
    const words        = text.split(/\s+/);

    // Locate the word that contains matchStart
    let charCount = 0;
    let wordIdx   = 0;
    for (let i = 0; i < words.length; i++) {
      if (charCount >= matchStart) { wordIdx = i; break; }
      charCount += words[i].length + 1; // +1 for the space
    }

    const from    = Math.max(0, wordIdx - 5);
    const to      = Math.min(words.length, wordIdx + 8);
    const prefix  = from > 0 ? '…' : '';
    const suffix  = to < words.length ? '…' : '';
    const snippet = prefix + words.slice(from, to).join(' ') + suffix;

    // Highlight the matched surface form
    const surface = (match.value ?? '').slice(...(match.indices[0] ?? [0, 0]));
    if (!surface) return this._escHtml(snippet);

    return this._escHtml(snippet).replace(
      new RegExp(this._escRegex(this._escHtml(surface)), 'gi'),
      m => `<mark>${m}</mark>`
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