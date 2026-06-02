/**
 * app.js
 * GitaWisdom + iChing Oracle — UI engine
 * Custom Lightbox reader with touch swipe, keyboard, and click navigation.
 *
 * Two oracle systems share one lightbox. A `mode` flag ('gita' | 'iching')
 * controls which data source, header branding, and label text is used.
 */

'use strict';

import {
  BG_CHAPTER_INFO,
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
  nextVerse,
  prevVerse,
  randomVerse,
} from './gitacore.js';

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

// ─── Application state ────────────────────────────────────────────────────────
const state = {
  // Shared
  mode:         'gita',  // 'gita' | 'iching'
  showPurport:  false,   // whether purport/commentary mode is active
  loading:      false,   // guard against concurrent loads
  fontSize:     16,      // current reader font size in px (persists in session)

  // Gita-specific
  chapter:      null,    // current chapter number (integer)
  verseRef:     null,    // canonical ref string, e.g. "4" or "26-27"
  chapterData:  null,    // full parsed JSON for the chapter
  verseData:    null,    // the specific verse object

  // iChing-specific
  hexRef:       null,    // current hexagram ref string, e.g. "17"
  ichingData:   null,    // full parsed iChing JSON
  hexData:      null,    // the specific hexagram object
};

// Font-size limits
const FONT_MIN     = 12;
const FONT_MAX     = 24;

// ─── DOM references ───────────────────────────────────────────────────────────
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

  // Header branding (swapped between modes)
  lbAuthorIcon:    document.getElementById('lb-author-icon'),
  lbAuthorTitle:   document.getElementById('lb-author-title'),
  lbAuthorRef:     document.getElementById('lb-author-ref'),

  // Purport/commentary toggle buttons
  // lbPurportBtn:    document.getElementById('lb-purport-btn'),  // top header button
  lbFontIncrease:  document.getElementById('lb-font-increase'),
  lbFontDecrease:  document.getElementById('lb-font-decrease'),

  // ── Content sections ───────────────────────────────────────────────────────
  lbVerseSection:   document.getElementById('lb-verse-section'),
  lbPurportSection: document.getElementById('lb-purport-section'),

  // Verse-section nodes (display order: translation → sanskrit → synonyms)
  lbChapterHeading: document.getElementById('lb-chapter-heading'),
  lbTextNum:        document.getElementById('lb-text-num'),
  lbTranslation:    document.getElementById('lb-translation'),   // shown FIRST
  lbSanskrit:       document.getElementById('lb-sanskrit'),      // shown SECOND
  lbSynonyms:       document.getElementById('lb-synonyms'),      // shown THIRD
  lbOpenPurportBtn: document.getElementById('lb-open-purport-btn'), // bottom blue btn

  // Purport-section nodes
  lbPurport:        document.getElementById('lb-purport'),
  lbReturnBtn:      document.getElementById('lb-return-btn'),    // bottom red btn (was lb-purport-close)

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

// ─── Error helpers ────────────────────────────────────────────────────────────

/**
 * Show an error in the appropriate error box (gita or iching).
 * @param {string} msg
 * @param {'gita'|'iching'} [target]  — defaults to current state.mode
 */
function showError(msg, target) {
  const box = (target ?? state.mode) === 'iching' ? dom.ichingErrorBox : dom.gitaErrorBox;
  box.innerHTML = msg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  box.classList.add('visible');
  box.setAttribute('role', 'alert');
}

function clearErrors() {
  [dom.gitaErrorBox, dom.ichingErrorBox].forEach(b => {
    b.textContent = '';
    b.classList.remove('visible');
  });
}

// ─── Lightbox open / close ────────────────────────────────────────────────────

