/**
 * search-ui.js
 * Wisdom Oracle — Search Card UI controller (v1.0.10)
 *
 * Responsibilities:
 *   • Fetch assets/data/search.json and inject the card DOM once.
 *   • Manage open / close state of the search card.
 *   • Handle mode switching (Verse / Purport).
 *   • Render paginated results with highlighted snippets.
 *   • Bridge search results ↔ verse lightbox (searchOrigin flow):
 *       result click  → close search card → open verse lightbox
 *       lightbox close → reopen search card at previous scroll + results
 *
 * Renamed from searchController.js to search-ui.js per v1.0.10 architecture.
 */

'use strict';

// ─── Module state ─────────────────────────────────────────────────────────────
let _engine    = null;   // GitaSearch instance
let _cb        = {};     // callbacks: { displayVerse, appState, increaseFontSize, decreaseFontSize }
let _s         = {};     // string map from search.json

let _mode      = 'verse';
let _results   = [];     // current full Fuse result set
let _page      = 1;
const PAGE_SIZE = 50;

let _savedScrollTop = 0; // restored when returning from verse card

// DOM refs — populated after card HTML is injected
let _dom = {};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the controller.
 * Fetches search.json, builds the card, binds all events.
 *
 * @param {import('./fuse-search.js').GitaSearch} engine
 * @param {object} callbacks — { displayVerse, appState, increaseFontSize, decreaseFontSize }
 */
