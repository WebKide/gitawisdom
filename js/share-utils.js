/**
 * share-utils.js
 * Wisdom Oracle — Copy/share pipeline, PNG card generation, and info-modal system
 *
 * Responsibilities:
 *   • handleShare — merged action: always copies text to clipboard first, then
 *     generates a PNG card and shares (mobile) or downloads (desktop) it
 *   • handleCopy — context-aware clipboard copy: translation in verse view,
 *     full purport/commentary body (+ colophon) in purport view
 *   • buildShareText / buildPurportText / buildShareFilename — text builders
 *   • fitShareText / resetShareCard / triggerDownload / flashBtn — PNG helpers
 *   • openInfoModal / renderInfoCard / processInfoText / renderInfoKey / isValidAssetPath
 *     — generic info-modal renderer for Usage and About cards
 *   • initUsageModal / initAboutModal / initSettingsModal — wire nav/menu listeners
 *   • escHtml — generic HTML escape utility
 *
 * This module is leaf-level: no imports from other app modules to avoid circular deps.
 * It checks lightbox state directly on the DOM for modal layering safety.
 */

'use strict';

// ─── Access shared DOM from app.js ────────────────────────────────────────────
/** @returns {Object} */
const getDom = () => window._woDom;

// ─── Info-modal cache ───────────────────────────────────────────────────────
/** In-memory cache so each JSON file is fetched only once per session. */
const _infoCardCache = {};

// ─── Settings state ────────────────────────────────────────────────────────────
/**
 * Persisted user preferences. Loaded once by initSettingsModal().
 * Add new keys here and mirror them in _loadSettings() + the checkbox wiring.
 */
const _settings = {
  showDateInPng:      true,
  showLayoutOutlines: false,
};

/**
 * Reads saved settings from localStorage and merges them into _settings.
 * Unknown or malformed keys are silently ignored; missing keys keep defaults.
 */
function _loadSettings() {
  try {
    const raw = localStorage.getItem('wo_settings');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.showDateInPng      === 'boolean') _settings.showDateInPng      = saved.showDateInPng;
    if (typeof saved.showLayoutOutlines === 'boolean') _settings.showLayoutOutlines = saved.showLayoutOutlines;
  } catch (_) {}
}

/**
 * Persists one setting key/value pair to localStorage.
 * @param {string}  key   — must match a key in _settings
 * @param {boolean} value
 */
function _saveSetting(key, value) {
  _settings[key] = value;
  try { localStorage.setItem('wo_settings', JSON.stringify(_settings)); } catch (_) {}
}

/**
 * Injects or removes the developer layout-outline <style> tag.
 * @param {boolean} enabled
 */
function _applyOutlines(enabled) {
  const existing = document.getElementById('wo-dev-outlines');
  if (enabled && !existing) {
    const s       = document.createElement('style');
    s.id          = 'wo-dev-outlines';
    s.textContent = '* { outline: 1px solid red !important; }';
    document.head.appendChild(s);
  } else if (!enabled && existing) {
    existing.remove();
  }
}

// ─── Generic utilities ──────────────────────────────────────────────────────

/**
 * Escapes HTML special characters to prevent XSS when injecting text into HTML.
 * @param {string} str — raw string that may contain HTML metacharacters
 * @returns {string} — escaped string safe for innerHTML insertion
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Text builders ────────────────────────────────────────────────────────────

/**
 * Builds plain-text copy string for the current verse/hexagram view.
 * Uses oracle-appropriate heading ("Gītā Wisdom" vs "I Ching Oracle").
 * Optionally appends the homepage URL.
 *
 * Wisdom Oracle mode returns the composite reading (all 3 sections) instead
 * of the currently visible lightbox text.
 *
 * @param {boolean} [includeUrl=false] — whether to append window.location.href
 * @returns {string} — formatted plain text ready for clipboard
 */
