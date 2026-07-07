/**
 * bookmarks.js
 * Wisdom Oracle — Bookmark and highlight storage, UI, and modal
 *
 * Exports: initBookmarks, toggleBookmark, updateBookmarkUI,
 *          injectHighlight, openBookmarksModal, closeBookmarksModal,
 *          initFloatPanel
 */

'use strict';

// ─── Shared state / DOM accessors ───────────────────────────────────────────
const getState = () => window._woState;
const getDom   = () => window._woDom;

const STORAGE_KEYS = { bookmarks: 'wo_bookmarks', highlights: 'wo_highlights' };
const MAX_ITEMS = 250;

// ═════════════════════════════════════════════════════════════════════════════
//  State & persistence
// ═════════════════════════════════════════════════════════════════════════════

function initBookmarks() {
  const state = getState();
  state.bookmarks  = load(STORAGE_KEYS.bookmarks);
  state.highlights = load(STORAGE_KEYS.highlights);

  // Wire modal close button once during init
  const closeBtn = document.getElementById('bookmarks-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeBookmarksModal);
  }
}

function load(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : []; }
  catch (_) { return []; }
}

function persistBookmarks() {
  try { localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(getState().bookmarks)); }
  catch (_) {}
}

function persistHighlights() {
  try { localStorage.setItem(STORAGE_KEYS.highlights, JSON.stringify(getState().highlights)); }
  catch (_) {}
}

// ═════════════════════════════════════════════════════════════════════════════
//  Canonical ref & excerpt helpers
// ═════════════════════════════════════════════════════════════════════════════

function getRef() {
  const s = getState();
  if (s.mode === 'gita')  return s.chapter + '.' + s.verseRef;
  if (s.mode === 'iching') return s.hexRef;
  return null;
}

function getType() {
  return getState().mode === 'iching' ? 'hexagram' : 'verse';
}

function getExcerpt() {
  const s = getState();
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    const r = sel.getRangeAt(0);
    const p = document.getElementById('lb-purport');
    if (p && p.contains(r.commonAncestorContainer)) return sel.toString().trim().slice(0, 120);
  }

  const d = s.mode === 'gita' ? s.verseData : s.hexData;
  if (!d) return '';
  const t = (d['Translation-En'] || '').trim();
  return (t.split(/[.!?]/)[0] + '.').slice(0, 120);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Header bookmark button
// ═════════════════════════════════════════════════════════════════════════════

function toggleBookmark() {
  const s = getState();
  if (s.mode === 'wisdom') return;
  const ref = getRef();
  if (!ref) return;

  // In purport view: if a highlight exists for this ref, remove it immediately
  if (s.showPurport) {
    const hi = s.highlights.findIndex(h => h.ref === ref);
    if (hi !== -1) {
      s.highlights.splice(hi, 1);
      persistHighlights();
      injectHighlight();
      updateBookmarkUI();
      return;
    }
  }

  const type = getType();
  const idx  = s.bookmarks.findIndex(b => b.ref === ref && b.type === type);

  if (idx !== -1) {
    s.bookmarks.splice(idx, 1);
    persistBookmarks();
  } else {
    if (s.bookmarks.length >= MAX_ITEMS) { flashError(); return; }
    s.bookmarks.push({ type, ref, excerpt: getExcerpt() });
    persistBookmarks();
  }
  updateBookmarkUI();
}

function flashError() {
  const btn = document.getElementById('lb-bookmark-btn');
  if (!btn) return;
  btn.style.color = 'var(--red-btn)';
  setTimeout(() => { btn.style.color = ''; }, 2000);
}