function openLightbox() {
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

function closeLightbox() {
  dom.lightbox.classList.remove('open');
  document.body.classList.remove('lb-active');

  // Reset state
  state.chapter     = null;
  state.verseRef    = null;
  state.chapterData = null;
  state.verseData   = null;
  state.hexRef      = null;
  state.ichingData  = null;
  state.hexData     = null;
  state.showPurport = false;

  // Clear BOTH input fields — no trailing values (spec: empty on close)
  dom.gitaVerseInput.value = '';
  dom.ichingInput.value    = '';

  // Restore inputs for next lookup
  [dom.gitaVerseInput, dom.ichingInput].forEach(inp => {
    inp.removeAttribute('readonly');
    inp.setAttribute('inputmode', 'numeric');
  });

  clearErrors();

  // Scroll page back to top so user sees the landing page
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Return focus to the relevant random button (avoids mobile keyboard)
  setTimeout(() => {
    const btn = state.mode === 'iching' ? dom.ichingBtn : dom.gitaRandomBtn;
    btn.focus();
  }, 80);
}

// ─── HTML escape helper ───────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Font-size controls ───────────────────────────────────────────────────────

function applyFontSize() {
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

// ─── Lightbox header branding ─────────────────────────────────────────────────
/**
 * Swaps the lightbox header icon and title text to match the active mode.
 * TODO: When the iChing icon image is ready, update ICHING_AUTHOR_ICON in
 *       ichingcore.js to point to the new file (e.g. 'assets/images/iching-author.png').
 */
function applyLightboxBranding() {
  if (state.mode === 'iching') {
    dom.lbAuthorIcon.src = ICHING_AUTHOR_ICON;
    dom.lbAuthorIcon.alt = 'I Ching Oracle';
    dom.lbAuthorTitle.innerHTML =
      `<strong><i>I Ching</i> — Book of Changes</strong> <b id="lb-author-ref"></b>`;

    // show COPY / SHARE buttons from card view
    dom.lbCopyBtn.style.display  = 'none';
    dom.lbShareBtn.style.display = '';
  } else {
    dom.lbAuthorIcon.src = 'assets/images/ACBhaktivedantaSwami.png';
    dom.lbAuthorIcon.alt = 'A.C. Bhaktivedānta Swami';
    dom.lbAuthorTitle.innerHTML =
      `<strong><i>Bhagavad Gītā</i> As It Is</strong> <b id="lb-author-ref"></b>`;

    // both COPY and SHARE visible for Gita
    dom.lbCopyBtn.style.display  = '';
    dom.lbShareBtn.style.display = '';
  }
}

// ─── Bottom button labels ─────────────────────────────────────────────────────
/**
 * Updates bottom button labels based on current mode and purport state.
 * Verse/Hexagram view  → "📖 Read Purport" / "📖 Read Commentary"  (blue)
 * Purport/Commentary view → "↩ Return to Verse" / "↩ Return to Hexagram" (red)
 */
function updateBottomButtons() {
  if (state.showPurport) {
    // Inside purport view — show "Return" button, hide open-purport button
    dom.lbOpenPurportBtn.classList.remove('visible');
    dom.lbReturnBtn.classList.add('visible');
    dom.lbReturnBtn.textContent =
      state.mode === 'iching' ? '↩ Return to Hexagram' : '↩ Return to Verse';
  } else {
    // Inside verse view — show "Read Purport/Commentary" button, hide return
    dom.lbReturnBtn.classList.remove('visible');
    dom.lbOpenPurportBtn.classList.add('visible');
    dom.lbOpenPurportBtn.textContent =
      state.mode === 'iching' ? '📖 Read Commentary' : '📖 Read Purport';
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
  dom.lbTranslation.textContent = isGita
    ? (transl ? `\u201C${transl}\u201D` : 'No translation found.')
    : (transl || 'No judgement found.');

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

  dom.lbSynonyms.innerHTML = synItems.map(({ word, meaning }) =>
    word
      ? `<span class="syn-item"><em class="syn-word">${escHtml(word)}</em>`
        + `<span class="syn-dash"> — </span>`
        + `<span class="syn-meaning">${escHtml(meaning)}</span></span>`
      : `<span class="syn-item syn-plain">${escHtml(meaning)}</span>`
  ).join('<span class="syn-sep">; </span>') + '<span class="syn-sep">.</span>';

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

    // Render purport / commentary body
    const purportRaw = (verseData['Purport-En'] ?? '').trim();
    if (purportRaw) {
      const paras = purportRaw.split(/\n\n+/).filter(Boolean);
      dom.lbPurport.innerHTML = paras
        .map(p => `<p>${escHtml(p.replace(/\n/g, ' ').trim())}</p>`)
        .join('');

    // Hide Copy in purport view; hide Share only for Gita purport view
    dom.lbCopyBtn.style.display  = 'none';
    dom.lbShareBtn.style.display = state.mode === 'iching' ? '' : 'none';
    dom.lbTextNum.style.display  = '';       // show TEXT in purport view
    } else {
      // Random fallback message
      const pool     = isGita ? NO_PURPORT : NO_COMMENTARY;
      const fallback = pool[Math.floor(Math.random() * pool.length)];
      dom.lbPurport.innerHTML = '';
      dom.lbPurport.insertAdjacentHTML('afterend', `<p id="lb-no-purport-msg" class="lb-no-purport">${escHtml(fallback)}</p>`);
    }

    // ← INSERT DEDICATORY .random(CLOSING) HERE
    const closing = DEDICATORY_CLOSINGS[Math.floor(Math.random() * DEDICATORY_CLOSINGS.length)];
    const dedicatoryTop = dom.lbPurportSection.querySelector('.lb-purport-dedicatory-top');
    if (dedicatoryTop) dedicatoryTop.innerHTML = isGita ? closing : '';

    // Signature: show for Gita, hide for iChing
    const sig = dom.lbCard.querySelector('.lb-signature');
    if (sig) sig.style.display = isGita ? '' : 'none';

    const sigDedicatory = dom.lbCard.querySelectorAll('.lb-purport-dedicatory');
    sigDedicatory.forEach(el => { el.style.display = isGita ? '' : 'none'; });

    // Update top purport button to show "close" state
    // --> dom.lbPurportBtn.textContent = '↩ Return ';
    // --> dom.lbPurportBtn.classList.add('active');

  } else {
    // Show verse section; hide purport section
    dom.lbVerseSection.classList.remove('hidden');
    dom.lbPurportSection.classList.add('hidden');

    // Clear purport HTML (keep DOM clean)
    dom.lbPurport.innerHTML = '';

    // Reset top purport button
    // --> dom.lbPurportBtn.textContent = isGita ? 'READ PURPORT' : '🔮 COMMENTARY';
    // --> dom.lbPurportBtn.classList.remove('active');
    dom.lbTextNum.style.display = 'none';  // hide TEXT in verse view

    // Restore COPY for Gita only; SHARE for both modes
    if (state.mode === 'gita') {
      dom.lbCopyBtn.style.display  = '';
    }
    dom.lbShareBtn.style.display = '';
  }

  // Update bottom buttons for current mode/state
  updateBottomButtons();

  // Always scroll card to top after render
  dom.lbCard.scrollTop = 0;
}

// ─── Load and display a Gita verse ───────────────────────────────────────────
/**
 * @param {number} chapter
 * @param {string} verseRef
 * @param {boolean} keepPurport  — pass true only for re-render within same verse
 */
async function displayVerse(chapter, verseRef, keepPurport = false) {
  if (state.loading) return;
  state.loading = true;
  state.mode    = 'gita';
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

    applyLightboxBranding();
    renderVerse();

    if (!dom.lightbox.classList.contains('open')) openLightbox();

  } catch (err) {
    if (dom.lightbox.classList.contains('open')) {
      dom.lbFooter.textContent = '⚠ ' + err.message;
    } else {
      showError(err.message, 'gita');
    }
  } finally {
    state.loading = false;
    setNavDisabled(false);
    dom.lbCard.classList.remove('loading');
  }
}

// ─── Load and display an iChing hexagram ─────────────────────────────────────
/**
 * @param {string} hexRef
 * @param {boolean} keepPurport
 */
async function displayHexagram(hexRef, keepPurport = false) {
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
      showError(err.message, 'iching');
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
  // READ PURPORT BUTTON --> dom.lbPurportBtn.disabled = disabled;
}

// ─── Dropdown sync helpers ────────────────────────────────────────────────────
function getSelectedChapter() {
  return window._getSelectedChapter ? window._getSelectedChapter() : null;
}

function setSelectedChapter(chapter) {
  if (window._setSelectedChapter) window._setSelectedChapter(chapter);
}

// ─── Gita: form submit ────────────────────────────────────────────────────────
async function handleGitaSubmit(e) {
  e.preventDefault();
  clearErrors();

  const chapterNum = getSelectedChapter();
  if (!chapterNum) {
    showError('Please select a chapter from the dropdown.', 'gita');
    return;
  }

  const rawVerse = dom.gitaVerseInput.value.trim();

  // Spec: empty input → show error asking which verse (no silent default to 1)
  if (rawVerse === '') {
    showError('Which verse do you want to read?', 'gita');
    return;
  }

  if (!/^\d+$/.test(rawVerse)) {
    showError('Please enter a whole number for the verse (e.g. 4 or 23).', 'gita');
    return;
  }

  const { valid, ref } = validateVerse(chapterNum, rawVerse);
  if (!valid) { showError(ref, 'gita'); return; }

  // Clear inputs as soon as lookup begins (spec: don't keep trailing values)
  dom.gitaVerseInput.value = '';
  setSelectedChapter(null); // reset dropdown display

  await displayVerse(chapterNum, ref);
}

// ─── Gita: random verse (SILENT — does NOT touch inputs or dropdown) ──────────
async function handleGitaRandom() {
  clearErrors();
  // randomVerse() picks chapter + ref internally; inputs are NOT updated
  const { chapter, ref } = randomVerse();
  await displayVerse(chapter, ref);
}

// ─── iChing: form submit / toss coins ────────────────────────────────────────
/**
 * If the input is empty → random hexagram (same as "Toss Coins" with no number).
 * If the input has a number → load that hexagram.
 */
async function handleIChingSubmit(e) {
  e.preventDefault();
  clearErrors();

  const rawInput = dom.ichingInput.value.trim();

  if (rawInput === '') {
    // Empty input → random hexagram (the "toss coins" experience)
    const { ref } = randomHexagram();
    dom.ichingInput.value = ''; // keep empty (spec)
    await displayHexagram(ref);
    return;
  }

  if (!/^\d+$/.test(rawInput)) {
    showError('Please enter a whole number (1–64).', 'iching');
    return;
  }

  const { valid, ref } = validateHexagram(rawInput);
  if (!valid) { showError(ref, 'iching'); return; }

  // Clear input as soon as lookup begins
  dom.ichingInput.value = '';

  await displayHexagram(ref);
}

// ─── iChing: random button (SILENT — does NOT touch input) ───────────────────
async function handleIChingRandom() {
  clearErrors();
  const { ref } = randomHexagram();
  await displayHexagram(ref);
}

// ─── Navigation ───────────────────────────────────────────────────────────────
async function goNext() {
  if (state.mode === 'iching') {
    if (!state.hexRef) return;
    const { ref } = nextHexagram(state.hexRef);
    await displayHexagram(ref);
  } else {
    if (!state.chapter) return;
    const { chapter, ref } = nextVerse(state.chapter, state.verseRef);
    setSelectedChapter(chapter);
    await displayVerse(chapter, ref);
  }
}

async function goPrev() {
  if (state.mode === 'iching') {
    if (!state.hexRef) return;
    const { ref } = prevHexagram(state.hexRef);
    await displayHexagram(ref);
  } else {
    if (!state.chapter) return;
    const { chapter, ref } = prevVerse(state.chapter, state.verseRef);
    setSelectedChapter(chapter);
    await displayVerse(chapter, ref);
  }
}

// ─── Share PNG helpers ────────────────────────────────────────────────────────

/**
 * Build the PNG download filename based on current mode and verse/hexagram.
 * Gita single:  wisdom_oracle_gita_17_1.png
 * Gita grouped: wisdom_oracle_gita_17_26-27.png
 * iChing:       wisdom_oracle_iching_hexagram_05.png
 */
function buildShareFilename() {
  if (state.mode === 'iching') {
    const n      = parseInt(String(state.hexRef).split('-')[0], 10);
    const padded = String(n).padStart(2, '0');
    return `wisdom_oracle_iching_hexagram_${padded}.png`;
  }
  return `wisdom_oracle_gita_${state.chapter}_${state.verseRef}.png`;
}

/**
 * Resizes the share card verse text to fill the safe area as generously as
 * possible without overflowing.
 *
 * Strategy:
 *   1. Start at MAX_SIZE and shrink until scrollHeight ≤ MAX_HEIGHT.
 *   2. If the text is still very short (< 55% of MAX_HEIGHT), grow back up
 *      one step at a time, stopping before overflow.
 *   3. Set line-height after size is finalised — tighter for large text.
 *
 * NOTE: the share card sits at left:-9999px but is display:flex, so
 * scrollHeight reads are valid as long as width is fixed (1080px in CSS).
 */
function fitShareText() {
  const MAX_HEIGHT = 850;   // px — safe content area
  const MIN_SIZE   = 18;    // px — readable floor
  const MAX_SIZE   = 100;   // px — ceiling for short verses
  const STEP       = 2;     // px per iteration
  const GROW_FLOOR = 0.55;  // grow back if text occupies less than 55% of area

  const textEl  = dom.sharePngVerse;
  const titleEl = dom.sharePngTitle;

  // ── Derive title’s current font size and set verse ceiling below it ───────
  // getComputedStyle reads the actual rendered px value, even if set via CSS
  // class or custom property.  The title must already be in the DOM and
  // visible (position:fixed off-screen counts) for this to be accurate.
  const titlePx      = parseFloat(getComputedStyle(titleEl).fontSize) || 68;
  const TITLE_GAP    = 8;   // px — minimum size difference between title and verse
  const verseCeiling = Math.min(MAX_SIZE, titlePx - TITLE_GAP);
  // e.g. title = 68px → verseCeiling = min(100, 60) = 60px
  // e.g. title = 48px → verseCeiling = min(100, 40) = 40px

  // ── Phase 1: shrink from verseCeiling until it fits ───────────────────────
  let size = verseCeiling;
  textEl.style.lineHeight = '1.35';
  textEl.style.fontSize   = `${size}px`;

  while (textEl.scrollHeight > MAX_HEIGHT && size > MIN_SIZE) {
    size -= STEP;
    textEl.style.fontSize = `${size}px`;
  }

  // ── Phase 2: grow back if the verse is short ──────────────────────────────
  if (textEl.scrollHeight < MAX_HEIGHT * GROW_FLOOR) {
    while (size < verseCeiling) {   // ← cap is verseCeiling, not MAX_SIZE
      size += STEP;
      textEl.style.fontSize = `${size}px`;
      if (textEl.scrollHeight > MAX_HEIGHT) {
        size -= STEP;
        textEl.style.fontSize = `${size}px`;
        break;
      }
    }
  }

  // ── Phase 3: finalise line-height based on settled size ───────────────────
  textEl.style.lineHeight = size > 60 ? '1.35' : '1.55';
}

// ─── Copy / Share helpers ─────────────────────────────────────────────────────

/**
 * Builds plain-text copy string.
 * Uses oracle-appropriate heading ("Gītā Wisdom" vs "I Ching Oracle").
 */
function buildShareText(includeUrl = false) {
  const heading     = dom.lbChapterHeading.textContent.trim();
  const translation = dom.lbTranslation.textContent.trim();
  const label       = state.mode === 'iching' ? 'I Ching Oracle' : 'Gītā Wisdom';
  const text        = `${label} — ${heading}:\n\n${translation}`;
  return includeUrl ? `${text}\n\n${window.location.href}` : text;
}

/**
 * Briefly swaps a button’s label to give visual feedback, then restores it.
 * @param {HTMLButtonElement} btn
 * @param {string} label  — temporary label (e.g. "✓ COPIED")
 */
function flashBtn(btn, label) {
  const original    = btn.textContent;
  btn.textContent   = label;
  btn.disabled      = true;
  return new Promise(resolve => {
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled    = false;
      resolve();
    }, 1800);
  });
}

