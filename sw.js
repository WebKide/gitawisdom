/**
 * sw.js — Wisdom Oracle Service Worker
 * Cache-first for static assets; stale-while-revalidate for navigation.
 * Update CACHE_VERSION to bust the cache on new deployments.
 */

'use strict';

const CACHE_VERSION = 'wisdom-oracle-v1.1.50';

/**
 * Deployment base.
 * Works correctly both from localhost and GitHub Pages subdirectories.
 */
const BASE = new URL('./', self.location.href).href.replace(/\/$/, '');

const ASSETS = [
  BASE + '/index.html',        // splash screen entry point
  BASE + '/oracle.html',       // main progressive web app
  BASE + '/site.webmanifest',
  BASE + '/favicon.ico',

  // Scripts
  BASE + '/js/app.js',
  BASE + '/js/bookmarks.js',
  BASE + '/js/fuse.min.js',
  BASE + '/js/fuse-search.js',
  BASE + '/js/gitacore.js',
  BASE + '/js/html2canvas.min.js',
  BASE + '/js/ichingcore.js',
  BASE + '/js/lightbox.js',
  BASE + '/js/oracle-forms.js',
  BASE + '/js/router.js',
  BASE + '/js/search-ui.js',
  BASE + '/js/share-utils.js',
  BASE + '/js/slideshow-panel.js',
  BASE + '/js/splash.js',
  BASE + '/js/wisdomoracle.js',

  // Styles
  BASE + '/css/slideshow-panel.css',
  BASE + '/css/styles.css',
  BASE + '/css/splash.css',

  // Images
  BASE + '/assets/images/card_bg.png',
  BASE + '/assets/images/iching.png',
  BASE + '/assets/images/ichingcoin.png',
  BASE + '/assets/images/imgfooter.png',
  BASE + '/assets/images/prabhupada.png',
  BASE + '/assets/images/signature.svg',
  BASE + '/assets/images/wisdomoracle.svg',
  BASE + '/assets/images/wisdomoracle_logo.svg',

  // Icons
  BASE + '/assets/icons/android-chrome-192x192.png',
  BASE + '/assets/icons/android-chrome-512x512.png',
  BASE + '/assets/icons/apple-touch-icon.png',
  BASE + '/assets/icons/favicon-16x16.png',
  BASE + '/assets/icons/favicon-32x32.png',

  // Fonts
  BASE + '/assets/fonts/kelvinch-v42-latin-regular.woff2',
  BASE + '/assets/fonts/kelvinch-v42-latin-italic.woff2',
  BASE + '/assets/fonts/kelvinch-v42-latin-700.woff2',
  BASE + '/assets/fonts/kelvinch-v42-latin-700italic.woff2',

  BASE + '/assets/fonts/gentium-plus-v2-latin_latin-ext-regular.woff2',
  BASE + '/assets/fonts/gentium-plus-v2-latin_latin-ext-italic.woff2',
  BASE + '/assets/fonts/gentium-plus-v2-latin_latin-ext-700.woff2',
  BASE + '/assets/fonts/gentium-plus-v2-latin_latin-ext-700italic.woff2',

  BASE + '/assets/fonts/sansita-v12-latin_latin-ext-700.woff2',
  BASE + '/assets/fonts/sansita-v12-latin_latin-ext-700italic.woff2',

  BASE + '/assets/fonts/ubuntu-sans-v4-latin-ext-600.woff2',
  BASE + '/assets/fonts/ubuntu-sans-v4-latin-ext-600italic.woff2',
  BASE + '/assets/fonts/ubuntu-sans-v4-latin-ext-italic.woff2',
  BASE + '/assets/fonts/ubuntu-sans-v4-latin-ext-regular.woff2',

  // Gita JSON
  BASE + '/assets/gita/bg_ch01.json',
  BASE + '/assets/gita/bg_ch02.json',
  BASE + '/assets/gita/bg_ch03.json',
  BASE + '/assets/gita/bg_ch04.json',
  BASE + '/assets/gita/bg_ch05.json',
  BASE + '/assets/gita/bg_ch06.json',
  BASE + '/assets/gita/bg_ch07.json',
  BASE + '/assets/gita/bg_ch08.json',
  BASE + '/assets/gita/bg_ch09.json',
  BASE + '/assets/gita/bg_ch10.json',
  BASE + '/assets/gita/bg_ch11.json',
  BASE + '/assets/gita/bg_ch12.json',
  BASE + '/assets/gita/bg_ch13.json',
  BASE + '/assets/gita/bg_ch14.json',
  BASE + '/assets/gita/bg_ch15.json',
  BASE + '/assets/gita/bg_ch16.json',
  BASE + '/assets/gita/bg_ch17.json',
  BASE + '/assets/gita/bg_ch18.json',

  // iChing JSON
  BASE + '/assets/iching/iching.json',

  // Info card data
  BASE + '/assets/data/about.json',
  BASE + '/assets/data/oracle.json',
  BASE + '/assets/data/search.json',
  BASE + '/assets/data/usage.json',
  BASE + '/README.md',
];

