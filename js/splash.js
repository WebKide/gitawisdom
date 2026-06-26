/**
 * splash.js
 * Animated splash screen → Oracle page
 */

(function () {
  'use strict';

  const DEST = new URL('oracle.html', window.location.href).href;

  window.addEventListener('DOMContentLoaded', () => {
    const intro = document.querySelector('.intro');
    const logoSpan = document.querySelectorAll('.logo');
    const version = document.querySelector('.version');

    // Splash missing? Go directly to the app.
    if (!intro || !logoSpan.length) {
      console.warn('[splash.js] Splash elements not found.');
      window.location.replace(DEST);
      return;
    }

    console.log('[splash.js] Redirecting to:', DEST);

    // Safety fallback: never leave the user stuck on the splash screen.
    const forceRedirect = setTimeout(() => {
      console.warn('[splash.js] Fallback redirect triggered.');
      window.location.replace(DEST);
    }, 5000);

    // Animate logo letters in
    logoSpan.forEach((span, idx) => {
      setTimeout(() => {
        span.classList.add('active');
      }, (idx + 1) * 400);
    });

    // Fade in version number after logos appear
    setTimeout(() => {
      if (version) version.classList.add('visible');
    }, logoSpan.length * 400 + 200);

    // Animate logo letters out
    setTimeout(() => {

      // Fade out version WITH the logos (not before)
      if (version) version.classList.remove('visible');

      logoSpan.forEach((span, idx) => {
        setTimeout(() => {
          span.classList.remove('active');
          span.classList.add('fade');
        }, idx * 100);
      });

      // Start background color transition shortly after logos exit begins
      setTimeout(() => {
        intro.classList.add('fade-bg');
      }, 200);

      // Redirect after exit animation completes
      setTimeout(() => {
        clearTimeout(forceRedirect);
        window.location.replace(DEST);
      }, 1200);

    }, 2000);

  }, { once: true });

})();