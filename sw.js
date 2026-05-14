// ─── Service Worker v24 — baby-tracker ───────────────────────────────────────
// Strategy:
//   • App shell (HTML/JS/CSS/manifest) → Network-first, fallback to cache
//   • Google Fonts                     → Cache-first (immutable)
//   • Firebase domains                 → Network-only (no caching)
//   • Offline fallback                 → /index.html from cache

const CACHE_VER   = 'baby-tracker-v24';
const FONT_CACHE  = 'bt-fonts-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles/themes.css',
  './styles/main.css',
  './src/constants.js',
  './src/helpers.js',
  './src/storage.js',
  './src/firebase.js',
  './src/sleep.js',
  './src/config.js',
  './src/security.js',
  './src/migrations.js',
  './src/perf.js',
  './src/app.js',
  './src/ui-helpers.js',
  './src/restore.js',
  './src/tombstone.js',
  './src/conflict.js',
  './src/growth.js',
  './src/debug.js',
];

const SKIP_CACHE_PATTERNS = [
  /firebase/,
  /googleapis\.com/,
  /firebaseio\.com/,
  /gstatic\.com/,
];

const FONT_PATTERNS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VER)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_VER && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip non-GET and chrome-extension
  if (e.request.method !== 'GET') return;
  if (url.startsWith('chrome-extension://')) return;

  // Firebase / Google APIs → network only
  if (SKIP_CACHE_PATTERNS.some(p => p.test(url))) return;

  // Google Fonts → cache first
  if (FONT_PATTERNS.some(p => p.test(url))) {
    e.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // App shell → network first, fallback to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VER).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request)
          .then(cached => cached || caches.match('./index.html'))
      )
  );
});

// ── Background Sync (future) ──────────────────────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'bt-sync') {
    // Sync engine is called from app.js via postMessage
    e.waitUntil(self.clients.matchAll().then(clients =>
      clients.forEach(c => c.postMessage({ type: 'SYNC_REQUESTED' }))
    ));
  }
});

// ── SW Update: activate on demand ────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
