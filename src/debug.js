// ─── debug.js — Debug Panel + Observability ───────────────────────────────────
// Hidden debug panel, accessible via:
//   - 5× tap on version number in Settings
//   - URL param: ?debug=1
//   - localStorage: bt_debug_mode = '1'
//
// Panels: Queue Inspector · Sync Diagnostics · Cache Diagnostics ·
//         IndexedDB Stats · Migration Status · Performance Timings ·
//         Conflict Log · Export Debug Report

import { getPendingQueue, getAllEntries, openDB, STORES } from './storage.js';
import { getSyncDiagnostics, getConflictLog, clearConflictLog } from './conflict.js';
import { getTombstoneStats } from './tombstone.js';
import { checkIntegrity, CURRENT_DB_VERSION } from './migrations.js';
import { fbReady, fbUser } from './firebase.js';

// ── Enable / Disable ──────────────────────────────────────────────────────────

const DEBUG_KEY = 'bt_debug_mode';

export function isDebugMode() {
  return localStorage.getItem(DEBUG_KEY) === '1' ||
         new URLSearchParams(location.search).get('debug') === '1';
}

export function enableDebug()  { localStorage.setItem(DEBUG_KEY, '1'); }
export function disableDebug() { localStorage.removeItem(DEBUG_KEY); }
export function toggleDebug()  { isDebugMode() ? disableDebug() : enableDebug(); }

// ── Performance Timings ───────────────────────────────────────────────────────

const _timings = new Map(); // label → { start, end }

export function perfStart(label) {
  _timings.set(label, { start: performance.now(), end: null });
}

export function perfEnd(label) {
  const t = _timings.get(label);
  if (t) t.end = performance.now();
}

export function getTimings() {
  const result = {};
  for (const [label, { start, end }] of _timings) {
    result[label] = end !== null ? `${(end - start).toFixed(1)}ms` : 'running';
  }
  return result;
}

// ── Data Collection ───────────────────────────────────────────────────────────

async function collectAll() {
  const [queue, syncDiag, tombStats, conflictLog] = await Promise.all([
    getPendingQueue().catch(() => []),
    getSyncDiagnostics().catch(() => ({})),
    getTombstoneStats().catch(() => ({})),
    Promise.resolve(getConflictLog()),
  ]);

  // IDB store counts
  const storeCounts = {};
  for (const store of Object.values(STORES)) {
    try {
      const entries = await getAllEntries(store);
      storeCounts[store] = entries.length;
    } catch { storeCounts[store] = '?'; }
  }

  // Cache diagnostics
  let caches = [];
  try {
    const keys = await cacheStorage.keys();
    caches = keys.map(c => c);
  } catch {
    try {
      caches = await window.caches?.keys() || [];
    } catch {}
  }

  // IDB integrity
  const db = await openDB().catch(() => null);
  const integrityIssues = db ? checkIntegrity(db) : ['DB not open'];

  // Navigation timing
  const navTiming = performance.getEntriesByType?.('navigation')?.[0];

  return {
    timestamp:    new Date().toISOString(),
    dbVersion:    CURRENT_DB_VERSION,
    integrityIssues,
    firebase:     { ready: fbReady, uid: fbUser?.uid || null },
    storeCounts,
    syncQueue: {
      pending:    queue.filter(i => i.status === 'pending').length,
      quarantined: queue.filter(i => i.status === 'quarantined').length,
      items:      queue.slice(0, 20), // last 20 for display
    },
    syncDiagnostics: syncDiag,
    tombstones:  tombStats,
    conflicts:   conflictLog.slice(0, 20),
    caches,
    timings:     getTimings(),
    navTiming:   navTiming ? {
      domContentLoaded: `${navTiming.domContentLoadedEventEnd?.toFixed(0)}ms`,
      load:             `${navTiming.loadEventEnd?.toFixed(0)}ms`,
      firstByte:        `${navTiming.responseStart?.toFixed(0)}ms`,
    } : null,
    userAgent:   navigator.userAgent,
    online:      navigator.onLine,
    memory:      performance.memory ? {
      used:  `${(performance.memory.usedJSHeapSize / 1_048_576).toFixed(1)}MB`,
      total: `${(performance.memory.totalJSHeapSize / 1_048_576).toFixed(1)}MB`,
      limit: `${(performance.memory.jsHeapSizeLimit  / 1_048_576).toFixed(1)}MB`,
    } : null,
  };
}

// ── Render Panel ──────────────────────────────────────────────────────────────