async function handleCopy() {
  const text = buildShareText(true); // includes homepage URL
  try {
    await navigator.clipboard.writeText(text);
    flashBtn(dom.lbCopyBtn, '✓ COPIED');
  } catch {
    // Fallback for HTTP or older browsers that lack clipboard API
    const ta          = document.createElement('textarea');
    ta.value          = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    flashBtn(dom.lbCopyBtn, '✓ COPIED');
  }
}

/**
 * Captures the hidden share card as a PNG and either invokes the native
 * share sheet (mobile) or triggers a direct download (desktop).
 */
async function handleShare() {
  // Guard — html2canvas must be loaded globally by html2canvas.min.js
  if (typeof html2canvas !== 'function') {
    flashBtn(dom.lbShareBtn, '✗ ERROR');
    return;
  }

  // ── Populate share card content ───────────────────────────────────────────
  // Title: insert line break before "(BG …)" reference for Gita cards
  dom.sharePngTitle.innerHTML = dom.lbChapterHeading.textContent
    .replace(' (BG ', '<br/>(BG ');

  // Body: translation / judgment text (curly quotes already added by renderVerse)
  dom.sharePngVerse.textContent = dom.lbTranslation.textContent;

  // Fit text to card — must happen before html2canvas reads the DOM
  fitShareText();

  // Footer: anchor to bottom-left of the card (card is position:relative)
  dom.sharePngFooter.style.position = 'absolute';
  dom.sharePngFooter.style.bottom   = '52px';
  dom.sharePngFooter.style.left     = '952px';

  // ── Capture ───────────────────────────────────────────────────────────────
  // Helper that resets all inline styles — called after every path
  function resetShareCard() {
    dom.sharePngVerse.style.fontSize   = '';
    dom.sharePngVerse.style.lineHeight = '';
    dom.sharePngFooter.style.position  = '';
    dom.sharePngFooter.style.bottom    = '';
    dom.sharePngFooter.style.left      = '';
  }

  flashBtn(dom.lbShareBtn, '⏳ ...');

  try {
    const canvas = await html2canvas(dom.sharePngCard, {
      scale:           2,       // 2× for sharp output on high-DPI screens
      useCORS:         false,   // all assets are local — no CORS needed
      allowTaint:      false,
      backgroundColor: null,    // transparent — lets card_bg.png show through
      logging:         false,   // silence console noise
      width:           1080,
      height:          1350,
    });

    const filename = buildShareFilename();

    // ── Mobile: native share sheet with PNG file ──────────────────────────
    if (navigator.canShare && navigator.share) {
      canvas.toBlob(async (blob) => {
        // toBlob is a callback — reset styles here, after canvas is captured
        resetShareCard();

        if (!blob) { triggerDownload(canvas, filename); return; }

        const file = new File([blob], filename, { type: 'image/png' });

        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            await flashBtn(dom.lbShareBtn, '✓ SHARED');
          } catch (err) {
            // AbortError = user dismissed the sheet — not a real error
            if (err.name !== 'AbortError') triggerDownload(canvas, filename);
            else await flashBtn(dom.lbShareBtn, 'SHARE');
          }
        } else {
          // Share API present but files not supported — fall back to download
          triggerDownload(canvas, filename);
        }
      }, 'image/png');

    } else {
      // ── Desktop: direct PNG download ─────────────────────────────────────
      triggerDownload(canvas, filename);
      resetShareCard(); // safe to reset immediately on the synchronous path
    }

  } catch (err) {
    // html2canvas itself threw — log and surface to user
    console.error('Share PNG failed:', err);
    await flashBtn(dom.lbShareBtn, '✗ ERROR');
    resetShareCard(); // always clean up on error
  }
  // NOTE: no finally block — resetShareCard() is called on every individual
  // path above so that the async toBlob callback path is covered correctly.
}

