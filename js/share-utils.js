/**
 * share-utils.js
 * Wisdom Oracle — Copy/share pipeline, PNG card generation, and info-modal system (v1.0.10)
 *
 * Responsibilities:
 *   • handleShare / fitShareText / buildShareFilename / triggerDownload / flashBtn
 *     — PNG card generation and native sharing or download fallback
 *   • handleCopy — clipboard copy with fallback for older browsers
 *   • openInfoModal / renderInfoCard / processInfoText / renderInfoKey / isValidAssetPath
 *     — generic info-modal renderer for Usage and About cards
 *   • initUsageModal / initAboutModal — wire click listeners to nav links
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

// ─── Copy helper ─────────────────────────────────────────────────────────────

/**
 * Builds plain-text copy string for the current verse/hexagram.
 * Uses oracle-appropriate heading ("Gītā Wisdom" vs "I Ching Oracle").
 * Optionally appends the homepage URL.
 *
 * @param {boolean} [includeUrl=false] — whether to append window.location.href
 * @returns {string} — formatted plain text ready for clipboard
 */
function buildShareText(includeUrl = false) {
  const dom = getDom();
  const heading     = dom.lbChapterHeading.textContent.trim();
  const translation = dom.lbTranslation.textContent.trim();
  const label       = window._woState?.mode === 'iching' ? 'I Ching Oracle' : 'Gītā Wisdom';
  const text        = `${label} — ${heading}:\n\n${translation}`;
  return includeUrl ? `${text}\n\n${window.location.href}` : text;
}

/**
 * Briefly swaps a button's label to give visual feedback, then restores it.
 * @param {HTMLButtonElement} btn — the button to flash
 * @param {string} label — temporary label (e.g. "✓ COPIED")
 * @returns {Promise<void>} — resolves when the original label is restored
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

/**
 * Copies the current verse/hexagram text to the clipboard.
 * Uses the modern Clipboard API with a fallback for HTTP or older browsers.
 */
async function handleCopy() {
  const dom = getDom();
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

// ─── Share PNG helpers ────────────────────────────────────────────────────────

/**
 * Build the PNG download filename based on current mode and verse/hexagram.
 * Gita single:  wisdom_oracle_gita_17_1.png
 * Gita grouped: wisdom_oracle_gita_17_26-27.png
 * iChing:       wisdom_oracle_iching_hexagram_05.png
 *
 * @returns {string} — filename for the generated PNG
 */
function buildShareFilename() {
  const state = window._woState;
  if (state?.mode === 'iching') {
    const n      = parseInt(String(state.hexRef).split('-')[0], 10);
    const padded = String(n).padStart(2, '0');
    return `wisdom_oracle_iching_hexagram_${padded}.png`;
  }
  return `wisdom_oracle_gita_${state?.chapter}_${state?.verseRef}.png`;
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
  const MAX_HEIGHT = 800;
  const MIN_SIZE   = 14;
  const START_SIZE = 64;
  const STEP       = 2;

  const dom = getDom();
  const textEl = dom.sharePngVerse;

  // Temporarily set height to auto so scrollHeight reads true content height.
  // With height:800px + overflow:hidden, scrollHeight is always clamped to 800
  // and the shrink loop never fires.
  textEl.style.height = 'auto';

  let size = START_SIZE;
  textEl.style.fontSize   = `${size}px`;
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
  dom.sharePngFooter.style.left      = '';
}

/**
 * Captures the hidden share card as a PNG and either invokes the native
 * share sheet (mobile) or triggers a direct download (desktop).
 * Wraps all paths in try/finally to ensure resetShareCard() always runs.
 */
async function handleShare() {
  const dom = getDom();

  // Guard — html2canvas must be loaded globally by html2canvas.min.js
  if (typeof html2canvas !== 'function') {
    flashBtn(dom.lbShareBtn, '✗ ERROR');
    return;
  }

  // ── Populate share card content ───────────────────────────────────────────
  // Title: grey title reference, color grey and reduced font-size 32px
  dom.sharePngTitle.innerHTML = dom.lbChapterHeading.textContent
    .replace(
      / (\(BG [^)]+\))/,   // ← insert line break before reference
      '<br/><span style="font-size:32px;color:#949ba4;">$1</span>'
    );

  // Body: translation / judgment text (curly quotes already added by renderVerse)
  dom.sharePngVerse.textContent = dom.lbTranslation.textContent;

  // Fit text to card — must happen before html2canvas reads the DOM
  fitShareText();

  // Footer: anchor to bottom-left of the card (card is position:relative)
  dom.sharePngFooter.style.position = 'absolute';
  dom.sharePngFooter.style.bottom   = '100px';
  dom.sharePngFooter.style.left     = '830px';

  flashBtn(dom.lbShareBtn, '⏳ ...');

  // ── Capture ───────────────────────────────────────────────────────────────
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
        try {
          if (!blob) { throw new Error('Canvas toBlob returned null'); }

          const file = new File([blob], filename, { type: 'image/png' });

          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file] });
              await flashBtn(dom.lbShareBtn, '✓ SHARED');
            } catch (err) {
              // AbortError = user dismissed the sheet — not a real error
              if (err.name !== 'AbortError') throw err;
              await flashBtn(dom.lbShareBtn, 'SHARE');
            }
          } else {
            // Share API present but files not supported — fall back to download
            throw new Error('Files not supported by navigator.share');
          }
        } catch (err) {
          triggerDownload(canvas, filename);
        } finally {
          // Always clean up styles regardless of which path was taken
          resetShareCard();
        }
      }, 'image/png');

    } else {
      // ── Desktop: direct PNG download ─────────────────────────────────────
      try {
        triggerDownload(canvas, filename);
        await flashBtn(dom.lbShareBtn, '✓ SAVED');
      } finally {
        resetShareCard();
      }
    }

  } catch (err) {
    // html2canvas itself threw — log and surface to user
    console.error('Share PNG failed:', err);
    await flashBtn(dom.lbShareBtn, '✗ ERROR');
    resetShareCard(); // always clean up on error
  }
}

