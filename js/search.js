/**
 * search.js
 * Offline search module for Gītā Wisdom app v1.0.8
 * Handles: offline caching, dual-mode search, snippet builder, pagination, hotlink rendering
 * Offline caching – All JSON is indexed once at module initialization.
 * Dual-mode search – verse or purport search.
 * Snippet builder – Returns 5 words before and after, highlights search term(s) in <b>.
 * Pagination – 50 results per page (pageSize adjustable), nextPage() method.
 * Hotlink support – getVerse(id) returns full verse/purport for linking.
 * Blacklist common words – Hardcoded for now; can be extended or loaded dynamically.
 * Multi-word fuzzy search – Treat with care
 */

import MiniSearch from 'minisearch';

export class GitaSearch {
  constructor(jsonData, options = {}) {
    this.jsonData = jsonData;
    this.pageSize = options.pageSize || 50;
    this.blacklist = options.blacklist || [
      'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'is', 'are', 'be', 'by', 'for', 'with'
    ];

    // Prepare MiniSearch
    this.miniSearch = new MiniSearch({
      fields: ['text', 'purport'],
      storeFields: ['id', 'chapter', 'text', 'purport'],
      searchOptions: {
        prefix: true,
        fuzzy: 0.2
      }
    });

    this.indexData();
    this.currentResults = [];
    this.currentPage = 0;
    this.currentTerm = '';
    this.currentMode = 'verse'; // default mode
  }

  // --- Index all verses into MiniSearch ---
  indexData() {
    const verses = this.jsonData.Verses.map(v => ({
      id: v["Text-num"],
      chapter: this.jsonData["Chapter-Desc"].split('.')[0], // simple chapter number
      text: v["Verse-Text"] || '',
      purport: v["Purport-En"] || ''
    }));
    this.miniSearch.addAll(verses);
  }

  // --- Normalize search term (remove common words) ---
  normalizeTerm(term) {
    return term
      .split(/\s+/)
      .filter(word => !this.blacklist.includes(word.toLowerCase()))
      .join(' ')
      .trim();
  }

  // --- Perform search ---
  search(term, mode = 'verse') {
    term = this.normalizeTerm(term);
    if (!term) return [];

    this.currentTerm = term;
    this.currentMode = mode;
    this.currentPage = 0;

    this.currentResults = this.miniSearch.search(term, {
      fields: mode === 'verse' ? ['text'] : ['purport'],
      prefix: true,
      fuzzy: 0.2
    });

    return this.paginate();
  }

  // --- Return current page results ---
  paginate() {
    const start = this.currentPage * this.pageSize;
    const end = start + this.pageSize;
    const slice = this.currentResults.slice(start, end);

    return slice.map(r => ({
      id: r.id,
      chapter: r.chapter,
      snippet: this.buildSnippet(this.currentMode === 'verse' ? r.text : r.purport)
    }));
  }

  // --- Move to next page ---
  nextPage() {
    if ((this.currentPage + 1) * this.pageSize >= this.currentResults.length) return [];
    this.currentPage++;
    return this.paginate();
  }

  // --- Build snippet around first match of term ---
  buildSnippet(text) {
    if (!text) return '';

    const words = text.split(/\s+/);
    const termWords = this.currentTerm.split(/\s+/);
    let index = -1;

    // Find first occurrence of any term word
    for (let i = 0; i < words.length; i++) {
      for (const tw of termWords) {
        if (words[i].toLowerCase().includes(tw.toLowerCase())) {
          index = i;
          break;
        }
      }
      if (index !== -1) break;
    }

    if (index === -1) {
      return text.length > 100 ? text.slice(0, 100) + '...' : text;
    }

    const start = Math.max(0, index - 5);
    const end = Math.min(words.length, index + 6);

    return words.slice(start, end)
      .map(w => termWords.some(tw => w.toLowerCase().includes(tw.toLowerCase())) ? `<b>${w}</b>` : w)
      .join(' ');
  }

  // --- Get full verse by id ---
  getVerse(id) {
    const v = this.jsonData.Verses.find(v => v["Text-num"] === id);
    if (!v) return null;
    return {
      id: v["Text-num"],
      chapter: this.jsonData["Chapter-Desc"].split('.')[0],
      text: v["Verse-Text"] || '',
      purport: v["Purport-En"] || ''
    };
  }

  // --- Reset search ---
  reset() {
    this.currentResults = [];
    this.currentPage = 0;
    this.currentTerm = '';
    this.currentMode = 'verse';
  }
}