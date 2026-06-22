/**
 * sw.js — Wisdom Oracle Service Worker
 * Cache-first for static assets; stale-while-revalidate for navigation.
 * Update CACHE_VERSION to bust the cache on new deployments.
 */

const CACHE_VERSION = 'wisdom-oracle-v1.0.13';

/**
 * Derive the deployment base path once at the top of the file.
 * This ensures all cached asset URLs are absolute and resolve correctly
 * regardless of whether the app is served from a sub-directory (e.g.
 * /gitawisdom/) or the domain root (e.g. localhost:8000/).
 */
const BASE = new URL('./', self.location.href).href.replace(/\/$/, '');

const ASSETS = [
  BASE + '/index.html',        // splash entry point
  BASE + '/oracle.html',       // main app
  BASE + '/site.webmanifest',

  // Scripts
  BASE + '/js/app.js',
  BASE + '/js/lightbox.js',
  BASE + '/js/oracle-forms.js',
  BASE + '/js/wisdomoracle.js',
  BASE + '/js/share-utils.js',
  BASE + '/js/gitacore.js',
  BASE + '/js/ichingcore.js',
  BASE + '/js/html2canvas.min.js',
  BASE + '/js/splash.js',
  BASE + '/js/search-ui.js',
  BASE + '/js/fuse-search.js',

  // Styles
  BASE + '/css/styles.css',
  BASE + '/css/splash.css',    // splash styles

  // Images
  BASE + '/assets/images/wisdomoracle.svg',
  BASE + '/assets/images/wisdomoracle_logo.svg',
  BASE + '/assets/images/ichingcoin.png',
  BASE + '/assets/images/card_bg.png',
  BASE + '/assets/images/signature.svg',
  BASE + '/assets/images/imgfooter.png',
  BASE + '/assets/images/prabhupada.png',
  BASE + '/assets/images/iching.png',

  // Icons
  BASE + '/assets/icons/apple-touch-icon.png',
  BASE + '/assets/icons/favicon-32x32.png',
  BASE + '/assets/icons/favicon-16x16.png',

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
  BASE + '/assets/fonts/sansita-v12-latin_latin-ext-900.woff2',
  BASE + '/assets/fonts/sansita-v12-latin_latin-ext-900italic.woff2',

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

  // Search engine
  BASE + '/js/fuse.min.js',

  // Info card data
  BASE + '/assets/data/about.json',
  BASE + '/assets/data/usage.json',
  BASE + '/assets/data/search.json',
  BASE + '/assets/data/oracle.json',
];

// ─── Install: cache all assets, tolerate 404s ───────────────────────────────
/**
 * On install, open the named cache and populate it with every asset in ASSETS.
 * Individual fetch failures are logged but do not abort the entire install.
 * After caching completes, activate the new service worker immediately.
 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return Promise.all(
        ASSETS.map(url =>
          fetch(url).then(response => {
            if (response.ok) return cache.put(url, response);
            console.warn('[SW] Skip caching (not ok):', url);
          }).catch(err => {
            console.warn('[SW] Skip caching (error):', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: delete old caches ────────────────────────────────────────────
/**
 * On activation, enumerate all existing cache names and delete any that do
 * not match the current CACHE_VERSION. This prevents stale assets from
 * being served after a deployment. After cleanup, claim all clients so the
 * new service worker controls existing tabs immediately.
 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: stale-while-revalidate for navigation, cache-first for rest ─────
/**
 * Intercepts all GET requests. Navigation requests (HTML pages) use a
 * stale-while-revalidate strategy: serve the cached response immediately
 * while refreshing from the network in the background. All other assets
 * (images, fonts, JSON, CSS, JS) use cache-first: return the cached copy
 * if present, otherwise fetch from the network and do not cache the result
 * (the install step already pre-cached everything).
 */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Navigation requests (HTML pages): serve cached fast, refresh in background
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  // Everything else (images, fonts, JSON, CSS, JS): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached ?? fetch(event.request))
  );
});