function buildShareText(includeUrl = false) {
  const state = window._woState;
  const dom   = getDom();

  // ── Wisdom Oracle composite text ──────────────────────────────────────────
  if (state?.mode === 'wisdom' && state?.wisdomPayload) {
    const p = state.wisdomPayload;
    const text = [
      'Wisdom Oracle — Today’s meditation personalised for you.',
      '',
      '✦ The Personal Meditation',
      p.guidance,
      '',
      '✦ The Current Circumstance',
      p.gitaTranslation,
      `Read full verse ${p.gitaChapter}.${p.gitaRef}`,
      '',
      '✦ The Insightful Inspiration',
      p.ichingTranslation,
      `Read full hexagram ${p.ichingRef}`
    ].join('\n');
    return includeUrl ? `${text}\n\n${window.location.href}` : text;
  }

  // ── Gītā / I Ching verse view ─────────────────────────────────────────────
  const heading     = dom.lbChapterHeading?.textContent?.trim() ?? '';
  const translation = dom.lbTranslation?.textContent?.trim()    ?? '';
  const label       = state?.mode === 'iching' ? 'I Ching Oracle' : 'Gītā Wisdom';
  const text        = `${label} \u2014 ${heading}:\n\n${translation}`;
  return includeUrl ? `${text}\n\n${window.location.href}` : text;
}

/**
 * Builds plain-text copy string for the current purport/commentary view.
 *
 * Includes:
 *   - Mode label + chapter/hexagram heading as a title line
 *   - Section label ("PURPORT" or "COMMENTARY")
 *   - Purport body text, or the random no-purport fallback message if no body
 *   - Chapter-end colophon if visible (last verse of a Gita chapter)
 *   - Homepage URL as trailing attribution
 *
 * @returns {string} — formatted plain text ready for clipboard
 */
function buildPurportText() {
  const dom   = getDom();
  const state = window._woState;

  const label   = state?.mode === 'iching' ? 'I Ching Oracle' : 'Gītā Wisdom';
  const heading = dom.lbChapterHeading?.textContent?.trim() ?? '';

  // Prefer the rendered purport body; fall back to the no-purport message element
  const purportBody =
       dom.lbPurport?.textContent?.trim()
    || document.getElementById('lb-no-purport-msg')?.textContent?.trim()
    || '';

  // Append colophon only when it is currently visible (last verse of a chapter)
  const colophon = dom.lbChapterEnd?.classList.contains('visible')
    ? '\n\n' + dom.lbChapterEnd.textContent.trim()
    : '';

  const section = state?.mode === 'iching' ? 'COMMENTARY' : 'PURPORT';

  return `${label} \u2014 ${heading}:\n\n${section}\n\n${purportBody}${colophon}\n\n${window.location.href}`;
}

/**
 * Builds the PNG download filename based on current mode and verse/hexagram.
 *
 * Wisdom Oracle:  wisdom_oracle_reading_YYYYMMDD.png
 * Gita single:    wisdom_oracle_gita_17_1.png
 * Gita grouped:   wisdom_oracle_gita_17_26-27.png
 * iChing:         wisdom_oracle_iching_hexagram_05.png
 *
 * @returns {string} — filename for the generated PNG
 */
function buildShareFilename() {
  const state = window._woState;

  if (state?.mode === 'wisdom') {
    const now  = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `wisdom_oracle_reading_${date}.png`;
  }

  if (state?.mode === 'iching') {
    const n      = parseInt(String(state.hexRef).split('-')[0], 10);
    const padded = String(n).padStart(2, '0');
    return `wisdom_oracle_iching_hexagram_${padded}.png`;
  }

  return `wisdom_oracle_gita_${state?.chapter}_${state?.verseRef}.png`;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

/**
 * Briefly swaps a button's label to give visual feedback, then restores it.
 *
 * @param {HTMLButtonElement} btn   — the button to flash
 * @param {string}            label — temporary label (e.g. "✓ COPIED")
 * @returns {Promise<void>} — resolves when the original label is restored
 */
function flashBtn(btn, label) {
  const original  = btn.textContent;
  btn.textContent = label;
  btn.disabled    = true;
  return new Promise(resolve => {
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled    = false;
      resolve();
    }, 1800);
  });
}

// ─── Clipboard helper ─────────────────────────────────────────────────────────

/**
 * Writes text to the clipboard using the Clipboard API with a textarea fallback.
 * Extracted as a shared step used by both handleCopy and handleShare.
 *
 * @param {string} text — plain text to place on the clipboard
 * @returns {Promise<void>}
 */
