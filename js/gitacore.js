/**
 * gitacore.js
 * Complete JavaScript port of asitiscore.py by WebKide
 * All logic for validating, finding, and formatting Bhagavad Gītā verse data.
 */

'use strict';

// ─── Chapter metadata ────────────────────────────────────────────────────────
// Full 18-chapter table.
// grouped_ranges: verse numbers stored as a combined TEXT in the JSON
//   e.g. TEXTS 1-3 means verses 1, 2, 3 share one entry.
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

// ─── Constants ────────────────────────────────────────────────────────────────
const AUTHOR_NAME   = 'Bhagavad Gītā — As It Is (1972 Macmillan Unabriged Edition)';
const AUTHOR_ICON   = 'assets/images/ACBhaktivedantaSwami.png';
const FOOTER_ICON   = 'assets/images/imgfooter.png';
const SIGNATURE_URL = 'assets/images/signature.svg';
const DEDICATORY    = 'oṁ namo bhagavate vāsudevāya';

// Random closing salutations — one is picked each time a purport is rendered
const DEDICATORY_CLOSINGS = [
  'Be happy in Kṛṣṇa consciousness.<br />Your ever well-wisher,',
  'Hope this meets you in good health.<br />Your ever well-wisher,',
  'Hoping this meets you well, and looking forward to seeing you again.<br />Your ever well-wisher,',
  'I am depending on you all to carry on this great mission in my absence. Chant and hear, and Kṛṣṇa will bless you.<br />Your ever well-wisher,',
  'I am very pleased with your endeavor. I hope you are well.<br />Your ever well-wisher,',
  'I hope this meets you in good health and cheerful mood.<br />Your ever well-wisher,',
  'I hope you are all well.<br />Your ever well-wisher,',
  'I hope you are feeling well.<br />Your ever well-wisher,',
  'I hope your questions are fully answered. I shall look forward to seeing you all again.<br />Your ever well-wisher,',
  'Please convey my blessings to your good wife. I hope you are both well.<br />Your ever well-wisher,',
  'Please follow these principles sincerely.<br />Your ever well-wisher,',
  'Please keep me informed of your progress.<br />Your ever well-wisher,',
  'Please offer my blessings to all the devotees.<br />Your ever well-wisher,',
  'Thank you once more for your great service. I hope you are well.<br />Your ever well-wisher,',
  'Thank you very much again for your sincere service to Kṛṣṇa. Kṛṣṇa’s blessings are always upon you.<br />Your ever well-wisher,',
  'Thank you very much for your sincere service. I hope you are well.<br />Your ever well-wisher,',
  'Thanking you once more for your sincere service, I hope you are well.<br />Your ever well-wisher,',
];

// Randomised "no purport" messages — intentionally varied (M5: NOT a bug, keep random)
const NO_PURPORT = [
  'No Bhaktivedānta purport accompanies this śloka.',
  'No Bhaktivedānta purport provided for this verse.',
  'No commentary was writte for this śloka.',
  'No explanatory purport is included for this verse.',
  'No purport for this śloka.',
  'No purport is attached to this śloka.',
  'Purport not written for this verse.',
  'There is no purport for this particular verse.',
  'There is no purport provided for this śloka.',
  'This verse comes without a purport.',
  'This verse has no accompanying purport.',
  'This śloka does not contain a purport.',
  'This śloka does not include a Bhaktivedānta purport.',
  'This śloka stands without a purport.',
];

// Chapter JSON cache — avoids re-fetching the same file
const _chapterCache = {};

// ─── loadChapterData ──────────────────────────────────────────────────────────
/**
 * Fetch and cache a chapter's JSON data.
 * @param {number} chapter
 * @returns {Promise<object>}
 */
async function loadChapterData(chapter) {
  if (_chapterCache[chapter]) return _chapterCache[chapter];

  const pad  = String(chapter).padStart(2, '0');
  const url  = `assets/gita/bg_ch${pad}.json`;
  const resp = await fetch(url);

  if (!resp.ok) throw new Error(`Chapter ${chapter} data not found (HTTP ${resp.status})`);

  const data             = await resp.json();
  _chapterCache[chapter] = data;
  return data;
}

// ─── validateVerse ────────────────────────────────────────────────────────────
/**
 * Accepts a SINGLE INTEGER verse number from the user.
 * Hyphens / ranges are NEVER typed by the user — they are resolved internally.
 *
 * Returns:
 *   { valid: true,  ref: "4" | "1-3" }   — ref is the canonical lookup key
 *   { valid: false, ref: "<error message>" }
 *
 * @param {number|string} chapter
 * @param {number|string} verse  — must be a plain integer
 * @returns {{ valid: boolean, ref: string }}
 */
