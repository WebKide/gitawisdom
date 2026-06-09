/**
 * app.js
 * Wisdom Oracle — Application entry point (v1.0.10)
 *
 * Responsibilities:
 *   • Initialize shared application state
 *   • Cache all DOM references in a single `dom` object
 *   • Wire event listeners by importing handlers from split modules
 *   • Register the service worker
 *   • Initialize the top-nav intersection observer
 *   • Load and apply the persisted font size on startup
 *
 * Architecture: app.js imports lightbox.js, oracle-forms.js, and share-utils.js.
 * lightbox.js imports from gitacore.js and ichingcore.js.
 * oracle-forms.js imports displayVerse and displayHexagram from lightbox.js.
 * share-utils.js is leaf-level (no circular deps).
 */

'use strict';

import {
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
} from './lightbox.js';

import {
  handleGitaSubmit,
  handleGitaRandom,
  handleIChingSubmit,
  handleIChingRandom,
  initChapterSelect,
  getSelectedChapter,
  setSelectedChapter,
  showError,
  clearErrors,
} from './oracle-forms.js';

import {
  handleCopy,
  handleShare,
  openInfoModal,
  initUsageModal,
  initAboutModal,
  escHtml,
} from './share-utils.js';

import { GitaSearch } from './fuse-search.js';
import {
  initSearchController,
  enableSearchButtons,
  openSearchCard,
  closeSearchCard as closeSearchCardUI,
} from './search-ui.js';

// —>
console.log('[WO-BOOT] app.js loading, window._woState=', window._woState, 'window._woDom=', window._woDom);
//—>

// ─── Font-size limits ───────────────────────────────────────────────────────
const FONT_MIN     = 12;
const FONT_MAX     = 24;
const FONT_DEFAULT = 16;

// ─── Application state ────────────────────────────────────────────────────────
/**
 * Central state object shared across all modules.
 * Keys are documented so junior devs know which module owns each field.
 *
 * @typedef {Object} AppState
 * @property {string}  mode         — 'gita' | 'iching', set by lightbox.js
 * @property {boolean} showPurport  — whether purport/commentary mode is active
 * @property {boolean} loading      — guard against concurrent loads
 * @property {number}  fontSize     — persisted via localStorage, managed by lightbox.js
 * @property {number|null}  chapter     — current Gita chapter (lightbox.js)
 * @property {string|null}  verseRef    — canonical Gita ref, e.g. "4" or "26-27" (lightbox.js)
 * @property {object|null}  chapterData — full parsed Gita JSON for the chapter (lightbox.js)
 * @property {object|null}  verseData   — the specific Gita verse object (lightbox.js)
 * @property {string|null}  hexRef      — current iChing ref, e.g. "17" (lightbox.js)
 * @property {object|null}  ichingData  — full parsed iChing JSON (lightbox.js)
 * @property {object|null}  hexData     — the specific hexagram object (lightbox.js)
 * @property {boolean}      searchOrigin — true when lightbox opened from a search result
 */
const state = {
  mode:         'gita',
  showPurport:  false,
  loading:      false,
  fontSize:     (() => {
    try {
      const s = parseInt(localStorage.getItem('wo_font_size'), 10);
      return (!isNaN(s) && s >= FONT_MIN && s <= FONT_MAX) ? s : FONT_DEFAULT;
    } catch (_) { return FONT_DEFAULT; }
  })(),

  chapter:      null,
  verseRef:     null,
  chapterData:  null,
  verseData:    null,

  hexRef:       null,
  ichingData:   null,
  hexData:      null,

  searchOrigin: false,
  oracleOrigin: false,
};

// ─── DOM references ───────────────────────────────────────────────────────────
/**
 * Single cache of all DOM nodes queried by id. This avoids repeated
 * document.getElementById() calls and makes the dependency graph explicit.
 */
