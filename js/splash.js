/**
 * splash.js
 */

(function () {
  'use strict';

  /* ── Boot line definitions ─────────────────────────────────────────────── */
  var LINES = [
    { text: 'loading engine',          dots: 1,  baseDelay: 260 },
    { text: 'loading database',        dots: 2,  baseDelay: 340 },
    { text: 'loading graphics',        dots: 3,  baseDelay: 300 },
    { text: 'loading druid wizards',   dots: 4,  baseDelay: 620 },  /* intentionally slow */
    { text: 'loading wisdom module',   dots: 5,  baseDelay: 310 },
    { text: 'starting wisdom engine',  dots: 6,  baseDelay: 280, final: true },
  ];

  var JITTER = 120;
  var HOLD_AFTER_LOGO = 1100;
  var FADE_DURATION = 560;

  /**
   * Destination after splash — works on localhost and GitHub Pages.
   * Preserves query string and hash.
   */
  var DEST = new URL('oracle.html', window.location.href).href;
  console.log('[splash.js] Redirecting to:', DEST);

  /* ── DOM refs ─────────────────────────────────────────────────────────── */
  var linesContainer = document.getElementById('boot-lines');
  var progressFill   = document.getElementById('progress-fill');
  var logoWrap       = document.getElementById('splash-logo-wrap');
  var fadeOverlay    = document.getElementById('fade-out-cover');

  /* ── Helpers ────────────────────────────────────────────────────────── */
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

  var cursorEl = document.createElement('span');
  cursorEl.className = 'cursor';

  var currentIndex = 0;
  var accumulated  = 0;   /* total ms from t=0 */

  function revealLine(index) {
    var el  = lineEls[index];
    var cfg = LINES[index];

    if (cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
    el.appendChild(cursorEl);

    el.classList.add('visible');

    var pct = Math.round(((index + 1) / LINES.length) * 100);
    progressFill.style.width = pct + '%';
  }

  function scheduleLines() {
    LINES.forEach(function (cfg, i) {
      accumulated += jitter(cfg.baseDelay);
      var t = accumulated;
      setTimeout(function () { revealLine(i); }, t);
    });

    accumulated += jitter(500);
    var logoTime = accumulated;

    setTimeout(function () {
      if (cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
      logoWrap.classList.add('flicker');

      setTimeout(function () {
        fadeOverlay.classList.add('active');

        /* Redirect to oracle.html safely */
        console.log('[splash.js] Executing redirect in', FADE_DURATION + 80, 'ms');
        setTimeout(function () {
          window.location.replace(DEST);
        }, FADE_DURATION + 80);

      }, HOLD_AFTER_LOGO);

    }, logoTime);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleLines);
  } else {
    scheduleLines();
  }

})();