function updateBookmarkUI() {
  const s = getState();
  const btn = document.getElementById('lb-bookmark-btn');
  if (!btn) return;

  if (s.mode === 'wisdom') { btn.style.display = 'none'; return; }
  btn.style.display = '';

  const ref = getRef();
  if (!ref) return;

  const hasBm = s.bookmarks.some(b => b.ref === ref && b.type === getType());
  const hasHi = s.highlights.some(h => h.ref === ref);

  // SVG paths (Material bookmark variants)
  const PATH_ADD    = 'M200-120v-640q0-33 23.5-56.5T280-840h240v80H280v518l200-86 200 86v-278h80v400L480-240 200-120Zm80-640h240-240Zm400 160v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z';
  const PATH_REMOVE = 'M840-680H600v-80h240v80ZM200-120v-640q0-33 23.5-56.5T280-840h240v80H280v518l200-86 200 86v-278h80v400L480-240 200-120Zm80-640h240-240Z';
  const PATH_STAR   = 'm389-400 91-55 91 55-24-104 80-69-105-9-42-98-42 98-105 9 80 69-24 104ZM200-120v-640q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v640L480-240 200-120Zm80-122 200-86 200 86v-518H280v518Zm0-518h400-400Z';

  let d = PATH_ADD;
  if (hasHi)      d = PATH_STAR;
  else if (hasBm) d = PATH_REMOVE;

  const svg = btn.querySelector('svg');
  if (svg) svg.innerHTML = `<path d="${d}"/>`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Highlight injection into purport DOM
// ═════════════════════════════════════════════════════════════════════════════

function injectHighlight() {
  const s = getState();
  const dom = getDom();
  if (!s.showPurport || !dom.lbPurport) return;

  const ref = getRef();
  if (!ref) return;

  cleanHighlights(dom.lbPurport);
  const hi = s.highlights.find(h => h.ref === ref);
  if (!hi) return;

  let charCount = 0, startNode = null, startOff = 0, endNode = null, endOff = 0;

  function walk(node) {
    if (startNode && endNode) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      if (!startNode && charCount + len > hi.start) { startNode = node; startOff = hi.start - charCount; }
      if (!endNode   && charCount + len >= hi.end)  { endNode   = node; endOff   = hi.end   - charCount; }
      charCount += len;
    } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    }
  }
  walk(dom.lbPurport);

  if (startNode && endNode) {
    try {
      const r = document.createRange();
      r.setStart(startNode, startOff);
      r.setEnd(endNode, endOff);
      const span = document.createElement('span');
      span.className = 'bm-highlight';
      r.surroundContents(span);
    } catch (e) { console.warn('[Bookmarks] inject failed:', e); }
  }
}

function cleanHighlights(container) {
  if (!container) return;
  container.querySelectorAll('.bm-highlight').forEach(el => {
    const p = el.parentNode;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  Floating selection panel (purport view only)
// ═════════════════════════════════════════════════════════════════════════════

let floatPanel = null;

function initFloatPanel() {
  const p = document.getElementById('lb-purport');
  if (!p) return;
  p.addEventListener('mouseup', onSelection);
  p.addEventListener('touchend', onSelection);
  document.addEventListener('mousedown', (e) => {
    if (floatPanel && !floatPanel.contains(e.target)) removeFloatPanel();
  });
}

// ── Calling code fixes ──

function onSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { removeFloatPanel(); return; }

  const range = sel.getRangeAt(0);                    // ← capture immediately
  const p = document.getElementById('lb-purport');
  if (!p || !p.contains(range.commonAncestorContainer)) { removeFloatPanel(); return; }

  showFloatPanel(range, sel.toString());              // ← pass range through
}

function showFloatPanel(range, text) {                // ← accept range
  removeFloatPanel();

  const rect = range.getBoundingClientRect();         // ← use range, not selection
  const panel = document.createElement('div');
  panel.className = 'bm-float-panel';
  panel.innerHTML = `
    <span class="bm-float-label">Save highlight?</span>
    <button class="bm-float-btn bm-float-save">Accept</button>
    <button class="bm-float-btn bm-float-cancel">Cancel</button>
  `;
  panel.style.top  = `${rect.top + window.scrollY - 44}px`;
  panel.style.left = `${rect.left + window.scrollX + rect.width / 2 - 70}px`;
  document.body.appendChild(panel);
  floatPanel = panel;

  const ref = getRef();
  const hasExisting = getState().highlights.some(h => h.ref === ref);
  panel.querySelector('.bm-float-save').textContent = hasExisting ? 'Replace' : 'Accept';

  panel.querySelector('.bm-float-save').addEventListener('click', () => {
    saveHighlight(text, range);                        // ← pass captured range
    removeFloatPanel();
    window.getSelection().removeAllRanges();
  });
  panel.querySelector('.bm-float-cancel').addEventListener('click', () => {
    removeFloatPanel();
    window.getSelection().removeAllRanges();
  });
}

function removeFloatPanel() {
  if (floatPanel) { floatPanel.remove(); floatPanel = null; }
}

function saveHighlight(text, range) {                  // ← accept range
  const s = getState();
  const ref = getRef();

  if (!ref || !range) return;
  const off = getOffsets(range);                       // ← use passed range
  if (!off) return;

  const idx = s.highlights.findIndex(h => h.ref === ref);
  if (idx !== -1) s.highlights.splice(idx, 1);

  if (s.highlights.length >= MAX_ITEMS && idx === -1) {
    toast('Maximum of 250 bookmarks reached.');
    return;
  }

  s.highlights.push({ type: 'highlight', ref, start: off.start, end: off.end, excerpt: text.slice(0, 140) });
  persistHighlights();
  injectHighlight();
  updateBookmarkUI();
}

// ═════════════════════════════════════════════════════════════════════════════
//  getOffsets — compute absolute character offsets of a Range within #lb-purport
// ═════════════════════════════════════════════════════════════════════════════

function getOffsets(range) {
  const container = document.getElementById('lb-purport');
  if (!container || !container.contains(range.commonAncestorContainer)) return null;

  let charCount   = 0;
  let startOffset = -1;
  let endOffset   = -1;

  function walk(node) {
    if (startOffset !== -1 && endOffset !== -1) return;   // both found — stop

    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;

      if (startOffset === -1 && node === range.startContainer) {
        startOffset = charCount + range.startOffset;
      }
      if (endOffset === -1 && node === range.endContainer) {
        endOffset = charCount + range.endOffset;
      }

      charCount += len;

    } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
        if (startOffset !== -1 && endOffset !== -1) return; // short-circuit siblings
      }
    }
  }

  walk(container);

  if (startOffset === -1 || endOffset === -1) return null;
  if (startOffset > endOffset) return null;

  return { start: startOffset, end: endOffset };
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'bm-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Bookmarks modal
// ═════════════════════════════════════════════════════════════════════════════