/**
 * Fallback: trigger a direct PNG file download in the browser.
 * Used on desktop or when the native share API cannot handle files.
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename
 */
async function triggerDownload(canvas, filename) {
  const link    = document.createElement('a');
  link.download = filename;
  link.href     = canvas.toDataURL('image/png');
  link.click();
  await flashBtn(dom.lbShareBtn, '✓ SAVED');
}

// ─── Purport / commentary toggle ─────────────────────────────────────────────
function togglePurport() {
  const verseData = state.mode === 'gita' ? state.verseData : state.hexData;
  if (!verseData) return;
  state.showPurport = !state.showPurport;
  renderVerse();

  // If opening, scroll purport into view
  if (state.showPurport) {
    setTimeout(() => {
      dom.lbPurportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    // COPY / SHARE
    dom.lbCopyBtn.style.display  = 'none';
    dom.lbShareBtn.style.display = 'none';
  }
}

// ─── Touch / Swipe ────────────────────────────────────────────────────────────
(function initSwipe() {
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
})();

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!dom.lightbox.classList.contains('open')) return;
  switch (e.key) {
    case 'ArrowRight': e.preventDefault(); goNext();         break;
    case 'ArrowLeft':  e.preventDefault(); goPrev();         break;
    case 'Escape':     e.preventDefault(); closeLightbox();  break;
    case 'p': case 'P': togglePurport(); break;
    case 'g': case 'G': closeLightbox(); setTimeout(handleGitaRandom, 80); break;
    case 'h': case 'H': closeLightbox(); setTimeout(handleIChingRandom, 80); break;
    case '+': case '=': increaseFontSize(); break;
    case '-': decreaseFontSize(); break;
  }
});