async function _copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for HTTP or browsers without Clipboard API
    const ta          = document.createElement('textarea');
    ta.value          = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ─── Copy handler ─────────────────────────────────────────────────────────────

/**
 * Copies the current content to the clipboard.
 *
 * Verse/hexagram view      → copies translation text + URL.
 * Purport/commentary view  → copies the full purport/commentary body,
 *                            including any no-purport fallback and chapter
 *                            colophon, then appends the homepage URL.
 *
 * Only the COPY button is shown in purport/commentary view (SHARE is hidden
 * for Gita in that view per renderVerse() in lightbox.js).
 */
async function handleCopy() {
  const dom   = getDom();
  const state = window._woState;

  const text = state?.showPurport
    ? buildPurportText()
    : buildShareText(true); // verse view: translation + URL

  await _copyToClipboard(text);
  flashBtn(dom.lbCopyBtn, '\u2713 COPIED');
}

// ─── Share PNG helpers ────────────────────────────────────────────────────────

/**
 * Resizes the share card verse text to fill the safe area as generously as
 * possible without overflowing.
 *
 * Strategy:
 *   1. Start at START_SIZE and shrink until scrollHeight ≤ MAX_HEIGHT.
 *   2. Set line-height after size is finalised — tighter for large text.
 *
 * NOTE: the share card sits at left:-9999px but is display:flex, so
 * scrollHeight reads are valid as long as width is fixed (1080px in CSS).
 */
function fitShareText() {
  const MAX_HEIGHT = 800;
  const MIN_SIZE   = 14;
  const START_SIZE = 64;
  const STEP       = 2;

  const dom    = getDom();
  const textEl = dom.sharePngVerse;

  // Temporarily set height to auto so scrollHeight reads true content height.
  // With height:800px + overflow:hidden, scrollHeight is always clamped to 800
  // and the shrink loop never fires.
  textEl.style.height   = 'auto';
  let size              = START_SIZE;
  textEl.style.fontSize = `${size}px`;
  textEl.style.lineHeight = '1.4';

  while (textEl.scrollHeight > MAX_HEIGHT && size > MIN_SIZE) {
    size -= STEP;
    textEl.style.fontSize = `${size}px`;
  }

  textEl.style.lineHeight = size > 48 ? '1.3' : size > 32 ? '1.45' : '1.6';

  // Restore the fixed height for html2canvas capture
  textEl.style.height = '800px';
}

/**
 * Resets all inline styles applied to the share card during capture.
 * Called in a finally-equivalent pattern to guarantee cleanup.
 */
function resetShareCard() {
  const dom = getDom();
  dom.sharePngVerse.style.fontSize   = '';
  dom.sharePngVerse.style.lineHeight = '';
  dom.sharePngVerse.style.height     = '';
  dom.sharePngFooter.style.position  = '';
  dom.sharePngFooter.style.bottom    = '';
  dom.sharePngFooter.style.right     = '';
  dom.sharePngFooter.style.whiteSpace = '';
}

/**
 * Fallback: trigger a direct PNG file download in the browser.
 * Used on desktop or when the native share API cannot handle files.
 *
 * @param {HTMLCanvasElement} canvas   — the captured canvas
 * @param {string}            filename — the desired download filename
 */
async function triggerDownload(canvas, filename) {
  const link    = document.createElement('a');
  link.download = filename;
  link.href     = canvas.toDataURL('image/png');
  link.click();
  await flashBtn(getDom().lbShareBtn, '\u2713 SAVED');
}

// ─── Share handler ────────────────────────────────────────────────────────────

/**
 * Merged share handler: always copies translation text to clipboard first,
 * then generates and shares/downloads a PNG card.
 *
 * Flow:
 *   1. Copy translation text + URL to clipboard (guaranteed, never skipped).
 *   2. If html2canvas is unavailable, flash "✓ COPIED" and return early.
 *   3. Populate the hidden share card with the correct content for the current mode.
 *   4. Apply date stamp, fit text, capture via html2canvas.
 *   5a. Mobile: offer the PNG via the native Web Share API.
 *       Falls back to download if files are not supported or share is aborted.
 *   5b. Desktop: trigger a direct PNG download.
 *   6. Flash feedback:
 *       "✓ SHARED"  — native share sheet accepted
 *       "✓ SAVED"   — PNG downloaded
 *       "✓ COPIED"  — clipboard only (html2canvas unavailable)
 *       "✗ ERROR"   — html2canvas threw
 *
 * The clipboard copy in step 1 always completes before any async PNG work
 * begins, so even if capture fails the user still has the text.
 */
