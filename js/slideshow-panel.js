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
 *   • Fixed mobile slideshow with proper touch/autoplay isolation
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
    let hoverPaused    = false; // mouse is currently over the slideshow
    let externalPaused = false; // isPaused externally (e.g. chapter dropdown open)
    let isDragging = false;     // NEW: prevents autoplay during interaction
    let isStacked = false;      // NEW: true when Settings > "Stop slideShow animation" is on

    try {
      isStacked = localStorage.getItem('wo_slideshow_stacked') === '1';
    } catch (_) {}

    let dragStartX = 0;
    let dragStartY = 0;
    let dragCurrentX = 0;
    let hoverTimeout = null;

    // ── Initial layout ──
    if (isStacked) {
      root.classList.add('wo-stacked');
      if (isPush) items.forEach(item => item.classList.add('wo-active'));
    } else if (isPush) {
      items.forEach((item, i) => item.classList.toggle('wo-active', i === index));
    } else {
      track.style.width = `${items.length * 100}%`;
      items.forEach(item => { item.style.width = `${100 / items.length}%`; });
      updateTrackPosition();
    }

    updateDots();
    if (!isStacked) syncHeight();

    // ── Slide mode: percentage-based transform ──
    function updateTrackPosition(animate = true) {
      if (!animate) {
        track.style.transition = 'none';
      }
      track.style.transform = `translateX(-${index * (100 / items.length)}%)`;
      if (!animate) {
        void track.offsetWidth; // force reflow
        track.style.removeProperty('transition');
      }
    }

    // ── Push mode transitions ──
    function transitionPush(prevIndex, nextIndex, forward) {
      const outgoing = items[prevIndex];
      const incoming = items[nextIndex];

      incoming.classList.remove('wo-exit-left', 'wo-exit-right', 'wo-active');
      incoming.classList.add(forward ? 'wo-enter-from-right' : 'wo-enter-from-left');
      void incoming.offsetWidth;

      outgoing.classList.remove('wo-active');
      outgoing.classList.add(forward ? 'wo-exit-left' : 'wo-exit-right');

      incoming.classList.remove('wo-enter-from-right', 'wo-enter-from-left');
      incoming.classList.add('wo-active');
    }

    function updateDots() {
      dots.forEach((dot, i) => dot.classList.toggle('wo-dot-active', i === index));
    }

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

      // NEW: Reset autoplay timer on ANY navigation
      resetAutoplay();

      const forward = nextIndex > prevIndex || 
                      (prevIndex === items.length - 1 && nextIndex === 0);
      index = nextIndex;

      if (isPush) {
        transitionPush(prevIndex, nextIndex, forward);
      } else {
        updateTrackPosition();
      }

      syncHeight();
      updateDots();
    }

    function next() { 
      // NEW: guard during interaction / stacked mode
      if (isDragging || isPaused() || isStacked) return;  
      goTo(index + 1); 
    }

    function isPaused() {
      return hoverPaused || externalPaused;
    }

    // ── Single source of truth for the autoplay timer ──
    function startAutoplay() {
      stopAutoplay();
      if (!isPaused() && !isDragging && !isStacked) {
        timer = setInterval(next, interval);
      }
    }

    function stopAutoplay() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function resetAutoplay() {
      stopAutoplay();
      startAutoplay();
    }

    // ── Public pause/resume — used by the chapter dropdown via
    //    window._woSlideshowPause(true/false). Independent from hover,
    //    so hovering the trigger and opening the dropdown (which portals
    //    its list outside `root`, triggering a spurious mouseleave) can
    //    never prematurely resume the slideshow.
    root._woPause = () => {
      externalPaused = true;
      stopAutoplay();
    };
    root._woResume = () => {
      externalPaused = false;
      if (!hoverPaused) startAutoplay();
    };

    // ── Touch handling (slide mode only) ──
    if (!isPush) {
      let rafId = null;

      track.addEventListener('touchstart', e => {
        if (isStacked) return;   // NEW: don't hijack vertical scroll in stacked mode
        if (e.touches.length !== 1) return;
        
        isDragging = true;
        stopAutoplay();  // NEW: stop immediately, don't wait
        
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
        dragCurrentX = dragStartX;

        // NEW: Disable transition BEFORE any drag
        track.style.transition = 'none';
        
        // Cancel any pending animation frame
        if (rafId) cancelAnimationFrame(rafId);
      }, { passive: true });

      track.addEventListener('touchmove', e => {
        if (!isDragging || e.touches.length !== 1) return;
        
        const dx = e.touches[0].clientX - dragStartX;
        const dy = e.touches[0].clientY - dragStartY;
        dragCurrentX = e.touches[0].clientX;

        // Vertical scroll detection: if scrolling dominates, abort drag
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
          isDragging = false;
          track.style.removeProperty('transition');
          updateTrackPosition(false);
          startAutoplay();
          return;
        }

        // Prevent horizontal drag from triggering page scroll
        if (Math.abs(dx) > Math.abs(dy)) {
          // Don't call preventDefault — passive listener can't
          // Instead rely on CSS touch-action: pan-y
        }

        const width = viewport.offsetWidth;
        const currentOffsetPx = -index * width;
        const minOffsetPx = -(items.length - 1) * width;
        const maxOffsetPx = 0;
        const nextOffsetPx = Math.max(minOffsetPx, Math.min(maxOffsetPx, currentOffsetPx + dx));

        // Use rAF for smooth drag rendering
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          track.style.transform = `translateX(${nextOffsetPx}px)`;
        });
      }, { passive: true });

      track.addEventListener('touchend', e => {
        if (!isDragging) return;
        isDragging = false;

        const dx = dragCurrentX - dragStartX;
        const threshold = Math.min(80, viewport.offsetWidth * 0.18);

        // NEW: Always clean up rAF
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        // Re-enable CSS transition BEFORE setting final position
        track.style.removeProperty('transition');

        if (Math.abs(dx) > threshold) {
          if (dx < 0) {
            goTo(index + 1);
          } else {
            goTo(index - 1);
          }
        } else {
          // Snap back
          updateTrackPosition();
        }

        // NEW: Delay autoplay restart to prevent immediate next-slide
        setTimeout(startAutoplay, interval);
      }, { passive: true });

      track.addEventListener('touchcancel', () => {
        isDragging = false;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        track.style.removeProperty('transition');
        updateTrackPosition();
        setTimeout(startAutoplay, interval);
      }, { passive: true });
    }

    // ── Pause on hover (desktop only) ──
    // NEW: Only for non-touch devices
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    if (!isTouchDevice) {
      root.addEventListener('mouseenter', () => {
        hoverPaused = true;
        stopAutoplay();
      });
      root.addEventListener('mouseleave', () => {
        hoverPaused = false;
        // Don’t resume if a dropdown (or other external pause) is still active
        if (!externalPaused) startAutoplay();
      });
    }

    // ── Dot navigation ──
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const target = parseInt(dot.dataset.index, 10);
        if (!Number.isNaN(target)) goTo(target);
      });

      // NEW: Only hover on non-touch
      if (!isTouchDevice) {
        dot.addEventListener('mouseenter', () => {
          const target = parseInt(dot.dataset.index, 10);
          if (!Number.isNaN(target)) {
            stopAutoplay();
            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
              goTo(target);
            }, 150);
          }
        });

        dot.addEventListener('mouseleave', () => {
          clearTimeout(hoverTimeout);
          if (!hoverPaused && !externalPaused) startAutoplay();
        });
      }
    });

    // ── Visibility API: pause when tab hidden ──
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAutoplay();
      } else if (!hoverPaused && !externalPaused && !isDragging) {
        startAutoplay();
      }
    });

    // Recalculate height on resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(syncHeight, 150);
    });

    // ── NEW: runtime toggle between slideshow and stacked layout ──
    function applyStackedMode(stack) {
      if (stack === isStacked) return;
      isStacked = stack;
      root.classList.toggle('wo-stacked', stack);

      if (stack) {
        stopAutoplay();
        if (isDragging) {
          isDragging = false;
          track.style.removeProperty('transition');
        }
        if (!isPush) {
          track.style.cssText = '';
          items.forEach(item => { item.style.width = ''; });
        } else {
          items.forEach(item => item.classList.add('wo-active'));
        }
        if (viewport) viewport.style.height = '';
      } else {
        if (!isPush) {
          track.style.width = `${items.length * 100}%`;
          items.forEach(item => { item.style.width = `${100 / items.length}%`; });
          updateTrackPosition(false);
        } else {
          items.forEach((item, i) => item.classList.toggle('wo-active', i === index));
        }
        syncHeight();
        if (!isPaused()) startAutoplay();
      }
    }

    root._woSetStacked = applyStackedMode;

    startAutoplay();
  }

  function initAll() {
    document.querySelectorAll('.wo-slideshow').forEach(initSlideshow);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Expose a global helper for external callers
  window._woSlideshowPause = (pause) => {
    document.querySelectorAll('.wo-slideshow').forEach(root => {
      if (pause && root._woPause) root._woPause();
      else if (!pause && root._woResume) root._woResume();
    });
  };

  // ── NEW: global stacked-mode toggle, called from the Settings modal ──
  window._woSlideshowSetStacked = (stack) => {
    try { localStorage.setItem('wo_slideshow_stacked', stack ? '1' : '0'); } catch (_) {}
    document.querySelectorAll('.wo-slideshow').forEach(root => {
      if (root._woSetStacked) root._woSetStacked(stack);
    });
  };
})();