export async function initSearchController(engine, callbacks) {
  _engine = engine;
  _cb     = callbacks;

  try {
    const res = await fetch('assets/data/search.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _s = await res.json();
  } catch (err) {
    console.error('[SearchController] Failed to load search.json:', err);
    return;
  }

  _buildCard();
  _bindEvents();
}

/**
 * Called by app.js once GitaSearch.init() resolves.
 * Removes the pending state from mode buttons so the user can search.
 */
export function enableSearchButtons() {
  _dom.btnVerse?.classList.remove('search-mode-btn--pending');
  _dom.btnPurport?.classList.remove('search-mode-btn--pending');
  _hideStatus();
}

/** Open the search card (exported so app.js can call it from closeLightbox). */
export function openSearchCard() {
  const card = document.getElementById('search-card');
  if (!card) return;

  card.classList.add('open');
  document.body.classList.add('lb-active');
  _setNavActive(true);

  // If returning from a verse card, restore previous results + scroll
  if (_cb.appState?.searchOrigin) {
    requestAnimationFrame(() => {
      if (_dom.results) _dom.results.scrollTop = _savedScrollTop;
    });
  } else {
    setTimeout(() => _dom.input?.focus(), 120);
  }
}

/** Close the search card and clear searchOrigin. */
export function closeSearchCard() {
  const card = document.getElementById('search-card');
  if (!card) return;

  card.classList.remove('open');
  document.body.classList.remove('lb-active');
  _setNavActive(false);

  if (_cb.appState) _cb.appState.searchOrigin = false;
}

// ─── Card builder ─────────────────────────────────────────────────────────────

/**
 * Injects the search card HTML into the #search-card-mount container.
 * Caches DOM references for all interactive elements.
 */
function _buildCard() {
  const mount = document.getElementById('search-card-mount');
  if (!mount) return;

  mount.innerHTML = `
<div id="search-card" class="lightbox"
     role="dialog" aria-modal="true"
     aria-label="${_e(_s['page-name'] ?? 'Gītā Search')}">

  <div id="search-overlay" class="lb-overlay"></div>

  <article class="lb-card lb-card--search">

    <!-- ── Header ── -->
    <header class="lb-header">
      <div class="lb-author">
        <img src="${_e(_s.icon ?? 'assets/images/ACBhaktivedantaSwami.png')}"
             alt="" class="lb-author-icon"
             width="28" height="28" draggable="false" />
        <span class="lb-author-name">
          <strong>${_e(_s['h1'] ?? 'Search the Bhagavad Gītā')}</strong>
        </span>
      </div>
      <div class="lb-header-actions">
        <button class="lb-icon-btn lb-font-btn lb-font-decrease"
                title="Decrease text size"
                aria-label="Decrease text size">Aᴀ−</button>
        <button class="lb-icon-btn lb-font-btn lb-font-increase"
                title="Increase text size"
                aria-label="Increase text size">+ᴀA</button>
        <button id="search-close" class="lb-close-btn"
                title="Close (Esc)"
                aria-label="Close search">&times;</button>
      </div>
    </header>

    <!-- ── Body ── -->
    <div class="lb-body">

      <div class="search-input-row">
        <input id="search-input"
               class="search-field"
               type="search"
               inputmode="search"
               placeholder="${_e(_s['input-placeholder'] ?? 'Search…')}"
               autocomplete="off"
               autocorrect="off"
               spellcheck="false"
               aria-label="Search term" />
      </div>

      <div class="search-mode-row" role="group" aria-label="Search mode">
        <button id="search-btn-verse"
                class="btn search-mode-btn search-mode-btn--active search-mode-btn--pending"
                aria-pressed="true">
          ${_e(_s['btn-verse'] ?? 'Verse Search')}
        </button>
        <button id="search-btn-purport"
                class="btn search-mode-btn search-mode-btn--pending"
                aria-pressed="false">
          ${_e(_s['btn-purport'] ?? 'Purport Search')}
        </button>
      </div>

      <p id="search-status"
         class="search-status hidden"
         role="status"
         aria-live="polite"></p>

      <div id="search-results"
           class="search-results"
           role="list"></div>

    </div><!-- /.lb-body -->

    <!-- ── Footer ── -->
    <footer class="lb-footer-bar">
      <span id="search-footer-text" class="lb-footer-text">
        ${_e(_s.footer ?? '')}
      </span>
      <nav class="lb-nav-row" aria-label="Results pagination">
        <button id="search-prev" class="lb-nav-btn hidden"
                aria-label="Previous results page">
          ${_e(_s['btn-prev'] ?? '◀ Prev')}
        </button>
        <span id="search-page-info" class="search-page-info"></span>
        <button id="search-next" class="lb-nav-btn hidden"
                aria-label="Next results page">
          ${_e(_s['btn-next'] ?? 'Next ▶')}
        </button>
      </nav>
    </footer>

  </article>
</div>`;

  // Cache refs
  const root = document.getElementById('search-card');
  _dom = {
    card:       root,
    overlay:    document.getElementById('search-overlay'),
    closeBtn:   document.getElementById('search-close'),
    input:      document.getElementById('search-input'),
    btnVerse:   document.getElementById('search-btn-verse'),
    btnPurport: document.getElementById('search-btn-purport'),
    status:     document.getElementById('search-status'),
    results:    document.getElementById('search-results'),
    footerText: document.getElementById('search-footer-text'),
    prev:       document.getElementById('search-prev'),
    pageInfo:   document.getElementById('search-page-info'),
    next:       document.getElementById('search-next'),
    fontInc:    root.querySelector('.lb-font-increase'),
    fontDec:    root.querySelector('.lb-font-decrease'),
  };
}

// ─── Event binding ────────────────────────────────────────────────────────────

/**
 * Attaches all event listeners to the search card after DOM injection.
 */
function _bindEvents() {
  if (!_dom.card) return;

  // Close — button and backdrop
  _dom.closeBtn.addEventListener('click', closeSearchCard);
  _dom.overlay.addEventListener('click', closeSearchCard);

  // Keyboard — Escape closes; no conflict with app.js (that guard requires lightbox open)
  document.addEventListener('keydown', e => {
    if (!_dom.card?.classList.contains('open')) return;
    if (e.key === 'Escape') closeSearchCard();
  });

  /*
  // Mode buttons
  _dom.btnVerse.addEventListener('click', () => {
    if (_dom.btnVerse.classList.contains('search-mode-btn--pending')) {
      _showStatus(_s['msg-indexing']);
      return;
    }
    _setMode('verse');
  });

  _dom.btnPurport.addEventListener('click', () => {
    if (_dom.btnPurport.classList.contains('search-mode-btn--pending')) {
      _showStatus(_s['msg-indexing']);
      return;
    }
    _setMode('purport');
  });
  commented for testing only */
  _dom.btnVerse.addEventListener('click', () => {
    console.log('[WO-DEBUG] Verse Search mode clicked');
    if (_dom.btnVerse.classList.contains('search-mode-btn--pending')) {
      _showStatus(_s['msg-indexing']);
      return;
    }
    _setMode('verse');
  });

  _dom.btnPurport.addEventListener('click', () => {
    console.log('[WO-DEBUG] Purport Search mode clicked');
    if (_dom.btnPurport.classList.contains('search-mode-btn--pending')) {
      _showStatus(_s['msg-indexing']);
      return;
    }
    _setMode('purport');
  });

  // Search — Enter key submits
  _dom.input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (!_engine?.ready) { _showStatus(_s['msg-indexing']); return; }
    _runSearch();
  });

  // Pagination
  _dom.prev.addEventListener('click', () => _goToPage(_page - 1));
  _dom.next.addEventListener('click', () => _goToPage(_page + 1));

  // Font-size — delegate to app.js callbacks
  /* commented for test in production
  _dom.fontInc.addEventListener('click', () => _cb.increaseFontSize?.());
  _dom.fontDec.addEventListener('click', () => _cb.decreaseFontSize?.());
  remove comments and next block */

  _dom.fontInc.addEventListener('click', () => {
    console.log('[WO-DEBUG] Search font increase clicked');
    _cb.increaseFontSize?.();
  });
  _dom.fontDec.addEventListener('click', () => {
    console.log('[WO-DEBUG] Search font decrease clicked');
    _cb.decreaseFontSize?.();
  });

  // Nav button
  const navBtn = document.getElementById('search-nav-btn');
  if (navBtn) {
    navBtn.addEventListener('click', () => {
      _dom.card?.classList.contains('open') ? closeSearchCard() : openSearchCard();
    });
  }
}