async function handleShare() {
  const dom   = getDom();
  const state = window._woState;

  // ── Step 1: Clipboard copy (always runs, regardless of PNG outcome) ────────
  await _copyToClipboard(buildShareText(true));

  // ── Step 2: Guard — html2canvas must be loaded globally ───────────────────
  if (typeof html2canvas !== 'function') {
    flashBtn(dom.lbShareBtn, '\u2713 COPIED');
    return;
  }

  // ── Step 3: Populate share card ───────────────────────────────────────────
  if (state?.mode === 'wisdom' && state?.wisdomPayload) {
    const p = state.wisdomPayload;

    const SHARE_TITLES = [
      'A meditation for reflection and inner clarity',
      'Aligning with nature for effortless daily success with guidance',
      'Cultivate inner truth to influence the world with wisdom',
      'Eternal wisdom for navigating modern-day chaos',
      'Living with intention, grace, and spiritual guidance',
      'Navigate challenge with grace and strategic foresight',
      'Overcoming fear through ancient spiritual wisdom',
      'Synchronize your actions with the cosmos today',
      'The timeless art of mindful, purposeful living in wisdom',
      'Today’s insightful meditation and inspiring guidance',
      'Understanding the hidden currents of your day with wisdom',
      'Wisdom revealed through three perspectives',
    ];

    dom.sharePngTitle.innerHTML =
      SHARE_TITLES[Math.floor(Math.random() * SHARE_TITLES.length)] +
      '<br/><span style="font-size:32px;color:#949ba4;">carefully personalised for you</span>';

    dom.sharePngVerse.innerHTML = [
      `✦ ${escHtml(p.guidance)}`,
      `<br/>✦ ${escHtml(p.gitaTranslation)}`,
      `<br/>✦ ${escHtml(p.ichingTranslation)}`,
    ].join('');

  } else {
    // Gītā / I Ching verse view
    dom.sharePngTitle.innerHTML = dom.lbChapterHeading.textContent
      .replace(
        / (\(BG [^)]+\))/,
        '<br/><span style="font-size:32px;color:#949ba4;">$1</span>'
      );
    dom.sharePngVerse.textContent = dom.lbTranslation.textContent;
  }

  // ── Step 4a: Date stamp (respects settings toggle) ────────────────────────
  const shareDateEl = document.querySelector('.share-png-date');
  if (shareDateEl) {
    shareDateEl.textContent = (_settings.showDateInPng && window.formatBannerDate)
      ? window.formatBannerDate(new Date()) + ' \u2022 v1.1.54'
      : 'v1.1.54';
  }

  // ── Step 4b: Fit text and position footer before capture ──────────────────
  fitShareText();

  dom.sharePngFooter.style.position   = 'absolute';
  dom.sharePngFooter.style.bottom     = '100px';
  dom.sharePngFooter.style.right      = '165px';
  dom.sharePngFooter.style.whiteSpace = 'nowrap';

  flashBtn(dom.lbShareBtn, '\u23F3 ...');

  // ── Step 4c: Capture ──────────────────────────────────────────────────────
  try {
    const canvas   = await html2canvas(dom.sharePngCard, {
      scale:           2,       // 2× for sharp output on high-DPI screens
      useCORS:         false,   // all assets are local — no CORS needed
      allowTaint:      false,
      backgroundColor: null,    // transparent — lets card_bg.png show through
      logging:         false,
      width:           1080,
      height:          1350,
    });

    const filename = buildShareFilename();

    // ── Step 5a: Mobile — native share sheet ─────────────────────────────
    if (navigator.canShare && navigator.share) {
      canvas.toBlob(async (blob) => {
        try {
          if (!blob) throw new Error('Canvas toBlob returned null');

          const file = new File([blob], filename, { type: 'image/png' });

          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file] });
              await flashBtn(dom.lbShareBtn, '\u2713 SHARED');
            } catch (err) {
              // AbortError = user dismissed the sheet — not a real error;
              // clipboard copy already completed in step 1, just restore label
              if (err.name !== 'AbortError') throw err;
              await flashBtn(dom.lbShareBtn, 'SHARE');
            }
          } else {
            // Share API present but files not supported — fall back to download
            await triggerDownload(canvas, filename);
          }
        } catch {
          await triggerDownload(canvas, filename);
        } finally {
          resetShareCard();
        }
      }, 'image/png');

    } else {
      // ── Step 5b: Desktop — direct PNG download ────────────────────────
      try {
        await triggerDownload(canvas, filename);
      } finally {
        resetShareCard();
      }
    }

  } catch (err) {
    // html2canvas threw — text is already in the clipboard from step 1
    console.error('Share PNG failed:', err);
    await flashBtn(dom.lbShareBtn, '\u2717 ERROR');
    resetShareCard();
  }
}