/* ────────────────────────────────────────────────────────────────────────── */
// ─── Install: cache all assets, tolerate 404s ─────────────────────────────
/* ────────────────────────────────────────────────────────────────────────── */

self.addEventListener('install', event => {
  event.waitUntil((async () => {

    const cache = await caches.open(CACHE_VERSION);

    for (const url of ASSETS) {
      try {
        const response = await fetch(url, {
            cache: 'reload'
        });

        if (response.ok) {
          await cache.put(url, response);
        } else {
          console.warn('[SW] Skip caching (HTTP ' + response.status + '):', url);
        }
      } catch (err) {
        console.warn('[SW] Skip caching:', url, err);
      }
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
/* ────────────────────────────────────────────────────────────────────────── */
// ─── Activate: delete old caches ──────────────────────────────────────────
/* ────────────────────────────────────────────────────────────────────────── */

self.addEventListener('activate', event => {
  event.waitUntil((async () => {

    if ('navigationPreload' in self.registration) {
      try {
        await self.registration.navigationPreload.enable();
      } catch (_) {}
    }

    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key !== CACHE_VERSION)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();

    const clients = await self.clients.matchAll();

    for (const client of clients) {
      client.postMessage({
        type: 'SW_UPDATED',
        version: CACHE_VERSION
      });
    }

  })());
});

/* ────────────────────────────────────────────────────────────────────────── */
// ─── Fetch: Cache-first with background refresh for navigation ────────────
/* ────────────────────────────────────────────────────────────────────────── */

self.addEventListener('fetch', event => {

  const request = event.request;

  if (request.method !== 'GET')
    return;

  // Ignore extension requests and cross-origin resources.
  if (!request.url.startsWith(self.location.origin))
    return;

  // ── HTML navigation ─────────────────────────────────────────────────────
  if (request.mode === 'navigate') {

    event.respondWith((async () => {

      const cache = await caches.open(CACHE_VERSION);
      const url = new URL(request.url);
      const baseUrl = new URL(BASE);

      // 1. Try exact match first
      let cached = await cache.match(request);

      // 2. If request is for the base path or root, fallback to index.html
      if (!cached) {
        const isBasePath = url.pathname === baseUrl.pathname ||
                           url.pathname === baseUrl.pathname + '/';
        const isRoot = url.pathname === '/';

        if (isBasePath || isRoot) {
          cached = await cache.match(BASE + '/index.html');
        }
      }

      // 3. Cache hit → serve immediately, refresh in background
      if (cached) {

        void (async () => {
          try {
            const preload = await event.preloadResponse;
            const response = preload || await fetch(request);

            if (response && response.ok) {
              const clone = response.clone();
              const cache = await caches.open(CACHE_VERSION);
              cache.put(request, clone);
            }

          } catch (_) {
            // ignore offline/network errors
          }
        })();

        return cached;
      }

      // 4. No cache → try network (or navigation preload)
      try {
        const preload = await event.preloadResponse;
        const response = preload || await fetch(request);

        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // 5. Complete offline failure → fallback to index.html
        const fallback = await cache.match(BASE + '/index.html');
        if (fallback) return fallback;

        return new Response(
          'Wisdom Oracle is offline. Please check your connection.',
          { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'text/plain' } }
        );
      }

    })());

    return;
  }

  // ── Everything else (assets, fonts, images, JSON) ───────────────────────
  event.respondWith((async () => {

    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);

    if (cached)
      return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (err) {
      console.warn('[SW] Asset fetch failed (offline?):', request.url);
      // Return a 503 so the browser gets a clean error instead of a thrown promise
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }

  })());

});