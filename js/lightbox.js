/**
 * lightbox.js
 * Wisdom Oracle — Lightbox / card UI controller
 *
 * Responsibilities:
 *   • openLightbox / closeLightbox — modal lifecycle
 *   • renderVerse — paint all lightbox content from current state
 *   • displayVerse / displayHexagram — async load + display for Gita and iChing
 *   • togglePurport — switch between verse and purport/commentary views
 *   • applyLightboxBranding — swap header icon and title for Gita vs iChing
 *   • updateBottomButtons — update bottom button labels based on mode + purport state
 *   • applyFontSize / increaseFontSize / decreaseFontSize — font size controls
 *   • goNext / goPrev — navigation with chapter/hexagram boundary wrapping
 *   • setNavDisabled — disable nav buttons during async loads
 *   • initSwipe — touch swipe handler (called from app.js after DOM ready)
 */

'use strict';

import {
  BG_CHAPTER_INFO,
  DEDICATORY_CLOSINGS,
  NO_PURPORT,
  loadChapterData,
  validateVerse,
  findVerseData,
  formatVerseText,
  formatSynonyms,
  buildFooterText,
  chapterColophon,
  nextVerse,
  prevVerse,
  randomVerse,
} from './gitacore.js';

import { highlightTerms } from './fuse-search.js';

import {
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
} from './ichingcore.js';

let _injectHighlight = null;
let _updateBookmarkUI = null;

export function setBookmarkCallbacks({ injectHighlight, updateBookmarkUI }) {
  _injectHighlight = injectHighlight;
  _updateBookmarkUI = updateBookmarkUI;
}

// ─── Access shared state and DOM from app.js ────────────────────────────────
/** @returns {import('./app.js').AppState} */
const getState = () => window._woState;
/** @returns {Object} */
const getDom   = () => window._woDom;

// ─── Font-size limits ───────────────────────────────────────────────────────
const FONT_MIN     = 10;
const FONT_MAX     = 24;
const FONT_DEFAULT = 16;

// ─── Lightbox open / close ───────────────────────────────────────────────────

/**
 * Opens the lightbox modal, locks body scroll, and prevents mobile keyboard
 * from appearing by setting readonly on input fields.
 */
function openLightbox() {
  const dom = getDom();
  const state = getState();
  state.lastFocusEl = document.activeElement;

  dom.lightbox.classList.add('open');
  document.body.classList.add('lb-active');
  dom.lbCard.scrollTop = 0;
  setTimeout(() => dom.lbClose.focus(), 120);

  // Prevent mobile keyboard from opening while lightbox is active.
  // Both input fields get readonly + inputmode:none so swiping never triggers
  // the on-screen keyboard.
  [dom.gitaVerseInput, dom.ichingInput].forEach(inp => {
    inp.setAttribute('readonly', '');
    inp.setAttribute('inputmode', 'none');
  });
}

/**
 * Closes the lightbox modal, restores body scroll, and resets state.
 * If the lightbox was opened from a search result, returns to the search card.
 */