// ─── Search logic ─────────────────────────────────────────────────────────────

/**
 * Executes a search using the current query and mode, then renders the first page.
 */
function _runSearch() {
  const term = _dom.input?.value.trim() ?? '';
  if (!term) return;

  _results = _engine.search(term, _mode);
  _page    = 1;

  if (_results.length === 0) {
    _showStatus(_s['msg-no-results']);
    _dom.results.innerHTML = '';
    _hidePagination();
    return;
  }

  _hideStatus();
  _renderPage();
}

/**
 * Renders the current page of search results into the results container.
 * Binds click and keyboard handlers to each result item for opening the verse.
 */
function _renderPage() {
  const start = (_page - 1) * PAGE_SIZE;
  const end   = Math.min(start + PAGE_SIZE, _results.length);
  const slice = _results.slice(start, end);

  _dom.results.innerHTML = slice
    .map(r => _buildResultHTML(r))
    .join('');

  // Bind click + keyboard on each result item
  _dom.results.querySelectorAll('.search-result-item').forEach(el => {
    const activate = () => {
      const chapter = parseInt(el.dataset.chapter, 10);
      const ref     = el.dataset.ref;

      _savedScrollTop = _dom.results.scrollTop;

      if (_cb.appState) _cb.appState.searchOrigin = true;

      // Keep lb-active on body — closeLightbox will not remove it when
      // searchOrigin is true, so no flash of the landing page.
      closeSearchCard();
      _cb.displayVerse?.(chapter, ref);
    };

    el.addEventListener('click', activate);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });

  _updateFooter(start + 1, end, _results.length);
  _updatePagination();
  _dom.results.scrollTop = 0;
}

/**
 * Builds the HTML for a single search result item.
 *
 * @param {object} result — a Fuse.js result object with item and matches
 * @returns {string} — HTML string for the result item
 */