// ─── Info-modal system ────────────────────────────────────────────────────────

/**
 * Returns true only for local asset paths ending in .png or .svg.
 * Used to validate image paths in info card JSON before rendering.
 *
 * @param {string} value — the path string to validate
 * @returns {boolean} — true if the value is a valid local image asset path
 */
function isValidAssetPath(value) {
  return typeof value === 'string'
    && value.startsWith('assets/')
    && /\.(png|svg)$/i.test(value);
}

/**
 * Converts \n → <br /> and <hr> variants → .separator div.
 * HTML tags in the value are passed through as-is.
 *
 * @param {string} value — raw text value from JSON
 * @returns {string} — HTML string with line breaks converted
 */
function processInfoText(value) {
  return String(value)
    .replace(/\n/g, '<br />')
    .replace(/<<hr\s*\/?>/gi, '<div class="separator fade-in"></div>');
}

/**
 * Renders one key-value pair from a section object into HTML.
 * Returns an HTML string, or '' when the value should be skipped.
 *
 * @param {string} key   — the section key (h1, h2, text, img, list)
 * @param {string} value — the section value
 * @returns {string} — HTML fragment or empty string
 */
function renderInfoKey(key, value) {
  if (value === null || value === 'none' || value === '' || value === undefined) return '';

  switch (key) {
    case 'h1':
      return `<h3 class="lb-chapter-heading">${processInfoText(String(value))}</h3>`;

    case 'h2':
      return `<p class="section-label">${processInfoText(String(value))}</p>`;

    case 'text':
      return `<p class="lb-info-text">${processInfoText(String(value))}</p>`;

    case 'img': {
      if (!isValidAssetPath(value)) return '';
      return `<a href="${value}" target="_blank" rel="noopener">`
           + `<img src="${value}" class="lb-info-img" alt="" draggable="false" loading="lazy" /></a>`;
    }

    case 'list': {
      const items = String(value).split('\n').filter(Boolean);
      if (!items.length) return '';
      const lis = items.map(item => `<li>${item}</li>`).join('');
      return `<ul class="lb-info-list">${lis}</ul>`;
    }

    default:
      return ''; // unknown keys silently ignored
  }
}

/**
 * Renders a loaded JSON data object into a modal's header and .lb-body.
 * Works for any .lb-card modal — no modal-specific logic.
 *
 * @param {HTMLElement} modal — the modal container element
 * @param {Object}      data  — the parsed JSON data object
 */
function renderInfoCard(modal, data) {
  // Header icon
  const icon = modal.querySelector('.lb-author-icon');
  if (icon && isValidAssetPath(data.icon)) {
    icon.src = data.icon;
    icon.alt = '';
  }

  // Header title
  const titleEl = modal.querySelector('.lb-author-name');
  if (titleEl && data['page-name']) {
    titleEl.innerHTML = `<strong>${escHtml(String(data['page-name']))}</strong>`;
  }

  // Body: iterate sections → keys in insertion order
  const body = modal.querySelector('.lb-body');
  if (!body) return;

  let html = '';
  const sections = Array.isArray(data.sections) ? data.sections : [];
  sections.forEach(section => {
    Object.entries(section).forEach(([key, value]) => {
      html += renderInfoKey(key, value);
    });
  });

  // Footer (plain text only, \n → ✦ separator)
  if (data.footer && String(data.footer).trim()) {
    const ft = String(data.footer).replace(/\n/g, ' ✦ ');
    html += `<p class="lb-info-footer">${ft}</p>`;
  }

  body.innerHTML = html;
}

