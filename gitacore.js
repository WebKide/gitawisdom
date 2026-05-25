/**
 * gitacore.js
 * Complete JavaScript port of asitiscore.py by WebKide
 * All logic for validating, finding, and formatting Bhagavad Gītā verse data.
 */

'use strict';

// ─── Chapter metadata ────────────────────────────────────────────────────────
// Full 18-chapter table. grouped_ranges: verse numbers that appear as a
// combined TEXT in the source JSON (e.g. TEXTS 1-3).
const BG_CHAPTER_INFO = {
   1: { total_verses: 46, grouped_ranges: [[16,18],[21,22],[32,35],[37,38]], chapter_title: 'First. Observing the Armies on the Battlefield of Kurukṣetra' },
   2: { total_verses: 72, grouped_ranges: [[42,43]], chapter_title: 'Second. Contents of the Gītā Summarized' },
   3: { total_verses: 43, grouped_ranges: [], chapter_title: 'Third. Karma-yoga' },
   4: { total_verses: 42, grouped_ranges: [], chapter_title: 'Fourth. Transcendental Knowledge' },
   5: { total_verses: 29, grouped_ranges: [[8,9],[27,28]], chapter_title: 'Fifth. Karma-yoga — Action in Kṛṣṇa Consciousness' },
   6: { total_verses: 47, grouped_ranges: [[11,12],[13,14],[20,23]], chapter_title: 'Sixth. Sāṅkhya-yoga' },
   7: { total_verses: 30, grouped_ranges: [], chapter_title: 'Seventh. Knowledge of the Absolute' },
   8: { total_verses: 28, grouped_ranges: [], chapter_title: 'Eighth. Attaining the Supreme' },
   9: { total_verses: 34, grouped_ranges: [], chapter_title: 'Ninth. The Most Confidential Knowledge' },
  10: { total_verses: 42, grouped_ranges: [[4,5],[12,13]], chapter_title: 'Tenth. The Opulence of the Absolute' },
  11: { total_verses: 55, grouped_ranges: [[10,11],[26,27],[41,42]], chapter_title: 'Eleventh. The Universal Form' },
  12: { total_verses: 20, grouped_ranges: [[3,4],[6,7],[13,14],[18,19]], chapter_title: 'Twelfth. Devotional Service' },
  13: { total_verses: 35, grouped_ranges: [[1,2],[6,7],[8,12]], chapter_title: 'Thirteenth. Nature, the Enjoyer, and Consciousness' },
  14: { total_verses: 27, grouped_ranges: [[22,25]], chapter_title: 'Fourteenth. The Three Modes of Material Nature' },
  15: { total_verses: 20, grouped_ranges: [[3,4]], chapter_title: 'Fifteenth. The Yoga of the Supreme Person' },
  16: { total_verses: 24, grouped_ranges: [[1,3],[11,12],[13,15]], chapter_title: 'Sixteenth. The Divine and Demoniac Natures' },
  17: { total_verses: 28, grouped_ranges: [[5,6],[8,10],[26,27]], chapter_title: 'Seventeenth. The Divisions of Faith' },
  18: { total_verses: 78, grouped_ranges: [[13,14],[36,37],[51,53]], chapter_title: 'Eighteenth. Conclusion — The Perfection of Renunciation' },
};

// ─── Constants (mirrored from Python) ────────────────────────────────────────
const AUTHOR_NAME   = 'Bhagavad Gītā — As It Is (Original 1972 edition)';
const AUTHOR_ICON   = 'https://i.imgur.com/iZ6CHAz.png';
const FOOTER_ICON   = 'https://i.imgur.com/10jxmCh.png';
const SIGNATURE_URL = 'https://i.imgur.com/BGsgSOi.png';
const DEDICATORY    = 'oṁ namo bhagavate vāsudevāya';
const NO_PURPORT    = [
  'This śloka does not contain a purport.',
  'No purport for this śloka.',
  'There is no purport provided for this śloka.',
  'This verse has no accompanying purport.',
  'This śloka does not include a Bhaktivedānta purport.',
  'No Bhaktivedānta purport provided for this verse.',
  'No Bhaktivedānta purport accompanies this śloka.',
];

// Chapter cache — avoids re-fetching the same JSON file
const _chapterCache = {};

// ─── loadChapterData ──────────────────────────────────────────────────────────
/**
 * Fetch and cache a chapter's JSON data.
 * @param {number} chapter
 * @returns {Promise<object>}
 */
