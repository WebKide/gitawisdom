/**
 * ichingcore.js
 * I Ching (Book of Changes) logic module — mirrors gitacore.js structure.
 * Handles hexagram validation, lookup, navigation, and formatting.
 *
 * JSON file: iching/iching.json
 * Structure: same key names as Gita JSON files (Text-num, Verse-Text,
 *   Word-for-Word, Translation-En, Purport-En, etc.)
 *   No Uvaca-line, no Sanskrit — Verse-Text holds the hexagram name/lines.
 *   Hexagrams 1–64 are canonical. Entry 65 = "ask again", 66 = "no answer".
 */

'use strict';

// ─── Hexagram metadata ────────────────────────────────────────────────────────
// 64 canonical hexagrams + 2 special entries (65 = ask again, 66 = no answer).
// total_verses mirrors Gita usage; for iChing each "chapter" IS one hexagram,
// so the single file is treated as one chapter with 66 entries.
// grouped_ranges: hexagrams that share one JSON entry (none by default, but
// the structure is kept for parity with gitacore.js).
const ICHING_INFO = {
  total_hexagrams: 64,       // canonical hexagrams
  special_entries: [65, 66], // 65 = "ask again", 66 = "no answer now"
  grouped_ranges:  [],       // populate if any hexagrams share an entry
};

// Hexagram names (traditional, used as fallback if JSON lacks a Chapter-Desc)
const HEXAGRAM_NAMES = {
   1: 'Ch’ien — The Creative',         2: 'K’un — The Receptive',
   3: 'Chun — Difficulty at the Beginning', 4: 'Mêng — Youthful Folly',
   5: 'Hsü — Waiting',                 6: 'Sung — Conflict',
   7: 'Shih — The Army',               8: 'Pi — Holding Together',
   9: 'Hsiao Ch’u — The Taming Power of the Small', 10: 'Lü — Treading',
  11: 'T’ai — Peace',                 12: 'P’i — Standstill',
  13: 'T’ung Jên — Fellowship',       14: 'Ta Yu — Great Possession',
  15: 'Ch’ien — Modesty',             16: 'Yü — Enthusiasm',
  17: 'Sui — Following',              18: 'Ku — Work on What Has Been Spoiled',
  19: 'Lin — Approach',               20: 'Kuan — Contemplation',
  21: 'Shih Ho — Biting Through',     22: 'Pi — Grace',
  23: 'Po — Splitting Apart',         24: 'Fu — Return',
  25: 'Wu Wang — Innocence',          26: 'Ta Ch’u — The Taming Power of the Great',
  27: 'I — The Corners of the Mouth', 28: 'Ta Kuo — Preponderance of the Great',
  29: 'K’an — The Abysmal',           30: 'Li — The Clinging',
  31: 'Hsien — Influence',            32: 'Hêng — Duration',
  33: 'Tun — Retreat',                34: 'Ta Chuang — The Power of the Great',
  35: 'Chin — Progress',              36: 'Ming I — Darkening of the Light',
  37: 'Chia Jên — The Family',        38: 'K’uei — Opposition',
  39: 'Chien — Obstruction',          40: 'Hsieh — Deliverance',
  41: 'Sun — Decrease',               42: 'I — Increase',
  43: 'Kuai — Breakthrough',          44: 'Kou — Coming to Meet',
  45: 'Ts’ui — Gathering Together',   46: 'Shêng — Pushing Upward',
  47: 'K’un — Oppression',            48: 'Ching — The Well',
  49: 'Ko — Revolution',              50: 'Ting — The Cauldron',
  51: 'Chên — The Arousing',          52: 'Kên — Keeping Still',
  53: 'Chien — Development',          54: 'Kuei Mei — The Marrying Maiden',
  55: 'Fêng — Abundance',             56: 'Lü — The Wanderer',
  57: 'Sun — The Gentle',             58: 'Tui — The Joyous',
  59: 'Huan — Dispersion',            60: 'Chieh — Limitation',
  61: 'Chung Fu — Inner Truth',       62: 'Hsiao Kuo — Preponderance of the Small',
  63: 'Chi Chi — After Completion',   64: 'Wei Chi — Before Completion',
  65: 'Zaici — Ask Again Later',      66: 'Ling — No answer at this time',
};