function openBookmarksModal() {
  const m = document.getElementById('bookmarks-modal');
  if (!m) return;
  m.classList.add('open');
  document.body.classList.add('lb-active');
  renderBookmarksList();
}

function closeBookmarksModal() {
  const modal = document.getElementById('bookmarks-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.classList.remove('lb-active');
  }
}

function renderBookmarksList() {
  const s = getState();
  const body = document.getElementById('bookmarks-body');
  if (!body) return;

  const all = [
    ...s.bookmarks.map(b => ({ ...b, kind: 'bookmark' })),
    ...s.highlights.map(h => ({ ...h, kind: 'highlight' })),
  ];
  const grouped = {};
  all.forEach(i => { if (!grouped[i.ref]) grouped[i.ref] = []; grouped[i.ref].push(i); });
  const refs = Object.keys(grouped).sort();

  if (refs.length === 0) {
    body.innerHTML = `
      <div class="bm-empty">
        <svg viewBox="0 -960 960 960" width="120" height="120" fill="var(--text-muted)">
          <path d="M200-120v-640q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v640L480-240 200-120Zm80-122 200-86 200 86v-518H280v518Zm0-518h400-400Z"/>
        </svg>
        <p>No bookmarks or highlights yet.</p>
        <p class="bm-empty-sub">Save verses and purport selections as you read.</p>
      </div>`;
    return;
  }

  let html = '<div class="search-results">';
  refs.forEach(ref => {
    const items = grouped[ref];
    const hasBm = items.some(i => i.kind === 'bookmark');
    const hasHi = items.some(i => i.kind === 'highlight');
    const bm = items.find(i => i.kind === 'bookmark');
    const hi = items.find(i => i.kind === 'highlight');
    const label = ref.includes('.') ? `BG ${ref}` : `Hexagram ${ref}`;

    html += `
      <div class="search-result-item bm-card" data-ref="${ref}">
        <div class="bm-card-header">
          <span class="search-result-ref">${label}</span>
          <button class="bm-remove-btn" data-ref="${ref}" aria-label="Remove bookmark">
            <svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor">
              <path d="M840-680H600v-80h240v80ZM200-120v-640q0-33 23.5-56.5T280-840h240v80H280v518l200-86 200 86v-278h80v400L480-240 200-120Zm80-640h240-240Z"/>
            </svg>
          </button>
        </div>
        ${hasBm ? `<p class="search-result-snippet">${esc(bm.excerpt)}</p>` : ''}
        ${hasHi ? `<p class="search-result-snippet bm-snippet-highlight">${esc(hi.excerpt)}</p>` : ''}
      </div>`;
  });
  html += '</div>';
  body.innerHTML = html;

  body.querySelectorAll('.bm-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.bm-remove-btn')) return;
      navigateToRef(card.dataset.ref);
    });
  });
  body.querySelectorAll('.bm-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeByRef(btn.dataset.ref);
      renderBookmarksList();
    });
  });
}

function removeByRef(ref) {
  const s = getState();
  s.bookmarks  = s.bookmarks.filter(b => b.ref !== ref);
  s.highlights = s.highlights.filter(h => h.ref !== ref);
  persistBookmarks();
  persistHighlights();
}

function navigateToRef(ref) {
  const s = getState();
  closeBookmarksModal();
  const isHi = s.highlights.some(h => h.ref === ref);

  if (ref.includes('.')) {
    const [ch, vr] = ref.split('.');
    s.bookmarksOrigin = true;
    import('./lightbox.js').then(({ displayVerse, togglePurport }) => {
      displayVerse(parseInt(ch, 10), vr, false).then(() => { if (isHi) togglePurport(); });
    });
  } else {
    s.bookmarksOrigin = true;
    import('./lightbox.js').then(({ displayHexagram, togglePurport }) => {
      displayHexagram(ref, false).then(() => { if (isHi) togglePurport(); });
    });
  }
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
}

// ═════════════════════════════════════════════════════════════════════════════
//  Exports
// ═════════════════════════════════════════════════════════════════════════════
export {
  initBookmarks,
  toggleBookmark,
  updateBookmarkUI,
  injectHighlight,
  openBookmarksModal,
  closeBookmarksModal,
  initFloatPanel,
};