function closeLightbox() {
  const dom = getDom();
  const state = getState();

  // Capture before state reset — determines post-close destination
  const fromSearch = state.searchOrigin;
  const fromOracle = state.oracleOrigin;

  dom.lightbox.classList.remove('open');
  // Only remove lb-active when NOT returning to the search card.
  // Keeping it prevents a brief flash of the landing page during the
  // transition back to the search modal.
  if (!fromSearch && !fromOracle) document.body.classList.remove('lb-active');

  // D. In closeLightbox(), add fromBookmarks alongside fromSearch/fromOracle:
  const fromBookmarks = state.bookmarksOrigin;

  // Reset purport header button and mobile class
  dom.lbPurportBtn.style.display = 'none';
  const header = dom.lbCard.querySelector('.lb-header');
  if (header) header.classList.remove('lb-header--purport');

  // Remove I Ching border class so next open defaults to Gita saffron
  // Remove all mode classes on close
  dom.lbCard.classList.remove('lb-card--iching');
  dom.lbCard.classList.remove('lb-card--gita');
  dom.lbCard.classList.remove('lb-card--wisdom');

  // Reset state
  state.mode           = 'gita';
  state.chapter        = null;
  state.verseRef       = null;
  state.chapterData    = null;
  state.verseData      = null;
  state.hexRef         = null;
  state.ichingData     = null;
  state.hexData        = null;
  state.showPurport    = false;
  state.highlightTerms = [];

  // ── NEW: Clean up wisdom mode ──
  const wisdomBody = document.getElementById('lb-wisdom-body');
  if (wisdomBody) {
    wisdomBody.innerHTML = '';
    wisdomBody.classList.add('hidden');
  }
  // Restore nav buttons visibility (they were hidden in wisdom mode)
  dom.lbPrev.style.display = '';
  dom.lbNext.style.display = '';
  // Reset border color override
  dom.lbCard.style.borderTopColor = '';

  // Clear BOTH input fields — no trailing values (spec: empty on close)
  dom.gitaVerseInput.value = '';
  dom.ichingInput.value    = '';

  // Reset the chapter dropdown too. goNext()/goPrev() re-populate it while
  // browsing inside the lightbox (window._setSelectedChapter(chapter)), but
  // that was never undone on close — so a chapter selected via in-lightbox
  // navigation would still show selected on the landing page after closing.
  if (window._setSelectedChapter) window._setSelectedChapter(null);

  // Restore inputs for next lookup
  [dom.gitaVerseInput, dom.ichingInput].forEach(inp => {
    inp.removeAttribute('readonly');
    inp.setAttribute('inputmode', 'numeric');
  });

  // Clear error messages from all error boxes
  [dom.gitaErrorBox, dom.ichingErrorBox, dom.globalErrorBox].forEach(b => {
    if (b) { b.textContent = ''; b.classList.remove('visible'); }
  });

  // If opened from a search result, return to the search card
  if (fromSearch) {
    state.searchOrigin = false;
    // Dynamically import to avoid circular dependency with search-ui.js
    import('./search-ui.js').then(({ openSearchCard }) => {
      setTimeout(() => openSearchCard(), 60);
    });
    return;
  }

  if (fromOracle) {
    state.oracleOrigin = false;
    import('./wisdomoracle.js').then(({ openOracleCard }) => {
      setTimeout(() => openOracleCard(), 60);
    });
    return;  // ← don't fall through to the scroll-to-top
  }

  // Scroll page back to top so user sees the landing page
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Return focus to the relevant random button (avoids mobile keyboard)
  setTimeout(() => {
    const el = state.lastFocusEl;

    if (el && typeof el.focus === 'function') {
      el.focus({ preventScroll: true });
    }
  }, 80);
}

// ─── Font-size controls ───────────────────────────────────────────────────────

/**
 * Applies the current font size from state to all .lb-card elements.
 * This ensures both the main lightbox and any dynamically created cards
 * inherit the user's preference.
 */
function applyFontSize() {
  const state = getState();
  document.querySelectorAll('.lb-card').forEach(card => {
    card.style.setProperty('--lb-font-size', `${state.fontSize}px`);
  });
}

/**
 * Increases the reader font size by 2px, up to FONT_MAX.
 * Persists the new size to localStorage.
 */
function increaseFontSize() {
  const state = getState();
  if (state.fontSize < FONT_MAX) {
    state.fontSize = Math.min(state.fontSize + 2, FONT_MAX);
    applyFontSize();
    try { localStorage.setItem('wo_font_size', state.fontSize); } catch (_) {}
  }
}

/**
 * Decreases the reader font size by 2px, down to FONT_MIN.
 * Persists the new size to localStorage.
 */
function decreaseFontSize() {
  const state = getState();
  if (state.fontSize > FONT_MIN) {
    state.fontSize = Math.max(state.fontSize - 2, FONT_MIN);
    applyFontSize();
    try { localStorage.setItem('wo_font_size', state.fontSize); } catch (_) {}
  }
}

// ─── Lightbox header branding ─────────────────────────────────────────────────

/**
 * Swaps the lightbox header icon and title text to match the active mode.
 * For iChing mode, also toggles the .lb-card--iching class so the top border
 * renders in indigo-blue instead of saffron.
 */
