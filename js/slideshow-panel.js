/**
 * slideshow-panel.js
 * Lightweight horizontal auto-scrolling slideshow for the Gītā / iChing
 * intro cards. Vanilla JS, no dependencies.
 *
 * Transition style is chosen purely via a class on the root element:
 *   .wo-anim-slide — filmstrip: slides move together
 *   .wo-anim-push  — incoming slide slides in over the outgoing one
 *
 * Markup contract:
 * <div class="wo-slideshow wo-anim-slide" data-interval="6000">
 *   <div class="wo-slideshow-track">
 *     <div class="wo-slideshow-item">...</div>
 *     <div class="wo-slideshow-item">...</div>
 *   </div>
 *   <div class="wo-slideshow-dotnav">
 *     <button class="wo-dot" data-index="0" aria-label="Go to slide 1"></button>
 *     <button class="wo-dot" data-index="1" aria-label="Go to slide 2"></button>
 *   </div>
 * </div>
 *
 * Behavior:
 *   • Autoplay, default 6000ms, right-to-left (index increases, wraps)
 *   • Pauses on mouse hover and on touch
 *   • Dot navigation jumps directly to a slide
 *   • Container height animates to match whichever slide is active, since
 *     the Gītā and iChing cards differ in length
 */
'use strict';

(function () {

  function initSlideshow(root) {
    const track =    root.querySelector('.wo-slideshow-track');
    const viewport = root.querySelector('.wo-slideshow-viewport');
    const items =    Array.from(root.querySelectorAll('.wo-slideshow-item'));
    const dots  =    Array.from(root.querySelectorAll('.wo-dot'));
    if (!track || items.length < 2) return;

    const interval = parseInt(root.dataset.interval, 10) || 6000;
    const isPush   = root.classList.contains('wo-anim-push');

    let index  = 0;
    let timer  = null;
    let paused = false;

    // ── Initial layout per mode ──
    if (isPush) {
      items.forEach((item, i) => item.classList.toggle('wo-active', i === index));
    } else {
      track.style.width = `${items.length * 100}%`;
      items.forEach(item => { item.style.width = `${100 / items.length}%`; });
      updateTrackPosition();
    }

    updateDots();
    syncHeight();

    // ── Slide mode: move the whole track ──
    function updateTrackPosition() {
      track.style.transform = `translateX(-${index * (100 / items.length)}%)`;
    }

    // ── Push mode: animate outgoing/incoming pair ──
    function transitionPush(prevIndex, nextIndex, forward) {
      const outgoing = items[prevIndex];
      const incoming = items[nextIndex];

      // Place incoming off-screen on the correct side first (no transition)
      incoming.classList.remove('wo-exit-left', 'wo-exit-right', 'wo-active');
      incoming.classList.add(forward ? 'wo-enter-from-right' : 'wo-enter-from-left');
      void incoming.offsetWidth; // force reflow so the next class swap animates

      outgoing.classList.remove('wo-active');
      outgoing.classList.add(forward ? 'wo-exit-left' : 'wo-exit-right');

      incoming.classList.remove('wo-enter-from-right', 'wo-enter-from-left');
      incoming.classList.add('wo-active');
    }

    function updateDots() {
      dots.forEach((dot, i) => dot.classList.toggle('wo-dot-active', i === index));
    }

    // Animate container height to match the active slide’s natural height,
    // so switching between the shorter/longer card doesn’t jump abruptly.
    function syncHeight() {
      const active = items[index];
      requestAnimationFrame(() => {
        viewport.style.height = `${active.offsetHeight}px`;
      });
    }

    function goTo(target) {
      const prevIndex = index;
      const nextIndex = ((target % items.length) + items.length) % items.length;
      if (nextIndex === prevIndex) return;

      start();

      const forward = nextIndex > prevIndex || (prevIndex === items.length - 1 && nextIndex === 0);
      index = nextIndex;

      if (isPush) {
        transitionPush(prevIndex, nextIndex, forward);
      } else {
        updateTrackPosition();
      }

      syncHeight();
      updateDots();
    }

    function next() { goTo(index + 1); }

    function start() {
      stop();
      timer = setInterval(() => { if (!paused) next(); }, interval);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    // ── Pause on hover ───────────────────────────────────────────────
    root.addEventListener('mouseenter', () => { paused = true; });
    root.addEventListener('mouseleave', () => { paused = false; });

    // ── Swipe support (slide mode only) ──────────────────────────────
    if (!isPush) {
      let startX = 0;
      let startY = 0;
      let dragging = false;

      track.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        dragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        stop();
        track.style.transition = 'none';
      }, { passive: true });

      track.addEventListener('touchmove', e => {
        if (!dragging) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;

        // If user is scrolling vertically, cancel the swipe and let the page scroll
        if (Math.abs(dy) > Math.abs(dx)) {
            dragging = false;
            updateTrackPosition();
            start();
            return;
        }

        const width = viewport.offsetWidth;
        // Logic: (current slide offset in pixels) + movement in pixels,
        // converted to px for the drag preview only — snapping back to the
        // percentage-based transform happens in updateTrackPosition() on release.
        const currentOffsetPx = -index * width;

        const minOffsetPx = -(items.length - 1) * width;
        const maxOffsetPx = 0;

        // Clamp the drag so user can't pull past the first/last card
        const nextOffsetPx = Math.max(
          minOffsetPx,
          Math.min(maxOffsetPx, currentOffsetPx + dx)
        );

        track.style.transform = `translateX(${nextOffsetPx}px)`;
      }, { passive: true });

      track.addEventListener('touchend', e => {
        if (!dragging) return;
        dragging = false;
        const dx = e.changedTouches[0].clientX - startX;

        // Clear the inline style transition so CSS class takes over
        requestAnimationFrame(() => {
          track.style.removeProperty('transition');
        });

        // Threshold: 18% of width or 80px
        const threshold = Math.min(80, viewport.offsetWidth * 0.18);

        if (Math.abs(dx) > threshold) {
          if (dx < 0) {
            goTo(index + 1);
          } else {
            goTo(index - 1);
          }
        } else {
          // Snap back using the original percentage-based function
          updateTrackPosition();
        }
        start();
      }, { passive: true });

      // insert here?
      track.addEventListener('touchcancel', () => {
        dragging = false;

        requestAnimationFrame(() => {
          track.style.removeProperty('transition');
        });

        updateTrackPosition();
        start();
      }, { passive: true });

    }

    // ── Dot navigation ──
    let hoverTimeout = null; // Declare outside so it's shared by all dots

    dots.forEach(dot => {
      // 1. Click behavior (Mobile/Accessibility)
      dot.addEventListener('click', () => {
        const target = parseInt(dot.dataset.index, 10);
        if (!Number.isNaN(target)) goTo(target);
      });

      // 2. Hover behavior
      dot.addEventListener('mouseenter', () => {
        const target = parseInt(dot.dataset.index, 10);
        if (!Number.isNaN(target)) {
          stop(); // Stop auto-play immediately on touch/hover
          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(() => {
            goTo(target);
          }, 150);
        }
      });

      // 3. Clear timer if mouse leaves before 150ms
      dot.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimeout);
        if (!paused) {
          start();
        }
      });
    });

    // Recalculate height on resize
    window.addEventListener('resize', syncHeight);

    start();

    }

  function initAll() {
    document.querySelectorAll('.wo-slideshow').forEach(initSlideshow);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

})();