/**
 * app.js
 * GitaWisdom — UI engine
 * Custom Lightbox3-style modal with touch swipe, keyboard, click navigation.
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
  nextVerse,
  prevVerse,
  randomVerse,
} from './gitaCore.js';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  chapter:      null,
  verseRef:     null,
  chapterData:  null,
  verseData:    null,
  showPurport:  false,
  loading:      false,
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const dom = {
  form:           document.getElementById('verse-form'),
  chapterInput:   document.getElementById('chapter-input'),
  verseInput:     document.getElementById('verse-input'),
  randomBtn:      document.getElementById('random-btn'),
  errorBox:       document.getElementById('error-box'),

  lightbox:       document.getElementById('lightbox'),
  lbOverlay:      document.getElementById('lb-overlay'),
  lbCard:         document.getElementById('lb-card'),
  lbClose:        document.getElementById('lb-close'),
  lbPrev:         document.getElementById('lb-prev'),
  lbNext:         document.getElementById('lb-next'),
  lbPurportBtn:   document.getElementById('lb-purport-btn'),

  lbDedicatory:   document.getElementById('lb-dedicatory'),
  lbChapterLine:  document.getElementById('lb-chapter-line'),
  lbTextNum:      document.getElementById('lb-text-num'),
  lbSanskrit:     document.getElementById('lb-sanskrit'),
  lbSynonyms:     document.getElementById('lb-synonyms'),
  lbTranslation:  document.getElementById('lb-translation'),
  lbPurport:      document.getElementById('lb-purport'),
  lbFooter:       document.getElementById('lb-footer'),
  lbChapterEnd:   document.getElementById('lb-chapter-end'),
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
}

function closeLightbox() {
  dom.lightbox.classList.remove('open');
  document.body.classList.remove('lb-active');
  state.chapter     = null;
  state.verseRef    = null;
  state.chapterData = null;
  state.verseData   = null;
  state.showPurport = false;
  dom.chapterInput.value = '';
  dom.verseInput.value   = '';
  clearError();
  setTimeout(() => dom.chapterInput.focus(), 80);
}

// ─── HTML escape ─────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderVerse() {
  const { chapter, verseRef, verseData, showPurport } = state;
  const info      = BG_CHAPTER_INFO[chapter];
  const titlePart = info.chapter_title.split('. ').slice(1).join('. ');

  dom.lbDedicatory.textContent  = DEDICATORY;
  dom.lbChapterLine.textContent = `Chapter ${chapter} · ${titlePart}`;
  dom.lbTextNum.textContent     = verseRef.includes('-')
    ? `TEXTS ${verseRef}`
    : `TEXT ${verseRef}`;

  dom.lbSanskrit.textContent = formatVerseText(verseData);

  // Synonyms — rich HTML
  const synItems = formatSynonyms(verseData['Word-for-Word'] ?? '');
  dom.lbSynonyms.innerHTML = synItems.map(({ word, meaning }) =>
    word
      ? `<span class="syn-item"><em class="syn-word">${escHtml(word)}</em><span class="syn-dash"> — </span><span class="syn-meaning">${escHtml(meaning)}</span></span>`
      : `<span class="syn-item syn-plain">${escHtml(meaning)}</span>`
  ).join('<span class="syn-sep"> · </span>');

  // Translation
  const transl = (verseData['Translation-En'] ?? '').replace(/\s+/g, ' ').trim();
  dom.lbTranslation.textContent = transl || 'No translation available.';

  // Purport
  const purportRaw = (verseData['Purport-En'] ?? '').trim();
  if (showPurport) {
    if (purportRaw) {
      const paras = purportRaw.split(/\n\n+/).filter(Boolean);
      dom.lbPurport.innerHTML = paras
        .map(p => `<p>${escHtml(p.replace(/\n/g, ' ').trim())}</p>`)
        .join('');
    } else {
      const fallback = NO_PURPORT[Math.floor(Math.random() * NO_PURPORT.length)];
      dom.lbPurport.innerHTML = `<p class="no-purport">${escHtml(fallback)}</p>`;
    }
    dom.lbPurport.classList.add('visible');
    dom.lbPurportBtn.textContent = '✕ Close Purport';
    dom.lbPurportBtn.classList.add('active');
  } else {
    dom.lbPurport.innerHTML = '';
    dom.lbPurport.classList.remove('visible');
    dom.lbPurportBtn.textContent = '🖊 Purport';
    dom.lbPurportBtn.classList.remove('active');
  }

  dom.lbFooter.textContent = buildFooterText(chapter, verseRef);

  // Chapter-end colophon
  const endVerse = parseInt(String(verseRef).split('-').pop(), 10);
  if (endVerse === info.total_verses && verseData['Chapter-En']) {
    dom.lbChapterEnd.textContent = verseData['Chapter-En'];
    dom.lbChapterEnd.classList.add('visible');
  } else {
    dom.lbChapterEnd.textContent = '';
    dom.lbChapterEnd.classList.remove('visible');
  }

  dom.lbCard.scrollTop = 0;
}

// ─── Load & display a verse ───────────────────────────────────────────────────

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
    state.showPurport = keepPurport ? state.showPurport : false;

    renderVerse();

    if (!dom.lightbox.classList.contains('open')) {
      openLightbox();
    }
  } catch (err) {
    if (dom.lightbox.classList.contains('open')) {
      // Show error inside lightbox footer area
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

function setNavDisabled(disabled) {
  dom.lbPrev.disabled       = disabled;
  dom.lbNext.disabled       = disabled;
  dom.lbPurportBtn.disabled = disabled;
}

// ─── Form submit ──────────────────────────────────────────────────────────────

async function handleFormSubmit(e) {
  e.preventDefault();
  clearError();

  const chapterNum = parseInt(dom.chapterInput.value, 10);
  const verseStr   = dom.verseInput.value.trim();

  if (!chapterNum || !verseStr) {
    showError('Please enter both a chapter number and a verse.');
    return;
  }

  const { valid, ref } = validateVerse(chapterNum, verseStr);
  if (!valid) { showError(ref); return; }

  await displayVerse(chapterNum, ref);
}

// ─── Random verse ─────────────────────────────────────────────────────────────

async function handleRandom() {
  clearError();
  const { chapter, verse } = randomVerse();
  dom.chapterInput.value   = chapter;
  dom.verseInput.value     = verse;
  await displayVerse(chapter, verse);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

async function goNext() {
  if (!state.chapter) return;
  const { chapter, ref } = nextVerse(state.chapter, state.verseRef);
  dom.chapterInput.value  = chapter;
  dom.verseInput.value    = ref;
  await displayVerse(chapter, ref, true);
}

async function goPrev() {
  if (!state.chapter) return;
  const { chapter, ref } = prevVerse(state.chapter, state.verseRef);
  dom.chapterInput.value  = chapter;
  dom.verseInput.value    = ref;
  await displayVerse(chapter, ref, true);
}

// ─── Purport toggle ───────────────────────────────────────────────────────────

function togglePurport() {
  if (!state.verseData) return;
  state.showPurport = !state.showPurport;
  renderVerse();
  if (state.showPurport) {
    setTimeout(() => {
      dom.lbPurport.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }
}

// ─── Touch / Swipe ───────────────────────────────────────────────────────────

(function initSwipe() {
  let startX = 0, startY = 0;
  const THRESHOLD = 52;

  dom.lbCard.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  dom.lbCard.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESHOLD) {
      dx < 0 ? goNext() : goPrev();
    }
  }, { passive: true });
})();

// ─── Keyboard ────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (!dom.lightbox.classList.contains('open')) return;
  switch (e.key) {
    case 'ArrowRight': e.preventDefault(); goNext();        break;
    case 'ArrowLeft':  e.preventDefault(); goPrev();        break;
    case 'Escape':     e.preventDefault(); closeLightbox(); break;
    case 'p': case 'P': togglePurport(); break;
  }
});

// ─── Event wiring ─────────────────────────────────────────────────────────────

dom.form.addEventListener('submit', handleFormSubmit);
dom.randomBtn.addEventListener('click', handleRandom);
dom.lbClose.addEventListener('click', closeLightbox);
dom.lbOverlay.addEventListener('click', closeLightbox);
dom.lbPrev.addEventListener('click', goPrev);
dom.lbNext.addEventListener('click', goNext);
dom.lbPurportBtn.addEventListener('click', togglePurport);

// ─── Smart chapter.verse input splitting ─────────────────────────────────────
// Typing "16.4" or "16 4" in the chapter field auto-splits

dom.chapterInput.addEventListener('input', () => {
  const val = dom.chapterInput.value;
  const m   = val.match(/^(\d{1,2})[.\s,](\d.*)$/);
  if (m) {
    dom.chapterInput.value = m[1];
    dom.verseInput.value   = m[2];
    dom.verseInput.focus();
    dom.verseInput.select();
  }
});

// Initialise
dom.chapterInput.setAttribute('min', '1');
dom.chapterInput.setAttribute('max', '18');
