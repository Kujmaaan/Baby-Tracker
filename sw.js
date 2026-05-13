// Baby Tracker — Service Worker v7
// Cache-First für App-Shell, Network-First für Firebase

const CACHE = 'baby-tracker-v14';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap',
];

// Firebase & externe Ressourcen — NICHT cachen (immer live)
const SKIP_CACHE = [
  'firebasedatabase.app',
  'firebaseio.com',
  'googleapis.com/identitytoolkit',
  'googleapis.com/oauth',
];

// ── Install: App-Shell cachen ─────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' })));
    }).catch(err => {
      console.warn('[SW] Cache-Install Fehler (ignoriert):', err);
    })
  );
  self.skipWaiting();
});

// ── Activate: Alte Caches löschen ────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: Cache-First für App-Shell ─────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Firebase & externe APIs immer live
  if (SKIP_CACHE.some(s => url.includes(s))) return;
  if (e.request.method !== 'GET') return;

  // Google Fonts: Cache-First
  if (url.includes('fonts.g')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // App-Shell (HTML, Manifest, etc.): Network-First mit Cache-Fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => {
        if (cached) return cached;
        // Offline-Fallback: index.html für Navigation
        if (e.request.destination === 'document') {
          return caches.match('./index.html');
        }
      }))
  );
});
