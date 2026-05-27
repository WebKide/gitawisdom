/**
 * app.js
 * GitaWisdom — UI engine
 * Custom Lightbox reader with touch swipe, keyboard, and click navigation.
 */

'use strict';

import {
  BG_CHAPTER_INFO,
  DEDICATORY,
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

// ─── Application state ────────────────────────────────────────────────────────
const state = {
  chapter:      null,   // current chapter number (integer)
  verseRef:     null,   // canonical ref string, e.g. "4" or "26-27"
  chapterData:  null,   // full parsed JSON for the chapter
  verseData:    null,   // the specific verse object
  showPurport:  false,  // whether purport mode is active
  loading:      false,  // guard against concurrent loads
  fontSize:     16,     // current reader font size in px (persists in session)
};

// Font-size limits (point 11)
const FONT_MIN = 12;
const FONT_MAX = 24;
const FONT_DEFAULT = 16;

// ─── DOM references ───────────────────────────────────────────────────────────
// NOTE: dom.chapterInput is intentionally ABSENT — the custom dropdown is used.
const dom = {
  // Landing page
  form:           document.getElementById('verse-form'),
  verseInput:     document.getElementById('verse-input'),
  randomBtn:      document.getElementById('random-btn'),
  errorBox:       document.getElementById('error-box'),

  // Lightbox shell
  lightbox:       document.getElementById('lightbox'),
  lbOverlay:      document.getElementById('lb-overlay'),
  lbCard:         document.getElementById('lb-card'),
  lbClose:        document.getElementById('lb-close'),
  lbPrev:         document.getElementById('lb-prev'),
  lbNext:         document.getElementById('lb-next'),
  lbPurportBtn:   document.getElementById('lb-purport-btn'),
  lbFontIncrease: document.getElementById('lb-font-increase'),
  lbFontDecrease: document.getElementById('lb-font-decrease'),

  // Content sections (toggled between verse-mode and purport-mode)
  lbVerseSection:   document.getElementById('lb-verse-section'),    // wrapper: text+syn+transl
  lbPurportSection: document.getElementById('lb-purport-section'),  // wrapper: purport content

  // Individual content nodes
  lbChapterHeading: document.getElementById('lb-chapter-heading'),
  lbDedicatory:     document.getElementById('lb-dedicatory'),
  lbChapterLine:    document.getElementById('lb-chapter-line'),
  lbTextNum:        document.getElementById('lb-text-num'),
  lbSanskrit:       document.getElementById('lb-sanskrit'),
  lbSynonyms:       document.getElementById('lb-synonyms'),
  lbTranslation:    document.getElementById('lb-translation'),
  lbPurport:        document.getElementById('lb-purport'),
  lbPurportClose:   document.getElementById('lb-purport-close'),
  lbFooter:         document.getElementById('lb-footer'),
  lbChapterEnd:     document.getElementById('lb-chapter-end'),
  lbAuthorRef:      document.getElementById('lb-author-ref'),
};

// ─── Error display ────────────────────────────────────────────────────────────

function showError(msg) {
  dom.errorBox.innerHTML = msg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  dom.errorBox.classList.add('visible');
  dom.errorBox.setAttribute('role', 'alert');
}

function clearError() {
  dom.errorBox.textContent = '';
  dom.errorBox.classList.remove('visible');
}

// ─── Lightbox open / close ────────────────────────────────────────────────────

function openLightbox() {
  dom.lightbox.classList.add('open');
  document.body.classList.add('lb-active');
  dom.lbCard.scrollTop = 0;
  setTimeout(() => dom.lbClose.focus(), 120);

  // Prevent mobile keyboard from opening while the lightbox is active
  dom.verseInput.setAttribute('readonly', '');
  dom.verseInput.setAttribute('inputmode', 'none');
}

function closeLightbox() {
  dom.lightbox.classList.remove('open');
  document.body.classList.remove('lb-active');

  // Reset state
  state.chapter     = null;
  state.verseRef    = null;
  state.chapterData = null;
  state.verseData   = null;
  state.showPurport = false;

  // Reset form fields
  dom.verseInput.value = '1';   // default back to 1

  // Restore input for the next lookup
  dom.verseInput.removeAttribute('readonly');
  dom.verseInput.setAttribute('inputmode', 'numeric');

  clearError();

// Return focus to the random button (not verse input — avoids mobile keyboard)
  setTimeout(() => dom.randomBtn.focus(), 80);
}

// ─── HTML escape helper ───────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Font-size controls (point 11) ───────────────────────────────────────────

function applyFontSize() {
  // Scales the lb-card body text; headings/labels inherit proportionally
  dom.lbCard.style.setProperty('--lb-font-size', `${state.fontSize}px`);
}

function increaseFontSize() {
  if (state.fontSize < FONT_MAX) {
    state.fontSize = Math.min(state.fontSize + 2, FONT_MAX);
    applyFontSize();
  }
}

function decreaseFontSize() {
  if (state.fontSize > FONT_MIN) {
    state.fontSize = Math.max(state.fontSize - 2, FONT_MIN);
    applyFontSize();
  }
}

// ─── Dropdown sync helpers ────────────────────────────────────────────────────
// These proxy the state that lives inside the custom-dropdown IIFE below.
// They are set up by initChapterSelect() and exposed on window for cross-scope access.

function getSelectedChapter() {
  return window._getSelectedChapter ? window._getSelectedChapter() : null;
}

function setSelectedChapter(chapter) {
  if (window._setSelectedChapter) window._setSelectedChapter(chapter);
}

// ─── Render ───────────────────────────────────────────────────────────────────
/**
 * Paints all lightbox content from current state.
 * Handles two modes:
 *   state.showPurport = false  → verse mode  (TEXT + SYNONYMS + TRANSLATION visible)
 *   state.showPurport = true   → purport mode (purport section visible, verse section hidden)
 */
function renderVerse() {
  const { chapter, verseRef, verseData, showPurport } = state;
  const info      = BG_CHAPTER_INFO[chapter];
  // Title after the ordinal: "Observing the Armies…"
  const titlePart = info.chapter_title.split('. ').slice(1).join('. ');

  // ── Header / meta ──────────────────────────────────────────────────────────
  dom.lbDedicatory.textContent  = DEDICATORY;
  dom.lbChapterLine.textContent = `𝖢𝗁𝖺𝗉𝗍𝖾𝗋 ${chapter} · ${titlePart}`;
  dom.lbAuthorRef.textContent   = ` (${chapter}.${verseRef})`;

  // <H3> chapter heading visible at top, updated during navigation
  dom.lbChapterHeading.textContent =
    `Ch. ${chapter} — ${info.chapter_title.split('. ').slice(1).join('. ')}`;

  // ── TEXT label ─────────────────────────────────────────────────────────────
  dom.lbTextNum.textContent = verseRef.includes('-')
    ? `TEXTS ${verseRef}`
    : `TEXT ${verseRef}`;

  // ── Sanskrit verse (U6): lines joined with <br> ───────────────────────────
  const lines = formatVerseText(verseData);
  dom.lbSanskrit.innerHTML = lines.map(escHtml).join('<br />');

  // ── Synonyms — rich HTML, separator is ; (point 5 / U6) ──────────────────
  const synItems = formatSynonyms(verseData['Word-for-Word'] ?? '');
  dom.lbSynonyms.innerHTML = synItems.map(({ word, meaning }) =>
    word
      ? `<span class="syn-item"><em class="syn-word">${escHtml(word)}</em>`
        + `<span class="syn-dash"> — </span>`
        + `<span class="syn-meaning">${escHtml(meaning)}</span></span>`
      : `<span class="syn-item syn-plain">${escHtml(meaning)}</span>`
  ).join('<span class="syn-sep">; </span>');

  // ── Translation ────────────────────────────────────────────────────────────
  const transl = (verseData['Translation-En'] ?? '').replace(/\s+/g, ' ').trim();
  dom.lbTranslation.textContent = transl || '𝖭𝗈 𝗍𝗋𝖺𝗇𝗌𝗅𝖺𝗍𝗂𝗈𝗇 𝖿𝗈𝗎𝗇𝖽 𝗂𝗇 𝖽𝖺𝗍𝖺𝖻𝖺𝗌𝖾.';

  // ── Footer ─────────────────────────────────────────────────────────────────
  dom.lbFooter.textContent = buildFooterText(chapter, verseRef);

  // ── Chapter-end colophon (U4: uses imported chapterColophon()) ────────────
  const colophon = chapterColophon(chapter, verseRef, verseData);
  if (colophon) {
    dom.lbChapterEnd.textContent = colophon;
    dom.lbChapterEnd.classList.add('visible');
  } else {
    dom.lbChapterEnd.textContent = '';
    dom.lbChapterEnd.classList.remove('visible');
  }

  // ── Mode switch: verse vs purport (U5) ────────────────────────────────────
  if (showPurport) {
    // Hide verse section; show purport section
    dom.lbVerseSection.classList.add('hidden');
    dom.lbPurportSection.classList.remove('hidden');

    // Render purport content
    const purportRaw = (verseData['Purport-En'] ?? '').trim();
    if (purportRaw) {
      const paras = purportRaw.split(/\n\n+/).filter(Boolean);
      dom.lbPurport.innerHTML = paras
        .map(p => `<p>${escHtml(p.replace(/\n/g, ' ').trim())}</p>`)
        .join('');
    } else {
      // M5: random fallback message — intentionally varied
      const fallback = NO_PURPORT[Math.floor(Math.random() * NO_PURPORT.length)];
      dom.lbPurport.innerHTML = `<p class="no-purport">${escHtml(fallback)}</p>`;
    }

    // Show the red bottom "Close Purport" button via class (U7: not inline style)
    dom.lbPurportClose.classList.add('visible');

    // Update purport toggle button state
    dom.lbPurportBtn.textContent = '✕ 𝖢𝗅𝗈𝗌𝖾 𝖯𝗎𝗋𝗉𝗈𝗋𝗍';
    dom.lbPurportBtn.classList.add('active');

  } else {
    // Show verse section; hide purport section
    dom.lbVerseSection.classList.remove('hidden');
    dom.lbPurportSection.classList.add('hidden');

    // Clear purport HTML (keeps DOM clean)
    dom.lbPurport.innerHTML = '';

    // Hide the bottom Close Purport button (U7: class-based)
    dom.lbPurportClose.classList.remove('visible');

    // Reset purport toggle button
    dom.lbPurportBtn.textContent = '🖊 𝙿𝚄𝚁𝙿𝙾𝚁𝚃';
    dom.lbPurportBtn.classList.remove('active');
  }

  // Always scroll the card back to the top after rendering
  dom.lbCard.scrollTop = 0;
}

// ─── Load and display a verse ─────────────────────────────────────────────────
/**
 * Fetches chapter data (from cache), finds the verse, updates state, renders.
 * keepPurport: when navigating, purport mode is intentionally reset to false
 *   (per spec point 4 — navigating shows the verse, not the next purport).
 *
 * @param {number} chapter
 * @param {string} verseRef
 * @param {boolean} keepPurport  — pass true only for re-render within same verse
 */
async function displayVerse(chapter, verseRef, keepPurport = false) {
  if (state.loading) return;
  state.loading = true;
  setNavDisabled(true);
  dom.lbCard.classList.add('loading');

  try {
    const chapterData = await loadChapterData(chapter);
    const verseData   = findVerseData(chapterData, verseRef);

    state.chapter     = chapter;
    state.verseRef    = verseRef;
    state.chapterData = chapterData;
    state.verseData   = verseData;
    // Navigation always resets purport mode (spec: show verse, not purport)
    state.showPurport = keepPurport ? state.showPurport : false;

    renderVerse();

    if (!dom.lightbox.classList.contains('open')) {
      openLightbox();
    }
  } catch (err) {
    if (dom.lightbox.classList.contains('open')) {
      // Surface the error inside the lightbox footer so user isn't left with a broken card
      dom.lbFooter.textContent = '⚠ ' + err.message;
    } else {
      showError(err.message);
    }
  } finally {
    state.loading = false;
    setNavDisabled(false);
    dom.lbCard.classList.remove('loading');
  }
}

/** Disable / enable navigation buttons while a load is in progress. */
function setNavDisabled(disabled) {
  dom.lbPrev.disabled       = disabled;
  dom.lbNext.disabled       = disabled;
  dom.lbPurportBtn.disabled = disabled;
}

// ─── Form submit ──────────────────────────────────────────────────────────────

async function handleFormSubmit(e) {
  e.preventDefault();
  clearError();   // M7/M8: always clear on a new submission attempt

  // U1/U2: read chapter from the dropdown state, NOT from a removed <input>
  const chapterNum = getSelectedChapter();
  if (!chapterNum) {
    showError('Please select a chapter from the dropdown.');
    return;
  }

  // Default to verse 1 if the field is empty (M3)
  const rawVerse   = dom.verseInput.value.trim();
  const verseStr   = rawVerse === '' ? '1' : rawVerse;

  // M8: reject anything that isn't a plain positive integer
  if (!/^\d+$/.test(verseStr)) {
    showError('Please enter a whole number for the verse (e.g. 4 or 23).');
    return;
  }

  const { valid, ref } = validateVerse(chapterNum, verseStr);
  if (!valid) {
    showError(ref);   // ref contains the error message when valid === false
    return;
  }

  await displayVerse(chapterNum, ref);
}

// ─── Random verse ─────────────────────────────────────────────────────────────

async function handleRandom() {
  clearError();
  const { chapter, ref } = randomVerse();

  // U2 fix: use the dropdown's own setter so _getSelectedChapter() stays in sync
  setSelectedChapter(chapter);

  // Sync verse input display
  dom.verseInput.value = ref.includes('-') ? ref.split('-')[0] : ref;

  await displayVerse(chapter, ref);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

async function goNext() {
  if (!state.chapter) return;
  const { chapter, ref } = nextVerse(state.chapter, state.verseRef);

  // U1 fix: update the dropdown, not a removed input element
  setSelectedChapter(chapter);
  dom.verseInput.value = ref.includes('-') ? ref.split('-')[0] : ref;

  await displayVerse(chapter, ref);  // keepPurport = false (reset to verse mode per spec)
}

async function goPrev() {
  if (!state.chapter) return;
  const { chapter, ref } = prevVerse(state.chapter, state.verseRef);

  // U1 fix: update the dropdown, not a removed input element
  setSelectedChapter(chapter);
  dom.verseInput.value = ref.includes('-') ? ref.split('-')[0] : ref;

  await displayVerse(chapter, ref);  // keepPurport = false
}

// ─── Purport toggle (U5) ──────────────────────────────────────────────────────

function togglePurport() {
  if (!state.verseData) return;
  state.showPurport = !state.showPurport;
  renderVerse();

  // If opening, scroll the purport into view
  if (state.showPurport) {
    setTimeout(() => {
      dom.lbPurportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }
}

// ─── Touch / Swipe ───────────────────────────────────────────────────────────
(function initSwipe() {
  let startX = 0, startY = 0;
  const THRESHOLD = 52;   // px — minimum horizontal distance to trigger swipe

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
})();

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!dom.lightbox.classList.contains('open')) return;
  switch (e.key) {
    case 'ArrowRight': e.preventDefault(); goNext();        break;
    case 'ArrowLeft':  e.preventDefault(); goPrev();        break;
    case 'Escape':     e.preventDefault(); closeLightbox(); break;
    case 'p': case 'P': togglePurport(); break;
    case '+': case '=': increaseFontSize(); break;
    case '-': decreaseFontSize(); break;
  }
});

// ─── Event wiring ─────────────────────────────────────────────────────────────
dom.form.addEventListener('submit', handleFormSubmit);
dom.randomBtn.addEventListener('click', handleRandom);

// M7 fix: lb-overlay click now calls clearError() via closeLightbox()
dom.lbClose.addEventListener('click', closeLightbox);
dom.lbOverlay.addEventListener('click', closeLightbox);  // clearError() is inside closeLightbox()

dom.lbPrev.addEventListener('click', goPrev);
dom.lbNext.addEventListener('click', goNext);
dom.lbPurportBtn.addEventListener('click', togglePurport);
dom.lbPurportClose.addEventListener('click', togglePurport);

// Font-size controls (point 11)
dom.lbFontIncrease.addEventListener('click', increaseFontSize);
dom.lbFontDecrease.addEventListener('click', decreaseFontSize);

// M3: pre-fill verse input with "1" and enforce numeric-only input
dom.verseInput.value = '1';
dom.verseInput.addEventListener('input', () => {
  // Strip any non-digit characters silently (handles paste, etc.)
  dom.verseInput.value = dom.verseInput.value.replace(/\D/g, '');
});

// ─── Custom chapter dropdown ──────────────────────────────────────────────────
/**
 * Manages the custom <div> dropdown.
 * Exposes two functions on window:
 *   window._getSelectedChapter() → number|null
 *   window._setSelectedChapter(n)  — programmatic select (used by random/nav)
 */
(function initChapterSelect() {
  const wrap     = document.getElementById('chapter-select');
  const trigger  = document.getElementById('chapter-trigger');
  const trigText = document.getElementById('chapter-trigger-text');
  const list     = document.getElementById('chapter-list');
  const options  = Array.from(list.querySelectorAll('.custom-select-option'));

  let selectedValue = null;   // integer | null

  function openList() {
    wrap.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeList() {
    wrap.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  /**
   * Select an option element, update the trigger label, and persist the value.
   * @param {Element} opt
   */
  function selectOption(opt) {
    selectedValue = parseInt(opt.dataset.value, 10);
    trigText.textContent = `Ch. ${selectedValue}`;

    options.forEach(o => o.removeAttribute('aria-selected'));
    opt.setAttribute('aria-selected', 'true');

    // Pre-fill verse input with 1 whenever chapter changes (M3 / point 7)
    dom.verseInput.value = '1';
    dom.verseInput.focus();

    closeList();
  }

  // U2 fix: exposed setter lets handleRandom() and navigation sync the dropdown
  window._getSelectedChapter = () => selectedValue;
  window._setSelectedChapter = (chapter) => {
    const opt = list.querySelector(`[data-value="${chapter}"]`);
    if (opt) selectOption(opt);
  };

  // Toggle open/close on trigger click
  trigger.addEventListener('click', () => {
    wrap.classList.contains('open') ? closeList() : openList();
  });

  // Click on an option
  options.forEach(opt => {
    opt.addEventListener('click', () => selectOption(opt));
  });

  // Close when clicking anywhere outside the dropdown
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) closeList();
  });

  // Keyboard: Enter/Space opens, arrows navigate, Enter selects, Esc closes
  trigger.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); }
  });

  list.addEventListener('keydown', e => {
    const current = list.querySelector('[aria-selected="true"]') || options[0];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = current.nextElementSibling;
      if (next) { selectOption(next); next.scrollIntoView({ block: 'nearest' }); }
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = current.previousElementSibling;
      if (prev) { selectOption(prev); prev.scrollIntoView({ block: 'nearest' }); }
    }
    if (e.key === 'Escape') closeList();
    if (e.key === 'Enter')  closeList();
  });
})();

// M2 fix: the dead dom.chapterInput.setAttribute('min'/'max') block has been removed.
// Apply initial font size to the card
applyFontSize();
