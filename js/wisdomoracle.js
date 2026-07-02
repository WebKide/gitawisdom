/**
 * wisdomoracle.js
 * Wisdom Oracle — Composite reading (guidance + Gita + iChing)
 *
 * Responsibilities:
 *   • handleWisdomOracle — async loader: rolls a fresh composite reading
 *     (random guidance + random Gita verse + random iChing hexagram) and
 *     opens it via lightbox.js's openWisdomLightbox()
 *   • openOracleCard — reopens the CACHED reading without re-rolling; this
 *     is what makes the card "remember" its verse/hexagram for the rest of
 *     the session (e.g. after closing a Gita verse opened via its
 *     "Read full verse" button)
 *   • closeOracleCard — clears the cached reading so the next
 *     handleWisdomOracle() call rolls a genuinely fresh one
 *   • oracle.json loading/caching (_loadOracleJson)
 *
 * Rendering stays owned by lightbox.js (renderWisdomOracle / openWisdomLightbox)
 * — this module is the business-logic layer deciding WHAT reading to show;
 * lightbox.js decides HOW to render it. Mirrors the existing
 * oracle-forms.js → lightbox.js relationship used for the Gita/iChing forms.
 *
 * NOTE: state.wisdomPayload is in-memory only for the current session — it
 * is intentionally NOT persisted across a hard page reload at this time.
 *
 * Import chain: wisdomoracle.js → lightbox.js (static) / lightbox.js → wisdomoracle.js
 * (dynamic, inside closeLightbox()'s fromOracle branch) — same mitigated
 * circular pattern already used elsewhere in this app; dynamic import on the
 * back-edge avoids the TDZ problem a static cycle would cause.
 */

'use strict';

import {
  openWisdomLightbox,
} from './lightbox.js';

import {
  randomVerse,
  loadChapterData,
  findVerseData,
} from './gitacore.js';

import {
  randomHexagram,
  loadIChingData,
  findHexagramData,
} from './ichingcore.js';

import { escHtml } from './share-utils.js';
import { clearErrors } from './oracle-forms.js';

// ─── Access shared state and DOM from app.js ────────────────────────────────
/** @returns {import('./app.js').AppState} */
const getState = () => window._woState;
/** @returns {Object} */
const getDom   = () => window._woDom;

// ─── Oracle JSON cache ────────────────────────────────────────────────────────
let _oracleJson = null;

/**
 * Fetch and cache assets/data/oracle.json (random guidance pool, etc.).
 * @returns {Promise<object>}
 */
async function _loadOracleJson() {
  if (_oracleJson) return _oracleJson;
  const resp = await fetch('assets/data/oracle.json');
  if (!resp.ok) throw new Error(`oracle.json HTTP ${resp.status}`);
  _oracleJson = await resp.json();
  return _oracleJson;
}

// ─── Wisdom Oracle: async loader ─────────────────────────────────────────────

/**
 * Loads oracle.json, picks random guidance, random Gita verse, random hexagram.
 * Builds payload and opens the Wisdom Oracle composite lightbox.
 * Caches results in state until the card is explicitly closed.
 */
async function handleWisdomOracle() {
  const state = getState();
  const dom = getDom();

  if (state.loading) return;
  state.loading = true;
  clearErrors();

  // --- Notification function that triggers when the user opens the oracle ---
  if (dom.woNotificationDot) {
    dom.woNotificationDot.style.display = 'none';
  }

  try {
    const oracle = await _loadOracleJson();

    // 1. Random guidance
    const guidance = oracle['random-guidance'][
      Math.floor(Math.random() * oracle['random-guidance'].length)
    ];

    // 2. Random Gita verse (reuse existing randomVerse from gitacore)
    const { chapter, ref: gitaRef } = randomVerse();
    const chapterData = await loadChapterData(chapter);
    const verseData = findVerseData(chapterData, gitaRef);
    const gitaTranslation = (verseData['Translation-En'] ?? '').trim();

    // 3. Random iChing hexagram (reuse existing randomHexagram from ichingcore)
    const { ref: ichingRef } = randomHexagram();
    const ichingData = await loadIChingData();
    const hexData = findHexagramData(ichingData, ichingRef);
    const ichingTranslation = (hexData['Translation-En'] ?? '').trim();

    // Build payload
    const payload = {
      guidance,
      gitaChapter: chapter,
      gitaRef,
      gitaTranslation,
      ichingRef,
      ichingTranslation,
    };

    // Cache in state for Return navigation — this is what lets the card
    // "remember" its verse/hexagram for the rest of the session.
    state.wisdomPayload = payload;
    state.oracleOrigin = false; // set to true when navigating TO gita/iching

    openWisdomLightbox(payload);

  } catch (err) {
    console.error('[handleWisdomOracle]', err);
    // Show error in a generic alert or dedicated wisdom error box
    const box = dom.gitaErrorBox; // reuse for now
    box.innerHTML = `Wisdom Oracle: ${escHtml(err.message)}`;
    box.classList.add('visible');
  } finally {
    state.loading = false;
  }
}

/**
 * Reopens the cached Wisdom Oracle card (used when returning from Gita/iChing).
 * Does NOT re-roll — this is the "remembers verse and hexagram" behavior.
 */
function openOracleCard() {
  const state = getState();
  if (state.wisdomPayload) {
    openWisdomLightbox(state.wisdomPayload);
  }
}

/**
 * Closes the Wisdom Oracle card and clears its cache.
 */
function closeOracleCard() {
  const state = getState();
  state.wisdomPayload = null;
  state.oracleOrigin = false;
  // closeLightbox() handles DOM cleanup
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  handleWisdomOracle,
  openOracleCard,
  closeOracleCard,
};