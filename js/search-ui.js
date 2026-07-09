/**
 * search-ui.js
 * Wisdom Oracle — Search Card UI controller
 */

'use strict';

// ─── Module state ─────────────────────────────────────────────────────────────
let _engine    = null;
let _cb        = {};
let _s         = {};

let _mode      = 'verse';
let _results   = [];
let _page      = 1;
const PAGE_SIZE = 50;

let _savedScrollTop = 0;
let _lastQueryWords = [];

let _dom = {};

// ─── Public API ───────────────────────────────────────────────────────────────

export async function initSearchController(engine, callbacks) {
  _engine = engine;
  _cb     = callbacks;

  try {
    const res = await fetch(new URL('../assets/data/search.json', import.meta.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _s = await res.json();
  } catch (err) {
    console.error('[SearchController] Failed to load search.json:', err);
    return;
  }

  _buildCard();
  _bindEvents();
}

export function enableSearchButtons() {
  _dom.btnVerse?.classList.remove('search-mode-btn--pending');
  _dom.btnPurport?.classList.remove('search-mode-btn--pending');
  _hideStatus();
}

export function openSearchCard() {
  const card = document.getElementById('search-card');
  if (!card) return;

  card.classList.add('open');
  document.body.classList.add('lb-active');
  _setNavActive(true);

  if (_cb.appState?.searchOrigin) {
    requestAnimationFrame(() => {
      if (_dom.results) _dom.results.scrollTop = _savedScrollTop;
    });
  } else {
    setTimeout(() => _dom.input?.focus(), 120);
  }
}

export function closeSearchCard() {
  const card = document.getElementById('search-card');
  if (!card) return;

  card.classList.remove('open');
  document.body.classList.remove('lb-active');
  _setNavActive(false);

  const viewingResult = !!_cb.appState?.searchOrigin;

  if (!viewingResult) {
    if (_dom.input) _dom.input.value = '';
    _results = [];
    _page    = 1;
    _lastQueryWords = [];
    if (_dom.results) _dom.results.innerHTML = '';
    _hideStatus();
    _hidePagination();
  }

  if (_cb.appState) _cb.appState.searchOrigin = false;
}

// ─── Card builder ─────────────────────────────────────────────────────────────

function _buildCard() {
  const mount = document.getElementById('search-card-mount');
  if (!mount) return;

  mount.innerHTML = `
<div id="search-card" class="lightbox"
     role="dialog" aria-modal="true"
     aria-label="${_e(_s['page-name'] ?? 'Gītā Search')}">

  <div id="search-overlay" class="lb-overlay"></div>

  <article class="lb-card lb-card--search">

    <header class="lb-header">
      <div class="lb-author">
        <img src="${_e(_s.icon ?? 'assets/images/imgfooter.png')}"
             alt="" class="lb-author-icon"
             width="28" height="28" draggable="false" />
        <span class="lb-author-name">
          <strong>${_e(_s['h1'] ?? 'Search')}</strong>
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

    <div class="lb-body">

      <div class="search-input-row">
        <div class="lb-wisdom-section">
          <h3 class="section-label">✦ Search the Gītā Wisdom</h3>
          <ul class="lb-info-list">
            <li><strong>Verse</strong> searches the English verse translation.</li>
            <li><strong>Purport</strong> searches the original commentaries by 
            <br />&nbsp;&nbsp;&nbsp;<i>Śrīla A.C. Bhaktivedānta Swami Prabhupāda</i>.</li>
            <li>Supports search for one or more words.</li>
            <li><strong>Matching terms</strong> are <mark>highlighted</mark> in the results.</li>
          </ul>
        </div>
        <input id="search-input"
               class="search-field"
               type="search"
               inputmode="search"
               placeholder="${_e(_s['input-placeholder'] ?? 'Search Verse or Purport…')}"
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

    </div>

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

function _bindEvents() {
  if (!_dom.card) return;

  _dom.closeBtn.addEventListener('click', closeSearchCard);
  _dom.overlay.addEventListener('click', closeSearchCard);

  document.addEventListener('keydown', e => {
    if (!_dom.card?.classList.contains('open')) return;
    if (e.key === 'Escape') closeSearchCard();
  });

  _dom.btnVerse.addEventListener('click', () => {
    if (_dom.btnVerse.classList.contains('search-mode-btn--pending')) {
      _showStatus(_s['msg-indexing']);
      return;
    }
    _setMode('verse');
    _runSearch();
  });

  _dom.btnPurport.addEventListener('click', () => {
    if (_dom.btnPurport.classList.contains('search-mode-btn--pending')) {
      _showStatus(_s['msg-indexing']);
      return;
    }
    _setMode('purport');
    _runSearch();
  });

  _dom.input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (!_engine?.ready) { _showStatus(_s['msg-indexing']); return; }
    _runSearch();
  });

  _dom.prev.addEventListener('click', () => _goToPage(_page - 1));
  _dom.next.addEventListener('click', () => _goToPage(_page + 1));

  _dom.fontInc.addEventListener('click', () => {
    _cb.increaseFontSize?.();
  });
  _dom.fontDec.addEventListener('click', () => {
    _cb.decreaseFontSize?.();
  });

  const navBtn = document.getElementById('search-nav-btn');
  if (navBtn) {
    navBtn.addEventListener('click', () => {
      _dom.card?.classList.contains('open') ? closeSearchCard() : openSearchCard();
    });
  }
}

// ─── Search logic ─────────────────────────────────────────────────────────────

function _runSearch() {
  const term = _dom.input?.value.trim() ?? '';
  if (!term) {
    _showStatus(_s['msg-empty-term'] ?? 'Type something to search for.');
    _dom.results.innerHTML = '';
    _hidePagination();
    return;
  }

  // Extract query words for highlighting — same normalization/stopword
  // logic the search itself used, so display highlighting matches exactly
  _lastQueryWords = _engine.getHighlightTerms(term);

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

function _renderPage() {
  const start = (_page - 1) * PAGE_SIZE;
  const end   = Math.min(start + PAGE_SIZE, _results.length);
  const slice = _results.slice(start, end);

  _dom.results.innerHTML = slice
    .map(r => _buildResultHTML(r))
    .join('');

  _dom.results.querySelectorAll('.search-result-item').forEach(el => {
    const activate = () => {
      const chapter = parseInt(el.dataset.chapter, 10);
      const ref     = el.dataset.ref;

      _savedScrollTop = _dom.results.scrollTop;

      if (_cb.appState) _cb.appState.searchOrigin = true;

      // (unrelated - just closeSearchCard() as before)
      closeSearchCard();
      _cb.displayVerse?.(chapter, ref, false, _lastQueryWords);
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

function _buildResultHTML(result) {
  const { chapter, ref, chapterTitle } = result.item;
  const snippet = _engine.buildSnippet(result, _mode, _lastQueryWords);

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

function _goToPage(page) {
  const total = Math.ceil(_results.length / PAGE_SIZE);
  _page = Math.max(1, Math.min(page, total));
  _renderPage();
  _dom.results.scrollTop = 0;
}

function _updateFooter(start, end, total) {
  const tpl = _s['msg-results-count'] ?? 'Showing {start}–{end} of {total} results';
  _dom.footerText.textContent = tpl
    .replace('{start}', start)
    .replace('{end}',   end)
    .replace('{total}', total);
}

function _updatePagination() {
  const total = Math.ceil(_results.length / PAGE_SIZE);
  _dom.prev.classList.toggle('hidden', _page <= 1);
  _dom.next.classList.toggle('hidden', _page >= total);
  _dom.pageInfo.textContent = total > 1 ? `${_page} / ${total}` : '';
}

function _hidePagination() {
  _dom.prev.classList.add('hidden');
  _dom.next.classList.add('hidden');
  _dom.pageInfo.textContent = '';
  _dom.footerText.textContent = _s.footer ?? '';
}

// ─── Mode switch ──────────────────────────────────────────────────────────────

function _setMode(mode) {
  if (mode === _mode) return;
  _mode = mode;

  _dom.btnVerse.classList.toggle('search-mode-btn--active',  mode === 'verse');
  _dom.btnPurport.classList.toggle('search-mode-btn--active', mode === 'purport');
  _dom.btnVerse.setAttribute('aria-pressed',  mode === 'verse'   ? 'true' : 'false');
  _dom.btnPurport.setAttribute('aria-pressed', mode === 'purport' ? 'true' : 'false');
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function _showStatus(msg) {
  if (!_dom.status) return;
  _dom.status.textContent = msg ?? '';
  _dom.status.classList.remove('hidden');
}

function _hideStatus() {
  if (!_dom.status) return;
  _dom.status.classList.add('hidden');
  _dom.status.textContent = '';
}

function _setNavActive(active) {
  document.getElementById('search-nav-btn')
    ?.classList.toggle('top-nav-btn--active', active);
}

// ─── HTML escape ─────────────────────────────────────────────────────────────

function _e(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}