async function loadChapterData(chapter) {
  if (_chapterCache[chapter]) return _chapterCache[chapter];

  const pad   = String(chapter).padStart(2, '0');
  const url   = `gita/bg_ch${pad}.json`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Chapter ${chapter} data file not found (${resp.status})`);

  const data            = await resp.json();
  _chapterCache[chapter] = data;
  return data;
}

// ─── validateVerse ────────────────────────────────────────────────────────────
/**
 * Port of Python validate_verse().
 * @param {number} chapter
 * @param {string} verse  — e.g. "4", "1-3", "32-35"
 * @returns {{ valid: boolean, ref: string }}
 */
function validateVerse(chapter, verse) {
  const ch = Number(chapter);
  if (!BG_CHAPTER_INFO[ch]) {
    return { valid: false, ref: `Invalid chapter. The Bhagavad Gītā As It Is has 18 chapters — and you requested ${ch}.` };
  }
  const info = BG_CHAPTER_INFO[ch];

  if (String(verse).includes('-')) {
    const parts = String(verse).split('-').map(Number);
    if (parts.some(isNaN)) {
      return { valid: false, ref: 'Invalid verse range format. Use e.g. 15-19, or just any single verse number, e.g. 17.' };
    }
    let [start, end] = parts.sort((a, b) => a - b);
    if (start >= end)  return { valid: false, ref: 'Start verse must be less than end verse.' };
    if (start < 1)     return { valid: false, ref: 'Verse numbers start at 1.' };
    if (end > info.total_verses) {
      return { valid: false, ref: `Chapter ${ch} only has ${info.total_verses} verses.` };
    }
    // Check if it's an exact canonical grouped range
    for (const [rs, re] of info.grouped_ranges) {
      if (start === rs && end === re) return { valid: true, ref: `${start}-${end}` };
    }
    return { valid: true, ref: `${start}-${end}` };
  }

  const verseNum = parseInt(verse, 10);
  if (isNaN(verseNum)) {
    return { valid: false, ref: `"${verse}" is not a valid verse number.` };
  }
  if (verseNum < 1 || verseNum > info.total_verses) {
    return { valid: false, ref: `Chapter ${ch} only has ${info.total_verses} verses — double-check and try again.` };
  }
  // Redirect single verse that falls inside a grouped range
  for (const [rs, re] of info.grouped_ranges) {
    if (verseNum >= rs && verseNum <= re) return { valid: true, ref: `${rs}-${re}` };
  }
  return { valid: true, ref: String(verseNum) };
}

// ─── findVerseData ────────────────────────────────────────────────────────────
/**
 * Port of Python find_verse_data().
 * Three-pass lookup: exact match → substring → start-verse fallback.
 * @param {object} chapterData
 * @param {string} verseRef   — normalised ref, e.g. "4" or "1-3"
 * @returns {object}
 */
function findVerseData(chapterData, verseRef) {
  const base = String(verseRef);
  const verses = chapterData.Verses ?? [];

  // Pass 1 — exact "TEXT X" or "TEXTS X"
  for (const vd of verses) {
    const tn = (vd['Text-num'] ?? '').trim();
    if (`TEXT ${base}` === tn || `TEXTS ${base}` === tn) return vd;
  }
  // Pass 2 — substring
  for (const vd of verses) {
    if ((vd['Text-num'] ?? '').includes(base)) return vd;
  }
  // Pass 3 — match only the start verse number
  const startVerse = base.split('-')[0];
  for (const vd of verses) {
    const tn = vd['Text-num'] ?? '';
    // match the start number as a whole token inside the Text-num string
    if (new RegExp(`\\b${startVerse}\\b`).test(tn)) return vd;
  }
  throw new Error(`Verse ${verseRef} not found in chapter data.`);
}

// ─── formatVerseText ──────────────────────────────────────────────────────────
/**
 * Port of Python format_verse_text().
 * Splits on newlines (preserving the half-śloka structure), prepends uvāca line.
 * @param {object} verseData
 * @returns {string}  — plain text with \n separators
 */
function formatVerseText(verseData) {
  const raw   = verseData['Verse-Text'] ?? '';
  const lines = [];
  let current = '';
  let inBold  = false;

  for (const char of raw) {
    if (char === ';' && !inBold) {
      if (current.trim()) lines.push(current.trim());
      current = '';
      continue;
    }
    current += char;
    if (char === '*') inBold = !inBold;
    if (char === '\n') {
      if (current.trim()) lines.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) lines.push(current.trim());

  let formatted = lines.join('\n');

  if (verseData['Uvaca-line']) {
    let uvaca = verseData['Uvaca-line'].trim();
    if (!/[:\-—]$/.test(uvaca)) uvaca += ':';
    formatted = `${uvaca}\n${formatted}`;
  }
  return formatted;
}

// ─── formatSynonyms ───────────────────────────────────────────────────────────
/**
 * Port of Python format_synonyms().
 * Returns an array of HTML-ish strings: italic-bold word + em-dash + meaning.
 * For the web we return structured objects instead of Discord markdown.
 * @param {string} raw
 * @returns {Array<{word: string, meaning: string}>}
 */
function formatSynonyms(raw) {
  if (!raw || !raw.trim()) return [{ word: '', meaning: 'No synonyms available.' }];

  const normalised = raw.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const items = [];
  const sanskritChars = /[āīūṁṣṭḥśḍṛñṇḷṅ]/i;

  for (const item of normalised.split(';')) {
    const t = item.trim();
    if (!t) continue;

    if (t.includes('—')) {
      const idx = t.indexOf('—');
      items.push({ word: t.slice(0, idx).trim(), meaning: t.slice(idx + 1).trim() });
    } else if (t.includes('-') && !sanskritChars.test(t)) {
      const idx = t.indexOf('-');
      items.push({ word: t.slice(0, idx).trim(), meaning: t.slice(idx + 1).trim() });
    } else {
      items.push({ word: '', meaning: t });
    }
  }
  return items;
}

// ─── Navigation helpers ───────────────────────────────────────────────────────
/**
 * Given a current chapter + verseRef, compute the previous verse reference.
 * Cycles from chapter 1 verse 1 → chapter 18 last verse 78 (wraps around).
 * @param {number} chapter
 * @param {string} verseRef
 * @returns {{ chapter: number, ref: string }}
 */
function prevVerse(chapter, verseRef) {
  const info      = BG_CHAPTER_INFO[chapter];
  const startNum  = parseInt(String(verseRef).split('-')[0], 10);

  if (startNum <= 1) {
    // Go to previous chapter, last verse
    const prevCh   = chapter === 1 ? 18 : chapter - 1;
    const prevInfo = BG_CHAPTER_INFO[prevCh];
    const { valid, ref } = validateVerse(prevCh, String(prevInfo.total_verses));
    return { chapter: prevCh, ref };
  }

  // Step back one, respecting grouped ranges
  const { valid, ref } = validateVerse(chapter, String(startNum - 1));
  return { chapter, ref };
}

/**
 * Given a current chapter + verseRef, compute the next verse reference.
 * Cycles from chapter 18 last verse 78 → chapter 1 verse 1 (wraps around).
 * @param {number} chapter
 * @param {string} verseRef
 * @returns {{ chapter: number, ref: string }}
 */
function nextVerse(chapter, verseRef) {
  const info    = BG_CHAPTER_INFO[chapter];
  const endNum  = parseInt(String(verseRef).split('-').pop(), 10);

  if (endNum >= info.total_verses) {
    // Go to next chapter, verse 1
    const nextCh = chapter === 18 ? 1 : chapter + 1;
    const { valid, ref } = validateVerse(nextCh, '1');
    return { chapter: nextCh, ref };
  }

  const { valid, ref } = validateVerse(chapter, String(endNum + 1));
  return { chapter, ref };
}

/**
 * Pick a truly random verse across all 18 chapters.
 * @returns {{ chapter: number, ref: string }}
 */
function randomVerse() {
  const chapters  = Object.keys(BG_CHAPTER_INFO).map(Number);
  const chapter   = chapters[Math.floor(Math.random() * chapters.length)];
  const total     = BG_CHAPTER_INFO[chapter].total_verses;
  const verseNum  = Math.floor(Math.random() * total) + 1;
  const { ref }   = validateVerse(chapter, String(verseNum));
  return { chapter, ref };
}

/**
 * Build footer label — mirrors Python build_footer_text().
 * @param {number} chapter
 * @param {string} verseRef
 * @returns {string}
 */
function buildFooterText(chapter, verseRef) {
  const isRange = String(verseRef).includes('-');
  const vLabel  = isRange ? `verses ${verseRef}` : `verse ${verseRef}`;
  const total   = BG_CHAPTER_INFO[chapter].total_verses;
  return `Chapter ${chapter}, ${vLabel} (of ${total})`;
}

/**
 * Returns the colophon text if this is the last verse in its chapter.
 * @param {number} chapter
 * @param {string} verseRef
 * @returns {string|null}
 */
function chapterColophon(chapter, verseRef) {
  const endNum = parseInt(String(verseRef).split('-').pop(), 10);
  if (endNum !== BG_CHAPTER_INFO[chapter].total_verses) return null;
  const [ordinal, title] = BG_CHAPTER_INFO[chapter].chapter_title.split('. ');
  return `Thus end the Bhaktivedānta Purports to the ${ordinal} Chapter of the Śrīmad Bhagavad-gītā in the matter of ${title}.`;
}

// Export everything for app.js
export {
  BG_CHAPTER_INFO,
  AUTHOR_NAME,
  AUTHOR_ICON,
  FOOTER_ICON,
  SIGNATURE_URL,
  DEDICATORY,
  NO_PURPORT,
  loadChapterData,
  validateVerse,
  findVerseData,
  formatVerseText,
  formatSynonyms,
  buildFooterText,
  chapterColophon,
  prevVerse,
  nextVerse,
  randomVerse,
};