// ─── Constants ────────────────────────────────────────────────────────────────
// TODO: Replace ICHING_AUTHOR_ICON with the correct iChing image once created.
//       Change the path below to 'assets/images/iching-author.png' (or similar).
const ICHING_AUTHOR_ICON  = 'assets/images/ichingcoin.png';
const ICHING_AUTHOR_TITLE = 'I Ching — Book of Changes';
const ICHING_SUBTITLE     = "Richard Wilhelm’s Translation";

// Randomised "no commentary" fallback messages (mirrors NO_PURPORT in gitacore.js)
const NO_COMMENTARY = [
  'This hexagram does not contain a commentary.',
  'No commentary for this hexagram.',
  'There is no commentary provided for this hexagram.',
  'This hexagram has no accompanying commentary.',
  'No Wilhelm commentary provided for this hexagram.',
  'No commentary accompanies this hexagram.',
];

// Single-file cache — iching.json is one file, not split by chapter
let _ichingCache = null;

// ─── loadIChingData ───────────────────────────────────────────────────────────
/**
 * Fetch and cache the iChing JSON data (single file).
 * @returns {Promise<object>}
 */
async function loadIChingData() {
  if (_ichingCache) return _ichingCache;

  const resp = await fetch('iching/iching.json');
  if (!resp.ok) throw new Error(`iChing data not found (HTTP ${resp.status})`);

  _ichingCache = await resp.json();
  return _ichingCache;
}

// ─── validateHexagram ─────────────────────────────────────────────────────────
/**
 * Validates a hexagram number (1–66).
 * 65 = "ask again", 66 = "no answer" (special entries, always valid).
 *
 * Returns:
 *   { valid: true,  ref: "4" }           — canonical lookup key
 *   { valid: false, ref: "<error msg>" }
 *
 * @param {number|string} num
 * @returns {{ valid: boolean, ref: string }}
 */
function validateHexagram(num) {
  const n = parseInt(String(num), 10);

  if (isNaN(n)) {
    return { valid: false, ref: `"${num}" is not a valid hexagram number. Please enter a whole number.` };
  }

  if (n < 1 || n > 66) {
    return {
      valid: false,
      ref: `The I Ching has 64 hexagrams (plus 2 special readings) — ${n} is out of range.`,
    };
  }

  // Check grouped ranges (future-proofing — currently none)
  for (const [rs, re] of ICHING_INFO.grouped_ranges) {
    if (n >= rs && n <= re) {
      return { valid: true, ref: `${rs}-${re}` };
    }
  }

  return { valid: true, ref: String(n) };
}

// ─── findHexagramData ─────────────────────────────────────────────────────────
/**
 * Three-pass lookup in iChing JSON (mirrors findVerseData from gitacore.js).
 *   Pass 1 — exact "TEXT X" or "TEXTS X-Y" match
 *   Pass 2 — substring fallback
 *   Pass 3 — match start number as whole token
 *
 * @param {object} ichingData
 * @param {string} ref   — e.g. "4" or "3-4"
 * @returns {object}     — hexagram data object
 */
function findHexagramData(ichingData, ref) {
  const base   = String(ref);
  const verses = ichingData.Verses ?? [];

  // Pass 1 — exact label match
  for (const vd of verses) {
    const tn = (vd['Text-num'] ?? '').trim();
    if (`TEXT ${base}` === tn || `TEXTS ${base}` === tn) return vd;
  }

  // Pass 2 — substring
  for (const vd of verses) {
    if ((vd['Text-num'] ?? '').includes(base)) return vd;
  }

  // Pass 3 — match start number as whole word
  const startNum = base.split('-')[0];
  for (const vd of verses) {
    const tn = vd['Text-num'] ?? '';
    if (new RegExp(`\\b${startNum}\\b`).test(tn)) return vd;
  }

  throw new Error(`Hexagram ${ref} not found in the iChing data.`);
}