// ─── Event wiring ─────────────────────────────────────────────────────────────
// Gita
dom.gitaForm.addEventListener('submit', handleGitaSubmit);
dom.gitaRandomBtn.addEventListener('click', handleGitaRandom);

// iChing — the "Toss Coins" button is the form's submit; clicking the button
// with empty input triggers random; with a number it looks up that hexagram.
dom.ichingForm.addEventListener('submit', handleIChingSubmit);

// If there is a separate iChing random button (id="iching-random-btn"), wire it.
// It behaves identically to Toss Coins with empty input.
const ichingRandomBtn = document.getElementById('iching-random-btn');
if (ichingRandomBtn) ichingRandomBtn.addEventListener('click', handleIChingRandom);

// Lightbox controls
dom.lbClose.addEventListener('click', closeLightbox);
dom.lbOverlay.addEventListener('click', closeLightbox);
dom.lbPrev.addEventListener('click', goPrev);
dom.lbNext.addEventListener('click', goNext);

// Purport toggle — top header button
// --> dom.lbPurportBtn.addEventListener('click', togglePurport);

// Bottom buttons
dom.lbOpenPurportBtn.addEventListener('click', togglePurport);  // "Read Purport/Commentary"
dom.lbReturnBtn.addEventListener('click', togglePurport);       // "Return to Verse/Hexagram"
dom.lbCopyBtn.addEventListener('click', handleCopy);
dom.lbShareBtn.addEventListener('click', handleShare);

