/**
 * sw.js — Wisdom Oracle Service Worker
 * Cache-first strategy for full offline support.
 * Update CACHE_VERSION to bust the cache on new deployments.
 */

const CACHE_VERSION = 'wisdom-oracle-v1.0.6';

const ASSETS = [
  '/gitawisdom/',
  '/gitawisdom/index.html',
  '/gitawisdom/site.webmanifest',

  // Scripts
  '/gitawisdom/js/app.js',
  '/gitawisdom/js/gitacore.js',
  '/gitawisdom/js/ichingcore.js',
  '/gitawisdom/js/html2canvas.min.js',

  // Styles
  '/gitawisdom/css/styles.css',

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

// ─── Install: cache all assets ────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: delete old caches ─────────────────────────────────────────────
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

// ─── Fetch: cache-first, network fallback ────────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached ?? fetch(event.request))
  );
});