export async function openDebugPanel() {
  document.getElementById('bt-debug-panel')?.remove();

  const data = await collectAll();
  const panel = document.createElement('div');
  panel.id = 'bt-debug-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Debug Panel');
  panel.style.cssText = [
    'position:fixed','inset:0','background:rgba(0,0,0,.75)',
    'z-index:99999','overflow-y:auto','padding:1rem','box-sizing:border-box',
    'font-family:monospace','font-size:.8rem','color:#e2e8f0',
  ].join(';');

  const fmt = v => JSON.stringify(v, null, 2);

  const section = (title, content) => `
    <details style="margin:.5rem 0;background:#1e293b;border-radius:8px;padding:.5rem">
      <summary style="font-weight:700;cursor:pointer;color:#a5b4fc">${title}</summary>
      <pre style="margin:.5rem 0 0;white-space:pre-wrap;word-break:break-all;max-height:250px;overflow-y:auto">${content}</pre>
    </details>`;

  panel.innerHTML = `
    <div style="max-width:640px;margin:0 auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <h2 style="margin:0;color:#a5b4fc;font-size:1rem">🔧 Baby Tracker Debug Panel</h2>
        <button id="bt-debug-close" style="background:#dc2626;color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:700">✕ Schließen</button>
      </div>

      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem">
        <button onclick="window._debugExport()" style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:.8rem">📥 Report exportieren</button>
        <button onclick="window._debugClearConflicts()" style="background:#d97706;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:.8rem">🗑️ Konflikt-Log leeren</button>
        <button onclick="window._debugRefresh()" style="background:#059669;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:.8rem">🔄 Aktualisieren</button>
      </div>

      ${section('🏥 System', `Online: ${data.online} | Firebase: ${data.firebase.ready} | UID: ${data.firebase.uid || '—'}\nDB-Version: ${data.dbVersion} | Integrity: ${data.integrityIssues.length === 0 ? '✅ OK' : '❌ ' + data.integrityIssues.join(', ')}`)}
      ${section('📊 IndexedDB Store-Größen', Object.entries(data.storeCounts).map(([s,c]) => `${s.padEnd(16)} ${c}`).join('\n'))}
      ${section('🔄 Sync Queue', `Pending: ${data.syncQueue.pending} | Quarantined: ${data.syncQueue.quarantined}\n\nLetzte Items:\n${fmt(data.syncQueue.items)}`)}
      ${section('⚠️ Sync Diagnostics', fmt(data.syncDiagnostics))}
      ${section('🪦 Tombstones', fmt(data.tombstones))}
      ${section('⚡ Konflikte (letzte 20)', fmt(data.conflicts))}
      ${section('💾 Service Worker Caches', data.caches.join('\n') || '—')}
      ${section('⏱️ Performance Timings', `Nav: ${fmt(data.navTiming)}\nApp: ${fmt(data.timings)}`)}
      ${section('🧠 Memory', data.memory ? fmt(data.memory) : 'Nicht verfügbar (nur Chrome)')}
      ${section('🌐 User Agent', data.userAgent)}
    </div>`;

  document.body.appendChild(panel);
  panel.querySelector('#bt-debug-close').onclick = () => panel.remove();

  window._debugExport = async () => {
    const full = await collectAll();
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `bt-debug-${Date.now()}.json`,
    });
    a.click();
  };
  window._debugClearConflicts = () => {
    clearConflictLog();
    panel.remove();
    openDebugPanel();
  };
  window._debugRefresh = () => {
    panel.remove();
    openDebugPanel();
  };
}

// ── Quarantine Monitor ────────────────────────────────────────────────────────

const QUARANTINE_BANNER_ID = 'bt-quarantine-banner';
const QUARANTINE_CHECK_MS  = 5 * 60_000; // check every 5 minutes

let _quarantineTimer = null;

/**
 * Show a persistent warning banner when quarantined sync items are detected.
 * @param {number} count
 */
function showQuarantineBanner(count) {
  if (document.getElementById(QUARANTINE_BANNER_ID)) return; // already shown
  const el = document.createElement('div');
  el.id = QUARANTINE_BANNER_ID;
  el.style.cssText = [
    'position:fixed','top:0','left:0','right:0',
    'background:#dc2626','color:#fff','padding:10px 16px',
    'font-size:.82rem','font-weight:600','z-index:9995',
    'display:flex','align-items:center','gap:.5rem',
    'box-shadow:0 2px 8px rgba(0,0,0,.3)',
  ].join(';');
  el.innerHTML = `⛔ ${count} Sync-Eintrag${count !== 1 ? 'e' : ''} in Quarantäne — Daten wurden nicht hochgeladen!
    <button onclick="window.openDebugPanel?.()" style="background:rgba(255,255,255,.2);border:none;border-radius:4px;color:#fff;cursor:pointer;padding:2px 8px;margin-left:auto;font-size:.8rem">Details</button>
    <button onclick="document.getElementById('${QUARANTINE_BANNER_ID}')?.remove()" style="background:none;border:none;cursor:pointer;font-size:1rem;color:#fff">✕</button>`;
  document.body.prepend(el);
}

async function _checkQuarantine() {
  try {
    const { getPendingQueue } = await import('./storage.js');
    const queue = await getPendingQueue();
    const count = queue.filter(i => i.status === 'quarantined').length;
    if (count > 0) showQuarantineBanner(count);
  } catch {}
}

/**
 * Start periodic quarantine monitoring.
 * Runs an immediate check, then repeats every QUARANTINE_CHECK_MS.
 * Safe to call multiple times — only one timer runs at a time.
 */
export function startQuarantineMonitor() {
  if (_quarantineTimer !== null) return;
  _checkQuarantine();
  _quarantineTimer = setInterval(_checkQuarantine, QUARANTINE_CHECK_MS);
}

/**
 * Stop the quarantine monitor.
 */
export function stopQuarantineMonitor() {
  if (_quarantineTimer !== null) {
    clearInterval(_quarantineTimer);
    _quarantineTimer = null;
  }
}

// ── Tap-to-open trigger (5× tap on version string) ───────────────────────────

export function attachDebugTrigger(versionEl) {
  if (!versionEl) return;
  let taps = 0, timer = null;
  versionEl.addEventListener('click', () => {
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 1500);
    if (taps >= 5) {
      taps = 0;
      enableDebug();
      openDebugPanel();
    }
  });
}