/**
 * Tracks how many modals are currently open so lb-active is only removed
 * when the last modal closes. This prevents the top-nav from reappearing
 * when an info modal is closed while the main lightbox remains open.
 */
let _openModalCount = 0;

/**
 * Fetches a JSON file (cached after first load), renders the card, opens the modal.
 *
 * @param {string} modalId  — the DOM id of the modal container
 * @param {string} jsonPath — the path to the JSON data file
 */
async function openInfoModal(modalId, jsonPath) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  if (!_infoCardCache[jsonPath]) {
    try {
      const resp = await fetch(jsonPath);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      _infoCardCache[jsonPath] = await resp.json();
    } catch (err) {
      console.warn('[InfoCard] Failed to load:', jsonPath, err);
      return;
    }
  }

  renderInfoCard(modal, _infoCardCache[jsonPath]);
  modal.classList.add('open');
  document.body.classList.add('lb-active');
  _openModalCount++;
}

async function openUsageModal() {
  return openInfoModal(
    'usage-modal',
    'assets/data/usage.json'
  );
}

/**
 * Closes an info modal and decrements the open modal count.
 * Only removes body.lb-active if no other modals (including the main lightbox)
 * are still open.
 *
 * @param {HTMLElement} modal — the modal container to close
 */
function closeInfoModal(modal) {
  modal.classList.remove('open');
  _openModalCount--;

  // Keep lb-active if the main lightbox is still open
  const lightboxOpen = document.getElementById('lightbox')?.classList.contains('open');
  if (_openModalCount <= 0 && !lightboxOpen) {
    document.body.classList.remove('lb-active');
  }
}

// ─── Usage modal ──────────────────────────────────────────────────────────────

/**
 * Wires the Usage modal open/close behavior to the nav link.
 */
function initUsageModal() {
  const modal    = document.getElementById('usage-modal');
  const overlay  = document.getElementById('usage-overlay');
  const closeBtn = document.getElementById('usage-close');
  const openBtn  = document.querySelector('a[href="#usage-section"]');

  if (!modal) return;

  if (openBtn) {
    openBtn.addEventListener('click', e => {
      e.preventDefault();
      openUsageModal();
    });
  }

  closeBtn?.addEventListener('click', () => closeInfoModal(modal));
  overlay?.addEventListener('click', () => closeInfoModal(modal));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closeInfoModal(modal);
    }
  });
}

// ─── About modal ──────────────────────────────────────────────────────────────

/**
 * Wires the About modal open/close behavior to the nav link.
 * Loads content from README.md; falls back to about.json on error.
 */
function initAboutModal() {
  const modal    = document.getElementById('about-modal');
  const overlay  = document.getElementById('about-overlay');
  const closeBtn = document.getElementById('about-close');
  const openBtn  = document.querySelector('a[href="#about-section"]');

  if (!modal || !openBtn) return;

  openBtn.addEventListener('click', e => {
    e.preventDefault();
    openAboutFromReadme(modal);
  });

  closeBtn.addEventListener('click', () => closeInfoModal(modal));
  overlay.addEventListener('click', () => closeInfoModal(modal));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeInfoModal(modal);
  });
}

/**
 * Fetches README.md, parses markdown to HTML, and renders it into the about modal.
 * Falls back to about.json if the fetch fails.
 *
 * @param {HTMLElement} modal — the about modal container
 */
async function openAboutFromReadme(modal) {
  try {
    const resp = await fetch('README.md');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const md   = await resp.text();
    const html = parseMarkdownToHtml(md);
    renderAboutHtml(modal, html);
    modal.classList.add('open');
    document.body.classList.add('lb-active');
    _openModalCount++;
  } catch (err) {
    console.warn('[AboutModal] Failed to load README.md:', err);
    openInfoModal('about-modal', 'assets/data/about.json');
  }
}