/**
 * Fallback: trigger a direct PNG file download in the browser.
 * Used on desktop or when the native share API cannot handle files.
 *
 * @param {HTMLCanvasElement} canvas — the captured canvas
 * @param {string} filename — the desired download filename
 */
async function triggerDownload(canvas, filename) {
  const link    = document.createElement('a');
  link.download = filename;
  link.href     = canvas.toDataURL('image/png');
  link.click();
  await flashBtn(getDom().lbShareBtn, '✓ SAVED');
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
 * @param {string} key — the section key (h1, h2, text, img, list)
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

  // Footer (plain text only, \n → <br />)
  if (data.footer && String(data.footer).trim()) {
    const ft = String(data.footer).replace(/\n/g, '<br />');
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
 * Checks if the main lightbox is already open to avoid removing body.lb-active
 * prematurely when the info modal closes.
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

  // Check if the main lightbox is still open; if so, keep lb-active
  const lightboxOpen = document.getElementById('lightbox')?.classList.contains('open');
  if (_openModalCount <= 0 && !lightboxOpen) {
    document.body.classList.remove('lb-active');
  }
}

// ─── Usage modal ──────────────────────────────────────────────────────────────

/**
 * Wires the Usage modal open/close behavior to the nav link.
 * The modal HTML is already present in oracle.html; this just binds events.
 */
function initUsageModal() {
  const modal   = document.getElementById('usage-modal');
  const overlay = document.getElementById('usage-overlay');
  const closeBtn = document.getElementById('usage-close');
  const openBtn  = document.querySelector('a[href="#usage-section"]');

  if (!modal || !openBtn) return;

  openBtn.addEventListener('click', e => {
    e.preventDefault();
    openInfoModal('usage-modal', 'assets/data/usage.json');
  });

  closeBtn.addEventListener('click', () => closeInfoModal(modal));
  overlay.addEventListener('click', () => closeInfoModal(modal));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeInfoModal(modal);
  });
}

// ─── About modal ──────────────────────────────────────────────────────────────

/**
 * Wires the About modal open/close behavior to the nav link.
 * The modal HTML is already present in oracle.html; this just binds events.
 */
function initAboutModal() {
  const modal    = document.getElementById('about-modal');
  const overlay  = document.getElementById('about-overlay');
  const closeBtn = document.getElementById('about-close');
  const openBtn  = document.querySelector('a[href="#about-section"]');

  if (!modal || !openBtn) return;

  openBtn.addEventListener('click', e => {
    e.preventDefault();
    openInfoModal('about-modal', 'assets/data/about.json');
  });

  closeBtn.addEventListener('click', () => closeInfoModal(modal));
  overlay.addEventListener('click', () => closeInfoModal(modal));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeInfoModal(modal);
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  handleCopy,
  handleShare,
  openInfoModal,
  initUsageModal,
  initAboutModal,
  escHtml,
  isValidAssetPath,
  processInfoText,
  renderInfoKey,
  renderInfoCard,
};