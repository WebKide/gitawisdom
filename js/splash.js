/**
 * splash.js
 * Wisdom Oracle — retro boot sequence controller.
 *
 * Sequence:
 *   1. Boot lines appear one by one (random slight delays — feels alive).
 *   2. Progress bar fills in sync with the lines.
 *   3. After the last line, logo flickers in (CRT effect via CSS class).
 *   4. Short hold, then fade-to-black overlay activates.
 *   5. Redirect to index.html once the fade is complete.
 *
 * No dependencies. Vanilla ES5-compatible (safe for all PWA contexts).
 */

(function () {
  'use strict';

  /* ── Boot line definitions ───────────────────────────────────────────────
   * Each entry:
   *   text  — the label shown (without dots/ellipsis)
   *   dots  — how many trailing dots to append
   *   delay — ms BEFORE this line appears (randomised at runtime ± jitter)
   *   final — if true, line gets accent colour treatment
   * ─────────────────────────────────────────────────────────────────────── */
  var LINES = [
    { text: 'loading engine',          dots: 1,  baseDelay: 260 },
    { text: 'loading database',        dots: 2,  baseDelay: 340 },
    { text: 'loading graphics',        dots: 3,  baseDelay: 300 },
    { text: 'loading druid wizards',   dots: 4,  baseDelay: 620 },  /* intentionally slow */
    { text: 'loading wisdom module',   dots: 5,  baseDelay: 310 },
    { text: 'starting wisdom engine',  dots: 6,  baseDelay: 280, final: true },
  ];

  /* Jitter range in ms — each delay is baseDelay ± JITTER  */
  var JITTER = 120;

  /* How long (ms) to hold the completed screen before fading out */
  var HOLD_AFTER_LOGO = 1100;

  /* Duration (ms) of the fade-to-black CSS transition (must match splash.css) */
  var FADE_DURATION = 560;

  /* Destination after splash */
  var DEST = 'index.html';

  /* ── DOM refs ─────────────────────────────────────────────────────────── */
  var linesContainer = document.getElementById('boot-lines');
  var progressFill   = document.getElementById('progress-fill');
  var logoWrap       = document.getElementById('splash-logo-wrap');
  var fadeOverlay    = document.getElementById('fade-out-cover');

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function jitter(base) {
    return base + Math.round((Math.random() * 2 - 1) * JITTER);
  }

  function dots(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '.';
    return s;
  }

  /* ── Build line elements up-front (hidden) ────────────────────────────── */
  var lineEls = LINES.map(function (cfg) {
    var el = document.createElement('span');
    el.className = 'boot-line' + (cfg.final ? ' boot-line--final' : '');

    var prefix = document.createElement('span');
    prefix.className = 'prefix';
    prefix.textContent = '[ OK ] ';

    var label = document.createTextNode(cfg.text);

    var dotSpan = document.createElement('span');
    dotSpan.className = 'dots';
    dotSpan.textContent = dots(cfg.dots);

    el.appendChild(prefix);
    el.appendChild(label);
    el.appendChild(dotSpan);

    linesContainer.appendChild(el);
    return el;
  });

  /* Moving cursor element — appended to the active line, removed on advance */
  var cursorEl = document.createElement('span');
  cursorEl.className = 'cursor';

  /* ── Sequencer ────────────────────────────────────────────────────────── */
  var currentIndex = 0;
  var accumulated  = 0;   /* total ms from t=0 */

  function revealLine(index) {
    var el  = lineEls[index];
    var cfg = LINES[index];

    /* Move cursor to this line */
    if (cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
    el.appendChild(cursorEl);

    /* Make visible */
    el.classList.add('visible');

    /* Update progress bar: fraction = (index + 1) / total */
    var pct = Math.round(((index + 1) / LINES.length) * 100);
    progressFill.style.width = pct + '%';
  }

  function scheduleLines() {
    LINES.forEach(function (cfg, i) {
      accumulated += jitter(cfg.baseDelay);

      /* Capture the accumulated value for this closure */
      var t = accumulated;
      setTimeout(function () { revealLine(i); }, t);
    });

    /* After all lines: reveal logo */
    accumulated += jitter(500);
    var logoTime = accumulated;

    setTimeout(function () {
      /* Remove cursor */
      if (cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);

      /* CRT flicker reveal */
      logoWrap.classList.add('flicker');

      /* After hold, fade out */
      setTimeout(function () {
        fadeOverlay.classList.add('active');
        setTimeout(function () {
          window.location.replace(DEST);
        }, FADE_DURATION + 80);   /* small buffer past transition end */
      }, HOLD_AFTER_LOGO);

    }, logoTime);
  }

  /* ── Kick off when DOM is ready ──────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleLines);
  } else {
    scheduleLines();
  }

})();