/**
 * Renders parsed README HTML into the about modal's .lb-body.
 *
 * @param {HTMLElement} modal — the about modal container
 * @param {string}      html  — parsed HTML string
 */
function renderAboutHtml(modal, html) {
  const icon = modal.querySelector('.lb-author-icon');
  if (icon) {
    icon.src = 'assets/images/prabhupada.png';
    icon.alt = '';
  }

  const body = modal.querySelector('.lb-body');
  if (!body) return;

  body.innerHTML = html;
}

/**
 * Markdown-to-HTML parser for README.md content.
 * Handles: headings, bold, italic, links, lists, paragraphs, code,
 * blockquotes, horizontal rules.
 * Strips all <img> tags and markdown image syntax.
 */
function parseMarkdownToHtml(md) {
  if (!md) return '';

  // Remove HTML img tags
  md = md.replace(/<img[^>]*>/gi, '');
  // Remove empty <div> wrappers left after image removal
  md = md.replace(/<div[^>]*>\s*(?:<br\s*\/?>\s*)*\s*<\/div>/gi, '');
  // Unwrap remaining <div> tags but keep inner content
  md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1');
  // Normalize HTML line breaks and inline tags
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/?(span|p)[^>]*>/gi, '');
  // Remove markdown image syntax
  md = md.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  // Collapse multiple blank lines
  md = md.replace(/\n{3,}/g, '\n\n');

  const lines         = md.split('\n');
  const blocks        = [];
  let currentList     = null;
  let currentListType = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Horizontal rule
    if (/^---+/.test(line)) {
      _flushList(blocks, currentList, currentListType);
      currentList     = null;
      currentListType = null;
      blocks.push('<div class="linebreak fade-in"></div>');
      continue;
    }

    // Headings (h6 → h1, checked in descending order)
    const h6 = line.match(/^#{6}\s+(.*)/);
    if (h6) { _flushList(blocks, currentList, currentListType); currentList = null; currentListType = null; blocks.push(`<p class="lb-info-footer">${_parseInline(h6[1])}</p>`); continue; }

    const h5 = line.match(/^#{5}\s+(.*)/);
    if (h5) { _flushList(blocks, currentList, currentListType); currentList = null; currentListType = null; blocks.push(`<h5>${_parseInline(h5[1])}</h5>`); continue; }

    const h4 = line.match(/^#{4}\s+(.*)/);
    if (h4) { _flushList(blocks, currentList, currentListType); currentList = null; currentListType = null; blocks.push(`<h4>${_parseInline(h4[1])}</h4>`); continue; }

    const h3 = line.match(/^#{3}\s+(.*)/);
    if (h3) { _flushList(blocks, currentList, currentListType); currentList = null; currentListType = null; blocks.push(`<p class="section-label">${_parseInline(h3[1])}</p>`); continue; }

    const h2 = line.match(/^#{2}\s+(.*)/);
    if (h2) { _flushList(blocks, currentList, currentListType); currentList = null; currentListType = null; blocks.push(`<h2 class="lb-chapter-heading">${_parseInline(h2[1])}</h2>`); continue; }

    const h1 = line.match(/^#{1}\s+(.*)/);
    if (h1) { _flushList(blocks, currentList, currentListType); currentList = null; currentListType = null; blocks.push(`<h1 class="lb-chapter-heading">${_parseInline(h1[1])}</h1>`); continue; }

    // Blockquote
    const bq = line.match(/^>\s+(.*)/);
    if (bq) { _flushList(blocks, currentList, currentListType); currentList = null; currentListType = null; blocks.push(`<blockquote>${_parseInline(bq[1])}</blockquote>`); continue; }

    // Unordered list
    const ul = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (ul) {
      if (currentListType !== 'ul') { _flushList(blocks, currentList, currentListType); currentList = []; currentListType = 'ul'; }
      currentList.push(_parseInline(ul[2]));
      continue;
    }

    // Ordered list
    const ol = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (ol) {
      if (currentListType !== 'ol') { _flushList(blocks, currentList, currentListType); currentList = []; currentListType = 'ol'; }
      currentList.push(_parseInline(ol[2]));
      continue;
    }

    // Plain paragraph
    _flushList(blocks, currentList, currentListType);
    currentList     = null;
    currentListType = null;
    blocks.push(`<p class="lb-info-text">${_parseInline(line)}</p>`);
  }

  _flushList(blocks, currentList, currentListType);
  return blocks.join('\n\n');
}

/** Flush accumulated list items into a single <ul> or <ol> block. */
function _flushList(blocks, items, type) {
  if (!items || !items.length || !type) return;
  const tag = type === 'ol' ? 'ol' : 'ul';
  const lis = items.map(item => `<li>${item}</li>`).join('');
  blocks.push(`<${tag} class="lb-info-list">${lis}</${tag}>`);
}

/** Parse inline markdown: bold, italic, code, links, checkboxes. */
function _parseInline(text) {
  if (!text) return '';

  // Checkboxes (before bold/italic — they use brackets too)
  text = text.replace(/\[x\]\s+/gi, '<span style="color:var(--success-green);">\u2611</span> ');
  text = text.replace(/\[ \]\s+/gi, '<span style="color:var(--text-muted);">\u2610</span> ');

  // Bold + italic (***)
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold (**)
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic (*)
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Bold (__)
  text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
  // Italic (_)
  text = text.replace(/_(.*?)_/g, '<em>$1</em>');

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  return text;
}

// ─── Settings modal ────────────────────────────────────────────────────────────

/**
 * Loads persisted settings, applies them immediately, then wires the
 * menu-toggle button, backdrop, close button, and checkboxes.
 * Settings do not lock scroll (no lb-active) — the modal is lightweight.
 */
function initSettingsModal() {
  const dom = getDom();
  _loadSettings();
  _applyOutlines(_settings.showLayoutOutlines);

  const modal      = document.getElementById('settings-modal');
  const overlay    = document.getElementById('settings-overlay');
  const usageBtn   = document.getElementById('setting-open-usage'); // New reference
  const closeBtn   = document.getElementById('settings-close');
  const openBtn    = document.getElementById('menu-toggle-btn');
  const cbDate     = document.getElementById('setting-show-date');
  const cbOutlines = document.getElementById('setting-show-outlines');
  const cbSlideshow  = document.getElementById('remove-slideshow-scrolling');

  if (!modal || !openBtn) return;

  // Reflect persisted state in checkboxes immediately
  if (cbDate)     cbDate.checked     = _settings.showDateInPng;
  if (cbOutlines) cbOutlines.checked = _settings.showLayoutOutlines;
  if (cbSlideshow) {
    let stacked = false;
    try { stacked = localStorage.getItem('wo_slideshow_stacked') === '1'; } catch (_) {}
    cbSlideshow.checked = stacked;
  }

  // function _closeSettings() { modal.classList.remove('open'); }
  function _closeSettings() {
    modal.classList.remove('open');
    if (window._woState) window._woState.showSettings = false;
  }

  openBtn.addEventListener('click', () => {
    // console.log('Settings icon clicked'); // Debug check
    modal.classList.toggle('open'); 
  });
  closeBtn.addEventListener('click', _closeSettings);
  overlay.addEventListener('click', _closeSettings);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) _closeSettings();
  });

  cbDate?.addEventListener('change', () => {
    _saveSetting('showDateInPng', cbDate.checked);
  });

  cbOutlines?.addEventListener('change', () => {
    _saveSetting('showLayoutOutlines', cbOutlines.checked);
    _applyOutlines(cbOutlines.checked);
    _closeSettings();  // automatically close settings modal
  });

  cbSlideshow?.addEventListener('change', () => {
    window._woSlideshowSetStacked?.(cbSlideshow.checked);
    _closeSettings();  // automatically close settings modal
  });

  // Wire the Usage Button
  if (usageBtn) {
    usageBtn.addEventListener('click', async () => {
      modal.classList.remove('open');
      if (window._woState) window._woState.showSettings = false;
      await openUsageModal();
    });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  handleCopy,
  handleShare,
  openInfoModal,
  initUsageModal,
  initAboutModal,
  initSettingsModal,
  escHtml,
  isValidAssetPath,
  processInfoText,
  renderInfoKey,
  renderInfoCard,
};