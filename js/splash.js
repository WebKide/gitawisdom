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
      if (version) version.classList.remove('visible');

      logoSpan.forEach((span, idx) => {
        setTimeout(() => {
          span.classList.remove('active');
          span.classList.add('fade');
        }, idx * 100);
      });

      // Trigger the full screen slide up
      setTimeout(() => {
        intro.classList.add('slide-up');
      }, 200);

      // 1. Wait for the slide-up animation to finish (matching the 0.8s CSS transition)
      const animationDone = new Promise(resolve => setTimeout(resolve, 1000));

      // 2. Wait for BOTH the Service Worker and the animation
      Promise.all([
        animationDone,
        'serviceWorker' in navigator ? navigator.serviceWorker.ready : Promise.resolve()
      ]).then(() => {
        clearTimeout(forceRedirect);
        console.log('[splash.js] Boot sequence complete. Redirecting...');
        window.location.replace(DEST);
      }).catch(err => {
        console.error('[splash.js] Error during boot sequence:', err);
        window.location.replace(DEST); 
      });

    }, 2000);

  }, { once: true });

})();