function applyLightboxBranding() {
  const dom = getDom();
  const state = getState();

  if (state.mode === 'iching') {
    dom.lbAuthorIcon.src = ICHING_AUTHOR_ICON;
    dom.lbAuthorIcon.alt = 'I Ching Oracle';
    dom.lbAuthorTitle.innerHTML =
      `<strong><i>I Ching</i> — Book of Changes</strong> <b id="lb-author-ref"></b>`;

    // Show COPY / SHARE buttons from card view
    dom.lbCopyBtn.style.display  = 'none';
    dom.lbShareBtn.style.display = '';

    // Toggle I Ching card border color via CSS class
    dom.lbCard.classList.remove('lb-card--gita');
    dom.lbCard.classList.remove('lb-card--wisdom');
    dom.lbCard.classList.add('lb-card--iching');
  } else {
    dom.lbAuthorIcon.src = 'assets/images/prabhupada.png';
    dom.lbAuthorIcon.alt = 'A.C. Bhaktivedānta Swami';
    dom.lbAuthorTitle.innerHTML =
      `<strong><i>Bhagavad Gītā</i> As It Is</strong> <b id="lb-author-ref"></b>`;

    // Both COPY and SHARE visible for Gita
    dom.lbCopyBtn.style.display  = '';
    dom.lbShareBtn.style.display = '';

    // Remove I Ching card border color: dom.lbCard.classList.remove('lb-card--iching');
    // Set Gita card branding
    dom.lbCard.classList.remove('lb-card--iching');
    dom.lbCard.classList.remove('lb-card--wisdom');
    dom.lbCard.classList.add('lb-card--gita');
  }
}

// ─── Bottom button labels ─────────────────────────────────────────────────────

/**
 * Updates bottom button labels based on current mode and purport state.
 * Verse/Hexagram view  → "📖 Read Purport" / "📖 Read Commentary"  (blue)
 * Purport/Commentary view → "↩ Return to Verse" / "↩ Return to Hexagram" (red)
 */