function _buildResultHTML(result) {
  const { chapter, ref, chapterTitle } = result.item;
  const snippet  = _engine.buildSnippet(result, _mode);

  // Strip leading "N. " ordinal that some titles carry
  const title = chapterTitle.includes('. ')
    ? chapterTitle.split('. ').slice(1).join('. ')
    : chapterTitle;

  return `<div class="search-result-item"
               role="listitem"
               tabindex="0"
               data-chapter="${chapter}"
               data-ref="${_e(ref)}"
               aria-label="BG ${chapter}.${_e(ref)}">
  <span class="search-result-ref">BG&nbsp;${chapter}.${_e(ref)}</span>
  <span class="search-result-chapter">${_e(title)}</span>
  <p class="search-result-snippet">${snippet}</p>
</div>`;
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

/**
 * Navigates to a specific page number and re-renders.
 *
 * @param {number} page — the target page number (1-based)
 */
function _goToPage(page) {
  const total = Math.ceil(_results.length / PAGE_SIZE);
  _page = Math.max(1, Math.min(page, total));
  _renderPage();
  _dom.results.scrollTop = 0;
}

/**
 * Updates the footer text with the current result range.
 *
 * @param {number} start — first result number on this page
 * @param {number} end   — last result number on this page
 * @param {number} total — total number of results
 */
function _updateFooter(start, end, total) {
  const tpl = _s['msg-results-count'] ?? 'Showing {start}–{end} of {total} results';
  _dom.footerText.textContent = tpl
    .replace('{start}', start)
    .replace('{end}',   end)
    .replace('{total}', total);
}

/**
 * Shows/hides pagination buttons and updates page indicator.
 */
function _updatePagination() {
  const total = Math.ceil(_results.length / PAGE_SIZE);
  _dom.prev.classList.toggle('hidden', _page <= 1);
  _dom.next.classList.toggle('hidden', _page >= total);
  _dom.pageInfo.textContent = total > 1 ? `${_page} / ${total}` : '';
}

/**
 * Hides all pagination controls.
 */
function _hidePagination() {
  _dom.prev.classList.add('hidden');
  _dom.next.classList.add('hidden');
  _dom.pageInfo.textContent = '';
  _dom.footerText.textContent = _s.footer ?? '';
}

// ─── Mode switch ──────────────────────────────────────────────────────────────

/**
 * Switches between verse search and purport search modes.
 * Re-runs the current query if results already exist.
 *
 * @param {'verse'|'purport'} mode — the target search mode
 */
function _setMode(mode) {
  if (mode === _mode) return;
  _mode = mode;

  _dom.btnVerse.classList.toggle('search-mode-btn--active',  mode === 'verse');
  _dom.btnPurport.classList.toggle('search-mode-btn--active', mode === 'purport');
  _dom.btnVerse.setAttribute('aria-pressed',  mode === 'verse'   ? 'true' : 'false');
  _dom.btnPurport.setAttribute('aria-pressed', mode === 'purport' ? 'true' : 'false');

  // Re-run if there is an active query
  if (_dom.input?.value.trim() && _results.length > 0) _runSearch();
}

// ─── Status helpers ───────────────────────────────────────────────────────────

/**
 * Shows a status message (e.g. "Indexing…" or "No results").
 * @param {string} msg — the message to display
 */
function _showStatus(msg) {
  if (!_dom.status) return;
  _dom.status.textContent = msg ?? '';
  _dom.status.classList.remove('hidden');
}

/** Hides the status message. */
function _hideStatus() {
  if (!_dom.status) return;
  _dom.status.classList.add('hidden');
  _dom.status.textContent = '';
}

// ─── Nav button active state ──────────────────────────────────────────────────

/**
 * Toggles the active state on the top-nav search button.
 * @param {boolean} active — whether the search card is currently open
 */
function _setNavActive(active) {
  document.getElementById('search-nav-btn')
    ?.classList.toggle('top-nav-btn--active', active);
}

// ─── HTML escape ─────────────────────────────────────────────────────────────

/**
 * Escapes HTML special characters for safe insertion into HTML.
 * @param {string} str — the string to escape
 * @returns {string} — escaped HTML string
 */
function _e(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}