const dom = {
  // ── Gita landing controls ──────────────────────────────────────────────────
  gitaForm:        document.getElementById('gita-form'),
  gitaVerseInput:  document.getElementById('gita-verse-input'),
  gitaRandomBtn:   document.getElementById('gita-random-btn'),
  gitaErrorBox:    document.getElementById('gita-error-box'),

  // ── iChing landing controls ────────────────────────────────────────────────
  ichingForm:      document.getElementById('iching-form'),
  ichingInput:     document.getElementById('iching-input'),
  ichingBtn:       document.getElementById('iching-btn'),
  ichingErrorBox:  document.getElementById('iching-error-box'),

  // ── Lightbox shell ─────────────────────────────────────────────────────────
  lightbox:        document.getElementById('lightbox'),
  lbOverlay:       document.getElementById('lb-overlay'),
  lbCard:          document.getElementById('lb-card'),
  lbClose:         document.getElementById('lb-close'),
  lbPrev:          document.getElementById('lb-prev'),
  lbNext:          document.getElementById('lb-next'),

  // Header branding (swapped between modes by lightbox.js)
  lbAuthorIcon:    document.getElementById('lb-author-icon'),
  lbAuthorTitle:   document.getElementById('lb-author-title'),

  // Purport/commentary toggle buttons
  lbPurportBtn:    document.getElementById('lb-purport-btn'),
  lbFontIncrease:  document.getElementById('lb-font-increase'),
  lbFontDecrease:  document.getElementById('lb-font-decrease'),

  // ── Content sections ───────────────────────────────────────────────────────
  lbVerseSection:   document.getElementById('lb-verse-section'),
  lbPurportSection: document.getElementById('lb-purport-section'),

  // Verse-section nodes (display order: translation → sanskrit → synonyms)
  lbChapterHeading: document.getElementById('lb-chapter-heading'),
  lbTextNum:        document.getElementById('lb-text-num'),
  lbTranslation:    document.getElementById('lb-translation'),
  lbSanskrit:       document.getElementById('lb-sanskrit'),
  lbSynonyms:       document.getElementById('lb-synonyms'),
  lbOpenPurportBtn: document.getElementById('lb-open-purport-btn'),

  // Purport-section nodes
  lbPurport:        document.getElementById('lb-purport'),
  lbReturnBtn:      document.getElementById('lb-return-btn'),

  // Footer / meta
  lbFooter:         document.getElementById('lb-footer'),
  lbChapterEnd:     document.getElementById('lb-chapter-end'),

  // Share / Copy
  lbCopyBtn:        document.getElementById('lb-copy-btn'),
  lbShareBtn:       document.getElementById('lb-share-btn'),

  // Share PNG card elements
  sharePngCard:      document.getElementById('share-png-card'),
  sharePngTitle:     document.querySelector('.share-png-title'),
  sharePngVerse:     document.querySelector('.share-png-verse'),
  sharePngFooter:    document.querySelector('.share-png-footer'),
};

// ─── Expose state and dom to dependent modules ──────────────────────────────
// These are attached to window so that split modules can access them without
// creating circular import chains. This is a deliberate architectural choice
// for a small PWA where module granularity is valued over pure encapsulation.
window._woState = state;
window._woDom   = dom;

initSwipe();

// ─── Service Worker Registration ─────────────────────────────────────────────
/**
 * Register the service worker for offline capability.
 * The SW is at sw.js relative to the app root.
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(reg => console.log('SW registered:', reg.scope))
    .catch(err => console.error('SW failed:', err));
}

// —>

// ─── Debug logging wrapper ────────────────────────────────────────────────────
/**
 * Wraps all event handlers with try/catch + console logging so we can see
 * exactly which button fails and why, without the generic fallback hiding it.
 * 
 * Usage: wrapHandler('buttonName', originalHandler)
 */
function wrapHandler(name, fn) {
  return function wrappedHandler(...args) {
    console.log(`[WO-DEBUG] ▶ ${name} clicked`, args[0]?.type || '');
    try {
      const result = fn.apply(this, args);
      if (result && typeof result.then === 'function') {
        result
          .then(v => console.log(`[WO-DEBUG] ✓ ${name} resolved`, v))
          .catch(err => console.error(`[WO-DEBUG] ✗ ${name} rejected:`, err));
      } else {
        console.log(`[WO-DEBUG] ✓ ${name} completed (sync)`);
      }
      return result;
    } catch (err) {
      console.error(`[WO-DEBUG] ✗ ${name} threw synchronously:`, err);
      throw err;
    }
  };
}

// ─── Wrap all imported handlers before wiring ─────────────────────────────────
const _handleGitaSubmit = wrapHandler('handleGitaSubmit', handleGitaSubmit);
const _handleGitaRandom = wrapHandler('handleGitaRandom', handleGitaRandom);
const _handleIChingSubmit = wrapHandler('handleIChingSubmit', handleIChingSubmit);
const _handleIChingRandom = wrapHandler('handleIChingRandom', handleIChingRandom);
const _openLightbox = wrapHandler('openLightbox', openLightbox);
const _closeLightbox = wrapHandler('closeLightbox', closeLightbox);
const _togglePurport = wrapHandler('togglePurport', togglePurport);
const _goNext = wrapHandler('goNext', goNext);
const _goPrev = wrapHandler('goPrev', goPrev);
const _handleCopy = wrapHandler('handleCopy', handleCopy);
const _handleShare = wrapHandler('handleShare', handleShare);
const _increaseFontSize = wrapHandler('increaseFontSize', increaseFontSize);
const _decreaseFontSize = wrapHandler('decreaseFontSize', decreaseFontSize);

// —>

// ─── Event Wiring ─────────────────────────────────────────────────────────────
// Gita form and random button
dom.gitaForm.addEventListener('submit', _handleGitaSubmit);
dom.gitaRandomBtn.addEventListener('click', _handleGitaRandom);

// iChing form and random button
dom.ichingForm.addEventListener('submit', _handleIChingSubmit);
const ichingRandomBtn = document.getElementById('iching-random-btn');
if (ichingRandomBtn) ichingRandomBtn.addEventListener('click', _handleIChingRandom);