function validateVerse(chapter, verse) {
  const ch = Number(chapter);

  // Unknown chapter
  if (!BG_CHAPTER_INFO[ch]) {
    return {
      valid: false,
      ref: `Invalid chapter. The Bhagavad Gītā As It Is has 18 chapters — you requested chapter ${ch}.`,
    };
  }

  const info     = BG_CHAPTER_INFO[ch];
  const verseNum = parseInt(String(verse), 10);

  // Must be a plain integer
  if (isNaN(verseNum)) {
    return { valid: false, ref: `"${verse}" is not a valid verse number. Please enter a whole number.` };
  }

  // Out-of-range check
  if (verseNum < 1 || verseNum > info.total_verses) {
    return {
      valid: false,
      ref: `Chapter ${ch} has ${info.total_verses} verse${info.total_verses > 1 ? 's' : ''} — verse ${verseNum} is out of range.`,
    };
  }

  // If the verse falls inside a canonical grouped range, redirect to that range
  for (const [rs, re] of info.grouped_ranges) {
    if (verseNum >= rs && verseNum <= re) {
      return { valid: true, ref: `${rs}-${re}` };
    }
  }

  // Single verse — valid
  return { valid: true, ref: String(verseNum) };
}

// ─── findVerseData ────────────────────────────────────────────────────────────
/**
 * Three-pass lookup in chapter JSON:
 *   Pass 1 — exact "TEXT X" or "TEXTS X-Y" match
 *   Pass 2 — substring fallback
 *   Pass 3 — match only the start verse number as a whole token
 *
 * @param {object} chapterData
 * @param {string} verseRef   — e.g. "4" or "26-27"
 * @returns {object}          — verse data object
 */
function findVerseData(chapterData, verseRef) {
  const base   = String(verseRef);
  const verses = chapterData.Verses ?? [];

  // Pass 1 — exact label match
  for (const vd of verses) {
    const tn = (vd['Text-num'] ?? '').trim();
    if (`TEXT ${base}` === tn || `TEXTS ${base}` === tn) return vd;
  }

  // Pass 2 — substring (handles "TEXTS 8-10" when ref is "8-10")
  for (const vd of verses) {
    if ((vd['Text-num'] ?? '').includes(base)) return vd;
  }

  // Pass 3 — match start verse number as a whole word
  const startVerse = base.split('-')[0];
  for (const vd of verses) {
    const tn = vd['Text-num'] ?? '';
    if (new RegExp(`\\b${startVerse}\\b`).test(tn)) return vd;
  }

  throw new Error(`Verse ${verseRef} not found in chapter ${chapterData['Chapter-Desc'] ?? '?'}.`);
}

// ─── formatVerseText ──────────────────────────────────────────────────────────
/**
 * The JSON Verse-Text field uses \n as the line separator between half-ślokas.
 * This function:
 *   1. Splits on \n.
 *   2. Prepends the Uvāca line (if present) with a colon.
 *   3. Returns the result as an array of plain strings — one per display line.
 *
 * Note: The old semicolon/bold-marker loop was removed because the JSON data
 * does not use semicolons as verse-line separators (those appear only in
 * Word-for-Word synonyms).
 *
 * @param {object} verseData
 * @returns {string[]}  — array of lines ready for innerHTML with <br> joins
 */
function formatVerseText(verseData) {
  const raw   = verseData['Verse-Text'] ?? '';
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  if (verseData['Uvaca-line']) {
    let uvaca = verseData['Uvaca-line'].trim();
    // Ensure the uvāca line ends with a colon or em-dash
    if (!/[:\-—]$/.test(uvaca)) uvaca += ':';
    lines.unshift(uvaca);
  }

  return lines;
}

// ─── formatSynonyms ───────────────────────────────────────────────────────────
/**
 * Parses the Word-for-Word field (semicolon-delimited "word — meaning" pairs)
 * into structured objects for HTML rendering.
 *
 * @param {string} raw
 * @returns {Array<{word: string, meaning: string}>}
 */
