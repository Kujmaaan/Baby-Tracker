// ─── Service Worker v29 — baby-tracker ───────────────────────────────────────
// Strategy:
//   • App shell (HTML/JS/CSS/manifest) → Network-first, fallback to cache
//   • Google Fonts                     → Cache-first (immutable)
//   • Firebase domains                 → Network-only (no caching)
//   • Offline fallback                 → /index.html from cache

const CACHE_VER   = 'baby-tracker-v37';
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
  './src/notif.js',
  './src/debug.js',
  './src/i18n.js',
  './src/recovery.js',
  './src/appcheck.js',
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
  // Do NOT call self.skipWaiting() here — that would immediately replace the
  // old SW while existing tabs still run the old app.js / i18n.js / etc.,
  // causing a version-mix.  The new SW waits until all tabs are on the new
  // version (or the user explicitly triggers SKIP_WAITING from the update
  // banner in app.js).
  e.waitUntil(
    caches.open(CACHE_VER)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(err => console.error('[SW] APP_SHELL pre-cache failed:', err))
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_VER && k !== FONT_CACHE)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all open tabs that a new SW has activated so they can
        // reload to pick up the new JS/CSS — prevents version-mix.
        return self.clients.matchAll({ type: 'window' }).then(clients =>
          clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VER }))
        );
      })
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

  // App shell → network first with HTTP-cache bypass, fallback to SW cache.
  // cache:'no-cache' ensures the browser re-validates with the server every
  // time, so fixes and updates propagate immediately without waiting for
  // HTTP Cache-Control expiry or a full SW update cycle.
  const isAppShell = APP_SHELL.some(entry => {
    const entryPath = entry.replace(/^\.\//, '/');
    try {
      const reqPath = new URL(e.request.url).pathname;
      return reqPath === entryPath || reqPath.endsWith(entryPath);
    } catch { return false; }
  });

  const networkReq = isAppShell
    ? new Request(e.request, { cache: 'no-cache' })
    : e.request;

  e.respondWith(
    fetch(networkReq)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          // Always store under the original request URL (not the no-cache variant)
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

// ── Notification click: open / focus app and navigate to target page ─────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const page = event.notification.data?.page || 'home';
  const url  = self.registration.scope + (page !== 'home' ? `?page=${page}` : '');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.startsWith(self.registration.scope));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'NAVIGATE', page });
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});

// ── Push: skeleton for future FCM integration ─────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const { title, body, tag, page } = event.data.json();
    event.waitUntil(
      self.registration.showNotification(title || 'Baby Tracker', {
        body:    body || '',
        tag:     tag  || 'bt-push',
        icon:    '/assets/icons/icon-192.png',
        badge:   '/assets/icons/icon-192.png',
        vibrate: [200, 100, 200],
        data:    { page: page || 'home' },
      })
    );
  } catch { /* non-JSON push — ignore */ }
});

// ── SW Update: activate on demand ────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'NAVIGATE') {
    // Relayed by notificationclick when app was already open
    self.clients.matchAll({ type: 'window' }).then(clients =>
      clients.forEach(c => c.postMessage(event.data))
    );
  }
});