// ─── formatHexagramText ───────────────────────────────────────────────────────
/**
 * Formats the hexagram's Verse-Text field into display lines.
 * No Uvaca-line for iChing. Splits on \n.
 *
 * @param {object} hexData
 * @returns {string[]}
 */
function formatHexagramText(hexData) {
  const raw = hexData['Verse-Text'] ?? '';
  return raw.split('\n').map(l => l.trim()).filter(Boolean);
}

// ─── formatHexagramSynonyms ───────────────────────────────────────────────────
/**
 * Re-uses the same semicolon-delimited "word — meaning" parsing as Gita.
 * Mirrors formatSynonyms() from gitacore.js.
 *
 * @param {string} raw
 * @returns {Array<{word: string, meaning: string}>}
 */
function formatHexagramSynonyms(raw) {
  if (!raw || !raw.trim()) return [{ word: '', meaning: 'No judgment lines available.' }];

  const normalised = raw.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const items      = [];

  for (const item of normalised.split(';')) {
    const t = item.trim();
    if (!t) continue;

    if (t.includes('—')) {
      const idx = t.indexOf('—');
      items.push({ word: t.slice(0, idx).trim(), meaning: t.slice(idx + 1).trim() });
    } else if (t.includes('-')) {
      const idx = t.indexOf('-');
      items.push({ word: t.slice(0, idx).trim(), meaning: t.slice(idx + 1).trim() });
    } else {
      items.push({ word: '', meaning: t });
    }
  }

  return items;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

/**
 * Previous hexagram (wraps 1 → 64).
 * Skips special entries 65–66 during normal navigation.
 *
 * @param {string} ref  — current ref, e.g. "4"
 * @returns {{ ref: string }}
 */
function prevHexagram(ref) {
  const n = parseInt(String(ref).split('-')[0], 10);
  // Wrap: if at 1, go to 64
  const prev = n <= 1 ? 64 : n - 1;
  const { ref: newRef } = validateHexagram(prev);
  return { ref: newRef };
}

/**
 * Next hexagram (wraps 64 → 1).
 * Skips special entries 65–66 during normal navigation.
 *
 * @param {string} ref  — current ref, e.g. "4"
 * @returns {{ ref: string }}
 */
function nextHexagram(ref) {
  const endNum = parseInt(String(ref).split('-').pop(), 10);
  // Wrap: if at 64 (or beyond), go to 1
  const next = endNum >= 64 ? 1 : endNum + 1;
  const { ref: newRef } = validateHexagram(next);
  return { ref: newRef };
}

/**
 * Picks a random hexagram from 1–64 (never returns special entries 65–66).
 * @returns {{ ref: string }}
 */
function randomHexagram() {
  const n           = Math.floor(Math.random() * 64) + 1;
  const { ref }     = validateHexagram(n);
  return { ref };
}

/**
 * Builds the lightbox footer label for iChing.
 * Example: "Hexagram 17 of 64"
 *
 * @param {string} ref
 * @returns {string}
 */
function buildIChingFooter(ref) {
  const n       = parseInt(String(ref).split('-')[0], 10);
  const name    = HEXAGRAM_NAMES[n] ?? `Hexagram ${n}`;
  const special = n > 64 ? ' (special reading)' : ` of 64`;
  return `Hexagram ${n} · ${name}${special}`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  ICHING_INFO,
  HEXAGRAM_NAMES,
  ICHING_AUTHOR_ICON,
  ICHING_AUTHOR_TITLE,
  ICHING_SUBTITLE,
  NO_COMMENTARY,
  loadIChingData,
  validateHexagram,
  findHexagramData,
  formatHexagramText,
  formatHexagramSynonyms,
  prevHexagram,
  nextHexagram,
  randomHexagram,
  buildIChingFooter,
};