function formatSynonyms(raw) {
  if (!raw || !raw.trim()) return [{ word: '', meaning: 'No synonyms available.' }];

  const normalised = raw.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const items      = [];
  // Sanskrit characters used to distinguish Sanskrit words from plain hyphens
  const sanskritChars = /[āīūṁṣṭḥśḍṛñṇḷṅ]/i;

  for (const item of normalised.split(';')) {
    const t = item.trim();
    if (!t) continue;

    if (t.includes('—')) {
      const idx = t.indexOf('—');
      items.push({
        word:    t.slice(0, idx).trim(),
        meaning: t.slice(idx + 1).trim(),
      });
    } else if (t.includes('-') && !sanskritChars.test(t)) {
      // Fallback for ASCII hyphen used as em-dash in some editions
      const idx = t.indexOf('-');
      items.push({
        word:    t.slice(0, idx).trim(),
        meaning: t.slice(idx + 1).trim(),
      });
    } else {
      // Plain text item (e.g. transitional phrases)
      items.push({ word: '', meaning: t });
    }
  }

  return items;
}

// ─── Navigation helpers ───────────────────────────────────────────────────────

/**
 * Returns the previous verse reference, crossing chapter boundaries and
 * cycling from Ch.1 v.1 → Ch.18 last verse v.78 (wrap-around).
 *
 * @param {number} chapter
 * @param {string} verseRef  — canonical ref, e.g. "4" or "26-27"
 * @returns {{ chapter: number, ref: string }}
 */
function prevVerse(chapter, verseRef) {
  const startNum = parseInt(String(verseRef).split('-')[0], 10);

  if (startNum <= 1) {
    // Cross back into the previous chapter's last verse
    const prevCh   = chapter === 1 ? 18 : chapter - 1;
    const prevInfo = BG_CHAPTER_INFO[prevCh];
    const { ref }  = validateVerse(prevCh, prevInfo.total_verses);
    return { chapter: prevCh, ref };
  }

  const { ref } = validateVerse(chapter, startNum - 1);
  return { chapter, ref };
}

/**
 * Returns the next verse reference, crossing chapter boundaries and
 * cycling from Ch.18 last verse v.78 → Ch.1 v.1 (wrap-around).
 *
 * @param {number} chapter
 * @param {string} verseRef  — canonical ref, e.g. "4" or "26-27"
 * @returns {{ chapter: number, ref: string }}
 */
function nextVerse(chapter, verseRef) {
  const info   = BG_CHAPTER_INFO[chapter];
  const endNum = parseInt(String(verseRef).split('-').pop(), 10);

  if (endNum >= info.total_verses) {
    // Cross into the next chapter's first verse
    const nextCh = chapter === 18 ? 1 : chapter + 1;
    const { ref } = validateVerse(nextCh, 1);
    return { chapter: nextCh, ref };
  }

  const { ref } = validateVerse(chapter, endNum + 1);
  return { chapter, ref };
}

/**
 * Picks a truly random verse across all 18 chapters.
 * Serves as a Wisdom Oracle reading
 * @returns {{ chapter: number, ref: string }}
 */
function randomVerse() {
  const chapters = Object.keys(BG_CHAPTER_INFO).map(Number);
  const chapter  = chapters[Math.floor(Math.random() * chapters.length)];
  const total    = BG_CHAPTER_INFO[chapter].total_verses;
  const verseNum = Math.floor(Math.random() * total) + 1;
  const { ref }  = validateVerse(chapter, verseNum);
  return { chapter, ref };
}

/**
 * Builds the lightbox footer label.
 * Example: "Chapter 17, verse 1 (of 28)"  /  "Chapter 17, verses 26-27 (of 28)"
 *
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
 * Returns the chapter-end colophon string if this is the last verse,
 * otherwise null.
 * Source of truth: verseData['Chapter-En'] (the JSON field), with a
 * BG_CHAPTER_INFO fallback built from ordinal + title.
 *
 * @param {number} chapter
 * @param {string} verseRef
 * @param {object} verseData  — the current verse object from the JSON
 * @returns {string|null}
 */
function chapterColophon(chapter, verseRef, verseData) {
  const endNum = parseInt(String(verseRef).split('-').pop(), 10);
  if (endNum !== BG_CHAPTER_INFO[chapter].total_verses) return null;

  // Prefer the exact text from the JSON, fall back to a generated string
  if (verseData['Chapter-En']) return verseData['Chapter-En'];

  const [ordinal, title] = BG_CHAPTER_INFO[chapter].chapter_title.split('. ');
  return `Thus end the Bhaktivedānta Purports to the ${ordinal} Chapter of the Śrīmad Bhagavad-gītā in the matter of ${title}.`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  BG_CHAPTER_INFO,
  AUTHOR_NAME,
  AUTHOR_ICON,
  FOOTER_ICON,
  SIGNATURE_URL,
  DEDICATORY,
  DEDICATORY_CLOSINGS,
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