function updateBottomButtons() {
  const dom = getDom();
  const state = getState();
  const header = dom.lbCard.querySelector('.lb-header');

  if (state.showPurport) {
    // Bottom buttons
    dom.lbOpenPurportBtn.classList.remove('visible');
    dom.lbReturnBtn.classList.add('visible');
    dom.lbReturnBtn.textContent =
      state.mode === 'iching' ? '↩ Return to Hexagram' : '↩ Return to Verse';

    // Top header return button — show
    dom.lbPurportBtn.style.display = '';
    // Mobile: add class so CSS hides the close button
    if (header) header.classList.add('lb-header--purport');
  } else {
    // Bottom buttons
    dom.lbReturnBtn.classList.remove('visible');
    dom.lbOpenPurportBtn.classList.add('visible');
    dom.lbOpenPurportBtn.textContent =
      state.mode === 'iching' ? '📖 Read Commentary' : '📖 Read Purport';

    // Top header return button — hide
    dom.lbPurportBtn.style.display = 'none';
    if (header) header.classList.remove('lb-header--purport');
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Paints all lightbox content from current state.
 * Works for both 'gita' and 'iching' modes.
 *
 * Display order (verse view):
 *   H3 chapter/hexagram heading
 *   TEXT label
 *   Translation  ← shown FIRST (main feature)
 *   Sanskrit / hexagram lines ← shown SECOND
 *   Synonyms / judgment lines ← shown THIRD
 *   Bottom "Read Purport/Commentary" button
 *
 * Purport view:
 *   Dedicatory greeting
 *   Purport / Commentary body
 *   Signature (Gita only)
 *   Bottom "Return to Verse/Hexagram" button
 */
function renderVerse() {
  const dom = getDom();
  const state = getState();

  // ── NEW: Hide wisdom body if present ──
  const wisdomBody = document.getElementById('lb-wisdom-body');
  if (wisdomBody) wisdomBody.classList.add('hidden');

  // Restore the shared chapter/hexagram heading — renderWisdomOracle() hides
  // it (it has its own "Wisdom Oracle" header-bar branding instead), so it
  // must be re-shown whenever a Gita/iChing verse renders.
  dom.lbChapterHeading.classList.remove('hidden');

  // ── Reset action buttons to their default labels on every render ──────────
  dom.lbShareBtn.textContent = 'SHARE';
  dom.lbShareBtn.disabled    = false;
  dom.lbCopyBtn.textContent  = 'COPY';
  dom.lbCopyBtn.disabled     = false;

  // Remove any leftover no-purport message from previous verse
  const oldMsg = document.getElementById('lb-no-purport-msg');
  if (oldMsg) oldMsg.remove();

  const isGita    = state.mode === 'gita';
  const verseData = isGita ? state.verseData : state.hexData;
  const ref       = isGita ? state.verseRef  : state.hexRef;

  // ── Chapter / hexagram heading ────────────────────────────────────────────
  if (isGita) {
    const info      = BG_CHAPTER_INFO[state.chapter];
    const titlePart = info.chapter_title.split('. ').slice(1).join('. ');
    dom.lbChapterHeading.textContent = `${titlePart} (BG ${state.chapter}.${ref})`;
    // Re-query lb-author-ref after applyLightboxBranding rewrote innerHTML
    const authorRef = document.getElementById('lb-author-ref');
    if (authorRef) authorRef.textContent = ` (${state.chapter}.${ref})`;
  } else {
    const n    = parseInt(String(ref).split('-')[0], 10);
    const name = HEXAGRAM_NAMES[n] ?? `Hexagram ${n}`;
    dom.lbChapterHeading.textContent = `${name} · Hexagram ${n}`;
    const authorRef = document.getElementById('lb-author-ref');
    if (authorRef) authorRef.textContent = ` · ${n}`;
  }

  // ── TEXT / Hexagram label ──────────────────────────────────────────────────
  dom.lbTextNum.textContent = ref.includes('-')
    ? (isGita ? `TEXTS ${ref}` : `HEXAGRAMS ${ref}`)
    : (isGita ? `TEXT ${ref}`  : `HEXAGRAM ${ref}`);

  // ── Translation / Judgment ────────────────────────────────────────────────
  const transl = (verseData['Translation-En'] ?? '').replace(/\s+/g, ' ').trim();
  const terms  = state.highlightTerms || [];
  const translMarked = terms.length ? highlightTerms(transl, terms) : escHtml(transl);
  dom.lbTranslation.innerHTML = isGita
    ? (transl ? `\u201C${translMarked}\u201D` : 'No translation found.')
    : (translMarked || 'No judgement found.');

  // ── Sanskrit / hexagram lines ─────────────────────────────────────────────
  const lines = isGita
    ? formatVerseText(verseData)
    : formatHexagramText(verseData);
  dom.lbSanskrit.innerHTML = lines.map(escHtml).join('<br />');

  // ── Synonyms / judgment lines ─────────────────────────────────────────────
  const synRaw   = verseData['Word-for-Word'] ?? '';
  const synItems = isGita
    ? formatSynonyms(synRaw)
    : formatHexagramSynonyms(synRaw);

  dom.lbSynonyms.innerHTML = synItems.map(({ word, meaning }, index) => {
      // Avoid duplicate dots in SYNONYMS
      let cleanMeaning = escHtml(meaning);
      if (index === synItems.length -1 && cleanMeaning.endsWith('.')) {
        cleanMeaning = cleanMeaning.slice(0, -1);
      }
      return word
      ? `<span class="syn-item"><em class="syn-word">${escHtml(word)}</em>`
        + `<span class="syn-dash"> — </span>`
        + `<span class="syn-meaning">${escHtml(meaning)}</span></span>`
      : `<span class="syn-item syn-plain">${escHtml(meaning)}</span>`
  }).join('<span class="syn-sep">; </span>') + '<span class="syn-sep">.</span>';

  // ── Footer text ───────────────────────────────────────────────────────────
  dom.lbFooter.textContent = isGita
    ? buildFooterText(state.chapter, ref)
    : buildIChingFooter(ref);

  // ── Chapter-end colophon (Gita only, iChing has no chapter ends) ──────────
  if (isGita) {
    const colophon = chapterColophon(state.chapter, ref, verseData);
    if (colophon) {
      dom.lbChapterEnd.textContent = colophon;
      dom.lbChapterEnd.classList.add('visible');
    } else {
      dom.lbChapterEnd.textContent = '';
      dom.lbChapterEnd.classList.remove('visible');
    }
  } else {
    dom.lbChapterEnd.textContent = '';
    dom.lbChapterEnd.classList.remove('visible');
  }

  // ── Mode switch: verse view vs purport/commentary view ────────────────────
  if (state.showPurport) {
    // Hide verse section; show purport section
    dom.lbVerseSection.classList.add('hidden');
    dom.lbPurportSection.classList.remove('hidden');

    // Show TEXT/HEXAGRAM label in purport view
    dom.lbTextNum.style.display = '';

    // Render purport / commentary body
    const purportRaw = (verseData['Purport-En'] ?? '').trim();
    if (purportRaw) {
      const paras = purportRaw.split(/\n\n+/).filter(Boolean);
      dom.lbPurport.innerHTML = paras
        .map(p => {
          const clean = p.replace(/\n/g, ' ').trim();
          const body  = terms.length ? highlightTerms(clean, terms) : escHtml(clean);
          return `<p>${body}</p>`;
        })
        .join('');

      // Hide COPY in purport view for both modes.
      // Hide SHARE in purport view for Gita only; keep for iChing.
      dom.lbCopyBtn.style.display  = '';       // visible in purport for both modes
      dom.lbShareBtn.style.display = isGita ? 'none' : '';
    } else {
      // Random fallback message when no purport/commentary exists
      const pool     = isGita ? NO_PURPORT : NO_COMMENTARY;
      const fallback = pool[Math.floor(Math.random() * pool.length)];
      dom.lbPurport.innerHTML = '';
      dom.lbPurport.insertAdjacentHTML('afterend', `<p id="lb-no-purport-msg" class="lb-no-purport">${escHtml(fallback)}</p>`);
    }

    // Random closing salutation (Gita only)
    const closing = DEDICATORY_CLOSINGS[Math.floor(Math.random() * DEDICATORY_CLOSINGS.length)];
    const dedicatoryTop = dom.lbPurportSection.querySelector('.lb-purport-dedicatory-top');
    if (dedicatoryTop) dedicatoryTop.innerHTML = isGita ? closing : '';

    // Signature: show for Gita, hide for iChing
    const sig = dom.lbCard.querySelector('.lb-signature');
    if (sig) sig.style.display = isGita ? '' : 'none';

    const sigDedicatory = dom.lbCard.querySelectorAll('.lb-purport-dedicatory');
    sigDedicatory.forEach(el => { el.style.display = isGita ? '' : 'none'; });

  } else {
    // Show verse section; hide purport section
    dom.lbVerseSection.classList.remove('hidden');
    dom.lbPurportSection.classList.add('hidden');

    // Clear purport HTML (keep DOM clean)
    dom.lbPurport.innerHTML = '';

    // Hide TEXT/HEXAGRAM label in verse view
    dom.lbTextNum.style.display = 'none';

    // Restore COPY for Gita only; SHARE for both modes
    if (state.mode === 'gita') {
      dom.lbCopyBtn.style.display  = '';
    }
    dom.lbShareBtn.style.display = '';
  }

  // ── Dynamic label swapping for iChing mode ────────────────────────────────
  // Swap section labels when in iChing mode so the UI reads correctly
  const sanskritLabel = document.getElementById('lb-sanskrit-label');
  const synonymsLabel = document.getElementById('lb-synonyms-label');
  const purportLabel  = document.getElementById('lb-purport-label');

  if (sanskritLabel) sanskritLabel.textContent = isGita ? '📜 SANSKRIT' : '📜 HEXAGRAM LINES';
  if (synonymsLabel) synonymsLabel.textContent = isGita ? '📖 SYNONYMS' : '📖 JUDGMENT LINES';
  if (purportLabel)  purportLabel.textContent  = isGita ? '🖊 PURPORT'   : '🖊 COMMENTARY';

  // Update bottom buttons for current mode/state
  updateBottomButtons();

  if (typeof _injectHighlight === 'function') _injectHighlight();
  if (typeof _updateBookmarkUI === 'function') _updateBookmarkUI();

  // Always scroll card to top after render
  dom.lbCard.scrollTop = 0;
}

// ─── HTML escape helper ───────────────────────────────────────────────────────

/**
 * Escapes HTML special characters to prevent XSS when injecting user content.
 * @param {string} str — raw string that may contain HTML metacharacters
 * @returns {string} — escaped string safe for innerHTML insertion
 */
function escHtml(str) {
  return String(str)
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Load and display a Gita verse ───────────────────────────────────────────

/**
 * Async loader for a Gita verse. Fetches chapter JSON if not cached,
 * validates the verse reference, updates shared state, and renders.
 *
 * @param {number}  chapter — chapter number (1–18)
 * @param {string}  verseRef — canonical ref, e.g. "4" or "26-27"
 * @param {boolean} [keepPurport=false] — preserve purport view when re-rendering same verse
 */
async function displayVerse(chapter, verseRef, keepPurport = false, terms = []) {
  const state = getState();
  const dom = getDom();

  if (state.loading) return;
  state.loading = true;
  state.mode    = 'gita';
  setNavDisabled(true);
  dom.lbCard.classList.add('loading');

  try {
    const chapterData = await loadChapterData(chapter);
    const verseData   = findVerseData(chapterData, verseRef);

    state.chapter       = chapter;
    state.verseRef      = verseRef;
    state.chapterData   = chapterData;
    state.verseData     = verseData;
    state.showPurport   = keepPurport ? state.showPurport : false;
    state.highlightTerms = terms; // empty array clears highlighting on normal navigation

    applyLightboxBranding();
    renderVerse();

    if (!dom.lightbox.classList.contains('open')) openLightbox();

  } catch (err) {
      if (dom.lightbox.classList.contains('open')) {
        dom.lbFooter.textContent = '⚠ ' + err.message;
      } else {
        const box = dom.globalErrorBox;
        if (box) {
          box.innerHTML = err.message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          box.classList.add('visible');
          box.setAttribute('role', 'alert');
        }
      }
  } finally {
    state.loading = false;
    setNavDisabled(false);
    dom.lbCard.classList.remove('loading');
  }
}

// ─── Load and display an iChing hexagram ─────────────────────────────────────

/**
 * Async loader for an iChing hexagram. Fetches the iChing JSON if not cached,
 * validates the hexagram reference, updates shared state, and renders.
 *
 * @param {string}  hexRef — hexagram number, e.g. "17"
 * @param {boolean} [keepPurport=false] — preserve commentary view when re-rendering
 */
async function displayHexagram(hexRef, keepPurport = false) {
  const state = getState();
  const dom = getDom();

  if (state.loading) return;
  state.loading = true;
  state.mode    = 'iching';
  setNavDisabled(true);
  dom.lbCard.classList.add('loading');

  try {
    const ichingData = await loadIChingData();
    const hexData    = findHexagramData(ichingData, hexRef);

    state.hexRef     = hexRef;
    state.ichingData = ichingData;
    state.hexData    = hexData;
    state.showPurport = keepPurport ? state.showPurport : false;

    applyLightboxBranding();
    renderVerse();

    if (!dom.lightbox.classList.contains('open')) openLightbox();

  } catch (err) {
      if (dom.lightbox.classList.contains('open')) {
        dom.lbFooter.textContent = '⚠ ' + err.message;
      } else {
        const box = dom.globalErrorBox;
        if (box) {
          box.innerHTML = err.message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          box.classList.add('visible');
          box.setAttribute('role', 'alert');
        }
      }
  } finally {
    state.loading = false;
    setNavDisabled(false);
    dom.lbCard.classList.remove('loading');
  }

  // B. In applyLightboxBranding(), at the very end:
  if (typeof _updateBookmarkUI === 'function') _updateBookmarkUI();

}

/** Disable / enable navigation buttons while a load is in progress. */
function setNavDisabled(disabled) {
  const dom = getDom();
  dom.lbPrev.disabled       = disabled;
  dom.lbNext.disabled       = disabled;
  dom.lbPurportBtn.disabled = disabled;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

/**
 * Navigate to the next verse or hexagram, wrapping at chapter/hexagram boundaries.
 */
async function goNext() {
  const state = getState();
  if (state.mode === 'iching') {
    if (!state.hexRef) return;
    const { ref } = nextHexagram(state.hexRef);
    await displayHexagram(ref);
  } else {
    if (!state.chapter) return;
    const { chapter, ref } = nextVerse(state.chapter, state.verseRef);
    // Update dropdown to reflect new chapter
    if (window._setSelectedChapter) window._setSelectedChapter(chapter);
    await displayVerse(chapter, ref);
  }
}

/**
 * Navigate to the previous verse or hexagram, wrapping at chapter/hexagram boundaries.
 */
async function goPrev() {
  const state = getState();
  if (state.mode === 'iching') {
    if (!state.hexRef) return;
    const { ref } = prevHexagram(state.hexRef);
    await displayHexagram(ref);
  } else {
    if (!state.chapter) return;
    const { chapter, ref } = prevVerse(state.chapter, state.verseRef);
    if (window._setSelectedChapter) window._setSelectedChapter(chapter);
    await displayVerse(chapter, ref);
  }
}

// ─── Purport / commentary toggle ─────────────────────────────────────────────

/**
 * Toggles between verse/hexagram view and purport/commentary view.
 * Scrolls the purport section into view when opening.
 */
function togglePurport() {
  const state = getState();
  const dom = getDom();
  const verseData = state.mode === 'gita' ? state.verseData : state.hexData;
  if (!verseData) return;

  state.showPurport = !state.showPurport;
  renderVerse();

  // If opening purport view, scroll it into view
  if (state.showPurport) {
    setTimeout(() => {
      dom.lbPurportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }
}

// ─── Touch / Swipe ────────────────────────────────────────────────────────────

/**
 * Initializes touch swipe navigation on the lightbox card.
 * Must be called AFTER window._woDom is set by app.js.
 * Left swipe → next, right swipe → previous.
 */
function initSwipe() {
  const dom = getDom();
  let startX = 0, startY = 0;
  const THRESHOLD = 52; // px minimum horizontal distance

  dom.lbCard.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  dom.lbCard.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    // Only trigger if horizontal motion dominates
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESHOLD) {
      dx < 0 ? goNext() : goPrev();
    }
  }, { passive: true });
}

// ─── Wisdom Oracle: render composite card ─────────────────────────────────────

/**
 * Renders the Wisdom Oracle composite card into the existing lightbox DOM.
 * Reuses lb-card but hides navigation and swaps content.
 * 
 * @param {Object} payload — { guidance, gitaChapter, gitaRef, gitaTranslation, ichingRef, ichingTranslation }
 */
function renderWisdomOracle(payload) {
  const state = getState();
  const dom = getDom();
  const fromBookmarks = state.bookmarksOrigin;

  state.mode = 'wisdom';
  state.showPurport = false;

  // ── Header: Wisdom Oracle branding ──
  dom.lbAuthorIcon.src = 'assets/images/wisdomoracle_logo.svg';
  dom.lbAuthorIcon.alt = 'Wisdom Oracle';
  dom.lbAuthorTitle.innerHTML = '<strong>Guidance for you</strong>';

  if (dom.lbBookmarkBtn) dom.lbBookmarkBtn.style.display = 'none';

  // ── Grey border for wisdom mode ── dom.lbCard.style.borderTopColor = 'var(--text-muted)';
  // ── Wisdom mode card branding ──
  dom.lbCard.classList.remove('lb-card--iching');
  dom.lbCard.classList.remove('lb-card--gita');
  dom.lbCard.classList.add('lb-card--wisdom');
  dom.lbCard.style.borderTopColor = '';

  // ── Hide navigation buttons ──
  dom.lbPrev.style.display = 'none';
  dom.lbNext.style.display = 'none';
  dom.lbPurportBtn.style.display = 'none';

  // ── Hide verse/purport toggle sections ──
  dom.lbVerseSection.classList.add('hidden');
  dom.lbPurportSection.classList.add('hidden');

  // ── Hide the shared chapter/hexagram heading ──
  dom.lbChapterHeading.textContent = '';
  dom.lbChapterHeading.classList.add('hidden');

  // ── Hide the chapter-end colophon ──
  dom.lbChapterEnd.textContent = '';
  dom.lbChapterEnd.classList.remove('visible');

  // ── Build wisdom body ──
  let html = '';

  // Section 1: Personal Meditation
  html += `<div class="lb-wisdom-section">
    <h2 style="text-align: center;">Wisdom Oracle’s guidance</h2>
    <h3 class="section-label">✦ The Personal Meditation</h3>
    <div class="lb-synonyms-wrap lb-guidance-special">
      ${escHtml(payload.guidance)}
    </div>
  </div>`;

  // Section 2: Current Circumstance (Gita)
  html += `<div class="lb-wisdom-section">
    <h3 class="section-label">✦ The Current Circumstance</h3>
    <div class="lb-translation" style="border-left-color: var(--accent);">
      ${escHtml(payload.gitaTranslation)}
    </div>
    <div class="intro-btn-row">
      <button class="btn btn-primary" id="wo-goto-gita" data-chapter="${payload.gitaChapter}" data-ref="${payload.gitaRef}">
        Read Gītā Wisdom verse ${payload.gitaChapter}.${payload.gitaRef}
      </button>
    </div>
  </div>`;

  // Section 3: Insightful Inspiration (iChing)
  html += `<div class="lb-wisdom-section">
    <h3 class="section-label">✦ The Insightful Inspiration</h3>
    <div class="lb-translation">
      ${escHtml(payload.ichingTranslation)}
    </div>
    <div class="intro-btn-row">
      <button class="btn btn-primary btn-primary--iching" id="wo-goto-iching" data-ref="${payload.ichingRef}">
        Read iChing Oracle hexagram ${payload.ichingRef}
      </button>
    </div>
  </div>`;

  // Inject into a dedicated wisdom container (create if missing)
  let wisdomBody = document.getElementById('lb-wisdom-body');
  if (!wisdomBody) {
    wisdomBody = document.createElement('div');
    wisdomBody.id = 'lb-wisdom-body';
    const lbBody = dom.lbCard.querySelector('.lb-body');
    (lbBody ?? dom.lbCard).appendChild(wisdomBody);
  }
  wisdomBody.innerHTML = html;
  wisdomBody.classList.remove('hidden');

  // ── Footer ──
  dom.lbFooter.textContent = 'Wisdom Oracle — Use it for daily reflection, study, and spiritual guidance with hope and love.';

  // ── Show COPY / SHARE (share combines all 3 texts) ──
  dom.lbCopyBtn.style.display = '';
  dom.lbShareBtn.style.display = '';

  // ── Wire the "Read full..." buttons ──
  document.getElementById('wo-goto-gita')?.addEventListener('click', () => {
    state.oracleOrigin = true;
    displayVerse(payload.gitaChapter, payload.gitaRef);
  });

  document.getElementById('wo-goto-iching')?.addEventListener('click', () => {
    state.oracleOrigin = true;
    displayHexagram(payload.ichingRef);
  });

  // Scroll to top
  dom.lbCard.scrollTop = 0;

  if (fromBookmarks) {
    state.bookmarksOrigin = false;
    import('./bookmarks.js').then(({ openBookmarksModal }) => {
      setTimeout(() => openBookmarksModal(), 60);
    });
    return;
  }
}

/**
 * Opens the lightbox in Wisdom Oracle mode.
 * Hides normal verse/purport sections, shows wisdom composite.
 */
function openWisdomLightbox(payload) {
  const dom = getDom();

  // Hide any previous wisdom body if reopening
  const oldWisdom = document.getElementById('lb-wisdom-body');
  if (oldWisdom) oldWisdom.classList.add('hidden');

  renderWisdomOracle(payload);
  openLightbox();
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  openLightbox,
  closeLightbox,
  renderVerse,
  displayVerse,
  displayHexagram,
  togglePurport,
  applyLightboxBranding,
  updateBottomButtons,
  applyFontSize,
  increaseFontSize,
  decreaseFontSize,
  goNext,
  goPrev,
  setNavDisabled,
  initSwipe,
  // ── NEW: Wisdom Oracle helpers ──
  renderWisdomOracle,   // builds the 3-section card body
  openWisdomLightbox,   // opens lb-card in wisdom mode (no nav)
};