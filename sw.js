/**
 * sw.js — Wisdom Oracle Service Worker
 * Cache-first for static assets; stale-while-revalidate for navigation.
 * Update CACHE_VERSION to bust the cache on new deployments.
 */

'use strict';

const CACHE_VERSION = 'wisdom-oracle-v1.1.66';
const BASE = new URL('./', self.location.href).href.replace(/\/$/, '');

const ASSETS = [
  BASE + '/index.html', // splash screen entry point
  BASE + '/oracle.html', // main progressive web app
  BASE + '/site.webmanifest',
  BASE + '/favicon.ico',

  // Scripts
  BASE + '/js/app.js',
  BASE + '/js/bookmarks.js',
  BASE + '/js/fuse-search.js',
  BASE + '/js/fuse.min.js',
  BASE + '/js/gitacore.js',
  BASE + '/js/html2canvas.min.js',
  BASE + '/js/ichingcore.js',
  BASE + '/js/lightbox.js',
  BASE + '/js/oracle-forms.js',
  BASE + '/js/search-ui.js',
  BASE + '/js/share-utils.js',
  BASE + '/js/slideshow-panel.js',
  BASE + '/js/splash.js',
  BASE + '/js/wisdomoracle.js',

  // Styles
  BASE + '/css/fonts.css',
  BASE + '/css/slideshow-panel.css',
  BASE + '/css/splash.css',
  BASE + '/css/styles.css',
  BASE + '/css/variables.css',

  // Images
  BASE + '/assets/images/card_bg.png',
  BASE + '/assets/images/iching.jpg',
  BASE + '/assets/images/iching.png',
  BASE + '/assets/images/ichingcoin.png',
  BASE + '/assets/images/imgfooter.png',
  BASE + '/assets/images/prabhupada.jpg',
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
// ─── Helpers ──────────────────────────────────────────────────────────────
/* ────────────────────────────────────────────────────────────────────────── */

function offlineResponse(message) {
  return new Response(message || '[SW] Offline — resource not cached.', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Only http(s) same-origin URLs are ever handled (skips capacitor://, file://…). */
function isCacheableRequest(request) {
  if (request.method !== 'GET') return false;
  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return false;
  }
  if (url.origin !== ORIGIN) return false;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (!url.href.startsWith(SCOPE)) return false; // outside our scope
  return true;
}

/** Normalised cache key: origin + pathname only (drops ?query and #hash). */
function cacheKeyFor(url) {
  return url.origin + url.pathname;
}

/** Resolve the HTML document a navigation should be served from. */
function navigationKeyFor(url) {
  const clean = cacheKeyFor(url);
  const isRoot =
    clean === ORIGIN + '/' ||
    clean === BASE ||
    clean === BASE + '/';

  if (isRoot) return INDEX_URL;
  if (clean === BASE + '/index.html' || clean === BASE + '/oracle.html') return clean;

  // Unknown route (e.g. SPA deep link): serve the splash entry point.
  return INDEX_URL;
}

/* ────────────────────────────────────────────────────────────────────────── */
// ─── Install: pre-cache every asset for offline use ───────────────────────
/* ────────────────────────────────────────────────────────────────────────── */

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Cache sequentially-ish but tolerating individual failures so one 404
    // never blocks the whole install.
    const results = await Promise.all(ASSETS.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (!response.ok) {
          console.warn('[SW] Skip caching (HTTP ' + response.status + '):', url);
          return false;
        }
        await cache.put(url, response);
        return true;
      } catch (err) {
        console.warn('[SW] Skip caching:', url, err);
        return false;
      }
    }));

    const cached = results.filter(Boolean).length;
    console.log('[SW] Pre-cache complete: ' + cached + '/' + ASSETS.length + ' assets.');

    // Do not take over instantly on first install; let the page finish loading.
    // (A new version activates on the next visit, or immediately on SKIP_WAITING.)
  })());
});

/* ────────────────────────────────────────────────────────────────────────── */
// ─── Activate: purge outdated caches ──────────────────────────────────────
/* ────────────────────────────────────────────────────────────────────────── */

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(keys.map(key => {
      if (key !== CACHE_NAME && key.startsWith(CACHE_PREFIX)) {
        console.log('[SW] Purging outdated cache:', key);
        return caches.delete(key);
      }
      return Promise.resolve(false);
    }));

    if (self.registration.navigationPreload) {
      // Optional: keep navigation preload consistent across browsers.
      try { await self.registration.navigationPreload.disable(); } catch (_) {}
    }

    await self.clients.claim();
    console.log('[SW] Active:', CACHE_NAME);
  })());
});

/* ────────────────────────────────────────────────────────────────────────── */
// ─── Messages (update flow) ───────────────────────────────────────────────
/* ────────────────────────────────────────────────────────────────────────── */

self.addEventListener('message', event => {
  const data = event.data;
  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
  if (data === 'CLEAR_CACHES' || (data && data.type === 'CLEAR_CACHES')) {
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.registration.unregister())
    );
  }
});

/* ────────────────────────────────────────────────────────────────────────── */
// ─── Fetch ────────────────────────────────────────────────────────────────
/* ────────────────────────────────────────────────────────────────────────── */

self.addEventListener('fetch', event => {
  const request = event.request;

  // Ignore cross-origin, non-GET, and non-http(s) schemes (capacitor://, file://…).
  if (!isCacheableRequest(request)) return;

  // Never let a Range request corrupt a cached full response.
  if (request.headers.has('range')) return;

  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const request = event.request;
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_NAME);

  const isNavigation =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html');

  /* ── 1. Navigations: stale-while-revalidate ───────────────────────────── */
  if (isNavigation) {
    const key = navigationKeyFor(url);

    // Kick off the network refresh in the background, regardless of cache hit.
    const networkUpdate = fetch(new Request(request, { cache: 'no-cache' }))
      .then(async response => {
        if (response && response.ok && response.type === 'basic') {
          try { await cache.put(key, response.clone()); } catch (_) {}
        }
        return response;
      })
      .catch(() => null);

    // Keep the worker alive until the refresh settles.
    event.waitUntil(networkUpdate.catch(() => {}));

    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;

    const fresh = await networkUpdate;
    if (fresh && fresh.ok) return fresh;

    // Last resort: cached splash, otherwise a real 503 response (never undefined).
    const splash = await cache.match(INDEX_URL, { ignoreSearch: true });
    return splash || offlineResponse('[SW] Offline — page not available.');
  }

  /* ── 2. Static assets: strict cache-first ─────────────────────────────── */
  const cachedAsset = await cache.match(request, { ignoreSearch: true });
  if (cachedAsset) return cachedAsset;

  /* ── 3. Runtime network, with graceful offline handling ───────────────── */
  try {
    const response = await fetch(request);

    // Opportunistically cache successful same-origin basic responses that were
    // not part of the pre-cache list (e.g. lazily loaded JSON).
    if (response && response.ok && response.type === 'basic' &&
        response.status === 200 && !response.redirected) {
      const type = response.headers.get('content-type') || '';
      if (!type.startsWith('text/event-stream')) {
        const copy = response.clone();
        const key = cacheKeyFor(url);
        cache.put(key, copy).catch(() => {});
      }
    }

    return response;
  } catch (_) {
    const accept = request.headers.get('accept') || '';
    if (accept.includes('text/html')) {
      const splash = await cache.match(INDEX_URL, { ignoreSearch: true });
      if (splash) return splash;
    }
    return offlineResponse('[SW] Asset missing and offline.');
  }
}