// Lightbox controls — close, overlay click, prev/next navigation
dom.lbClose.addEventListener('click', closeLightbox);
dom.lbOverlay.addEventListener('click', closeLightbox);
dom.lbPrev.addEventListener('click', goPrev);
dom.lbNext.addEventListener('click', goNext);

// Purport toggle — header return button and bottom buttons all share togglePurport
dom.lbPurportBtn.addEventListener('click', togglePurport);
dom.lbOpenPurportBtn.addEventListener('click', togglePurport);
dom.lbReturnBtn.addEventListener('click', togglePurport);

// Copy and Share handlers
dom.lbCopyBtn.addEventListener('click', _handleCopy);
dom.lbShareBtn.addEventListener('click', _handleShare);

/* console for production testing
// Font-size controls — delegated so every card participates without individual wiring
document.addEventListener('click', e => {
  if (e.target.closest('.lb-font-increase')) increaseFontSize();
  if (e.target.closest('.lb-font-decrease')) decreaseFontSize();
});
remove comment and delete next event listener click*/
// Font-size controls — delegated so every card participates without individual wiring
document.addEventListener('click', e => {
  const target = e.target;
  if (target.closest('.lb-font-increase') || target.closest('#lb-font-increase')) {
    console.log('[WO-DEBUG] font increase clicked');
    increaseFontSize();
  }
  if (target.closest('.lb-font-decrease') || target.closest('#lb-font-decrease')) {
    console.log('[WO-DEBUG] font decrease clicked');
    decreaseFontSize();
  }
});

// Prevent right-click / long-press context menu on all images
document.addEventListener('contextmenu', e => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});

// ─── Top Navigation: Banner fade / icon fade on scroll ───────────────────────
/**
 * Uses IntersectionObserver to fade the banner lotus image when it scrolls
 * out of view. The nav icon is shown immediately and never hidden.
 */
(function initTopNav() {
  const banner  = document.querySelector('.banner-lotus');
  const navIcon = document.querySelector('.top-nav-icon');
  if (!banner || !navIcon) return;

  // Show nav icon always
  navIcon.classList.add('visible');

  const observer = new IntersectionObserver(
    ([entry]) => {
      // Only fade the banner, never hide the nav icon
      banner.style.opacity = entry.isIntersecting ? '1' : '0';
    },
    { threshold: 0.2 }
  );

  observer.observe(banner);
})();

// ─── Chapter Dropdown Initialization ──────────────────────────────────────────
/**
 * Initialize the custom chapter dropdown for Gita chapter selection.
 * Exposes window._getSelectedChapter() and window._setSelectedChapter().
 */
initChapterSelect();

// ─── Apply Persisted Font Size ────────────────────────────────────────────────
/**
 * On startup, apply the font size persisted in localStorage (or the default)
 * to all .lb-card elements so the reader is immediately usable.
 */
applyFontSize();

// ─── Search Initialization ───────────────────────────────────────────────────
/**
 * Initialize the Fuse.js-powered Gita search engine and its UI controller.
 * This runs asynchronously in the background so the splash-to-oracle transition
 * is not delayed. The search buttons are enabled once indexing completes.
 */
(async function initSearch() {
  const gitaSearch = new GitaSearch();

  await initSearchController(gitaSearch, {
    displayVerse,
    appState:        state,
    increaseFontSize,
    decreaseFontSize,
  });

  // Start corpus build and indexing — resolves when Fuse is ready
  gitaSearch.init()
    .then(enableSearchButtons)
    .catch(err => console.error('[GitaSearch] Indexing failed:', err));
})();

// ─── Info Modal Initialization ────────────────────────────────────────────────
/**
 * Wire up the Usage and About modal click handlers.
 * These are delegated so they work even if the nav links are dynamically added.
 */
initUsageModal();
initAboutModal();

// ─── Keyboard Shortcuts (Global) ─────────────────────────────────────────────
/**
 * Global keyboard shortcuts that delegate to lightbox handlers.
 * Only active when the lightbox is open.
 */
document.addEventListener('keydown', e => {
  if (!dom.lightbox.classList.contains('open')) return;
  switch (e.key) {
    case 'ArrowRight': e.preventDefault(); goNext(); break;
    case 'ArrowLeft':  e.preventDefault(); goPrev(); break;
    case 'Escape':     e.preventDefault(); closeLightbox(); break;
    case 'p': case 'P': togglePurport(); break;
    case 'g': case 'G': closeLightbox(); setTimeout(handleGitaRandom, 80); break;
    case 'h': case 'H': closeLightbox(); setTimeout(handleIChingRandom, 80); break;
    case '+': case '=': increaseFontSize(); break;
    case '-': decreaseFontSize(); break;
  }
});

//—>
console.log('[WO-BOOT] app.js loaded, window._woState=', window._woState, 'window._woDom=', window._woDom);
