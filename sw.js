/**
 * sw.js — Wisdom Oracle Service Worker
 * Cache-first for static assets; stale-while-revalidate for navigation.
 * Update CACHE_VERSION to bust the cache on new deployments.
 */

const CACHE_VERSION = 'wisdom-oracle-v1.0.7';

const ASSETS = [
  '/gitawisdom/',
  '/gitawisdom/index.html',        // splash entry point
  '/gitawisdom/oracle.html',       // main app (was index.html in v1.0.6)
  '/gitawisdom/site.webmanifest',

  // Scripts
  '/gitawisdom/js/app.js',
  '/gitawisdom/js/gitacore.js',
  '/gitawisdom/js/ichingcore.js',
  '/gitawisdom/js/html2canvas.min.js',
  '/gitawisdom/js/splash.js',      // boot sequencer

  // Styles
  '/gitawisdom/css/styles.css',
  '/gitawisdom/css/splash.css',    // splash styles

  // Images
  '/gitawisdom/assets/images/wisdomoracle.svg',
  '/gitawisdom/assets/images/ACBhaktivedantaSwami.png',
  '/gitawisdom/assets/images/ichingcoin.png',
  '/gitawisdom/assets/images/card_bg.png',
  '/gitawisdom/assets/images/signature.svg',
  '/gitawisdom/assets/images/imgfooter.png',

  // Icons
  '/gitawisdom/assets/icons/apple-touch-icon.png',
  '/gitawisdom/assets/icons/favicon-32x32.png',
  '/gitawisdom/assets/icons/favicon-16x16.png',

  // Fonts
  '/gitawisdom/assets/fonts/kelvinch-v42-latin-regular.woff2',
  '/gitawisdom/assets/fonts/kelvinch-v42-latin-italic.woff2',
  '/gitawisdom/assets/fonts/kelvinch-v42-latin-700.woff2',
  '/gitawisdom/assets/fonts/kelvinch-v42-latin-700italic.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-regular.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-italic.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-500.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-500italic.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-600.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-600italic.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-700.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-700italic.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-800.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-800italic.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-900.woff2',
  '/gitawisdom/assets/fonts/noto-serif-v33-latin-900italic.woff2',
  '/gitawisdom/assets/fonts/sansita-v12-latin-700.woff2',
  '/gitawisdom/assets/fonts/sansita-v12-latin-700italic.woff2',
  '/gitawisdom/assets/fonts/sansita-v12-latin-800.woff2',
  '/gitawisdom/assets/fonts/sansita-v12-latin-800italic.woff2',
  '/gitawisdom/assets/fonts/sansita-v12-latin-900.woff2',
  '/gitawisdom/assets/fonts/sansita-v12-latin-900italic.woff2',

  // Gita JSON
  '/gitawisdom/assets/gita/bg_ch01.json',
  '/gitawisdom/assets/gita/bg_ch02.json',
  '/gitawisdom/assets/gita/bg_ch03.json',
  '/gitawisdom/assets/gita/bg_ch04.json',
  '/gitawisdom/assets/gita/bg_ch05.json',
  '/gitawisdom/assets/gita/bg_ch06.json',
  '/gitawisdom/assets/gita/bg_ch07.json',
  '/gitawisdom/assets/gita/bg_ch08.json',
  '/gitawisdom/assets/gita/bg_ch09.json',
  '/gitawisdom/assets/gita/bg_ch10.json',
  '/gitawisdom/assets/gita/bg_ch11.json',
  '/gitawisdom/assets/gita/bg_ch12.json',
  '/gitawisdom/assets/gita/bg_ch13.json',
  '/gitawisdom/assets/gita/bg_ch14.json',
  '/gitawisdom/assets/gita/bg_ch15.json',
  '/gitawisdom/assets/gita/bg_ch16.json',
  '/gitawisdom/assets/gita/bg_ch17.json',
  '/gitawisdom/assets/gita/bg_ch18.json',

  // iChing JSON
  '/gitawisdom/assets/iching/iching.json',
];

// ─── Install: cache all assets, tolerate 404s ───────────────────────────────
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