// Font-size controls
dom.lbFontIncrease.addEventListener('click', increaseFontSize);
dom.lbFontDecrease.addEventListener('click', decreaseFontSize);

// Enforce numeric-only input (strips paste artifacts)
[dom.gitaVerseInput, dom.ichingInput].forEach(inp => {
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\D/g, '');
  });
});

// ─── Custom chapter dropdown (Gita) ──────────────────────────────────────────
/**
 * Manages the custom <div> dropdown for Gita chapter selection.
 * Exposes on window:
 *   window._getSelectedChapter() → number | null
 *   window._setSelectedChapter(n) — programmatic select / null to reset
 */
(function initChapterSelect() {
  const wrap     = document.getElementById('chapter-select');
  const trigger  = document.getElementById('chapter-trigger');
  const trigText = document.getElementById('chapter-trigger-text');
  const list     = document.getElementById('chapter-list');
  const options  = Array.from(list.querySelectorAll('.custom-select-option'));

  let selectedValue = null; // integer | null

  function openList() {
    wrap.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeList() {
    wrap.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function selectOption(opt) {
    if (!opt) {
      // Reset / clear selection
      selectedValue = null;
      trigText.textContent = 'Select a Gītā Oracle Chapter here';
      options.forEach(o => o.removeAttribute('aria-selected'));
      closeList();
      return;
    }
    selectedValue = parseInt(opt.dataset.value, 10);
    trigText.textContent = `Ch. ${selectedValue}`;
    options.forEach(o => o.removeAttribute('aria-selected'));
    opt.setAttribute('aria-selected', 'true');
    // Clear verse input when chapter changes (spec: no trailing number)
    dom.gitaVerseInput.value = '';
    dom.gitaVerseInput.focus();
    closeList();
  }

  window._getSelectedChapter = () => selectedValue;
  window._setSelectedChapter = (chapter) => {
    if (chapter === null) { selectOption(null); return; }
    const opt = list.querySelector(`[data-value="${chapter}"]`);
    if (opt) selectOption(opt);
  };

  trigger.addEventListener('click', () => {
    wrap.classList.contains('open') ? closeList() : openList();
  });

  options.forEach(opt => opt.addEventListener('click', () => selectOption(opt)));

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) closeList();
  });

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

// ─── Usage modal ──────────────────────────────────────────────────────────────
(function initUsageModal() {
  const modal   = document.getElementById('usage-modal');
  const overlay = document.getElementById('usage-overlay');
  const closeBtn = document.getElementById('usage-close');
  const openBtn  = document.querySelector('a[href="#usage-section"]');

  if (!modal || !openBtn) return;

  openBtn.addEventListener('click', e => {
    e.preventDefault();
    modal.classList.add('open');
    document.body.classList.add('lb-active');
  });

  function closeModal() {
    modal.classList.remove('open');
    document.body.classList.remove('lb-active');
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });
})();

// ─── About modal ──────────────────────────────────────────────────────────────
(function initAboutModal() {
  const modal    = document.getElementById('about-modal');
  const overlay  = document.getElementById('about-overlay');
  const closeBtn = document.getElementById('about-close');
  const openBtn  = document.querySelector('a[href="#about-section"]');
  if (!modal || !openBtn) return;

  openBtn.addEventListener('click', e => {
    e.preventDefault();
    modal.classList.add('open');
    document.body.classList.add('lb-active');
  });

  function closeModal() {
    modal.classList.remove('open');
    document.body.classList.remove('lb-active');
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });
})();

// Apply initial font size to card
applyFontSize();

// ─── Top nav: banner fade / icon fade on scroll ───────────────────────────
(function initTopNav() {
  const banner  = document.querySelector('.banner-lotus');
  const navIcon = document.querySelector('.top-nav-icon');
  if (!banner || !navIcon) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      const visible = entry.isIntersecting;
      banner.style.opacity  = visible ? '1' : '0';
      navIcon.classList.toggle('visible', !visible);
    },
    { threshold: 0.2 }
  );

  observer.observe(banner);
})();