// ─── recovery.js — IndexedDB Recovery, Queue Repair, SW Health, Safe Boot ────
//
// Self-healing system: detects and recovers from common failure modes.
// Used during boot and on demand from the debug panel.

import { openDB, STORES, getPendingQueue, dequeueSync } from './storage.js';

// ── IndexedDB Health ──────────────────────────────────────────────────────────

const IDB_HEALTH_KEY = 'bt-idb-health';

/**
 * Quick smoke-test: open DB, write a probe key, read it back, delete it.
 * Returns { ok, error }.
 */
export async function checkIndexedDB() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction('config', 'readwrite');
      const st  = tx.objectStore('config');
      const key = '__health_probe__';
      st.put({ key, value: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
    // Read back
    await new Promise((resolve, reject) => {
      const tx  = db.transaction('config', 'readwrite');
      const st  = tx.objectStore('config');
      const req = st.get('__health_probe__');
      req.onsuccess = () => {
        st.delete('__health_probe__');
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
    localStorage.setItem(IDB_HEALTH_KEY, JSON.stringify({ ok: true, ts: Date.now() }));
    return { ok: true, error: null };
  } catch (err) {
    localStorage.setItem(IDB_HEALTH_KEY, JSON.stringify({ ok: false, ts: Date.now(), error: err.message }));
    return { ok: false, error: err.message };
  }
}

/** Last known IDB health result from localStorage. */
export function getLastIDBHealth() {
  try { return JSON.parse(localStorage.getItem(IDB_HEALTH_KEY) || 'null'); }
  catch { return null; }
}

/**
 * Nuclear reset: delete the entire IndexedDB database.
 * User data will be lost if not backed up.
 * Returns { ok, error }.
 */
export async function resetIndexedDB(dbName = 'baby-tracker') {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve({ ok: true, error: null });
    req.onerror   = () => resolve({ ok: false, error: req.error?.message || 'unknown' });
    req.onblocked = () => {
      // Another tab has the DB open
      resolve({ ok: false, error: 'Database is open in another tab. Close all tabs and retry.' });
    };
  });
}

// ── Queue Repair ──────────────────────────────────────────────────────────────

const QUEUE_QUARANTINE_KEY = 'bt-queue-quarantine';

/**
 * Inspect the sync queue for invalid/corrupt entries.
 * Invalid = missing id, storeName, or payload; or age > 30 days.
 * Returns { healthy, invalid, quarantined }.
 */
export async function repairQueue() {
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const now = Date.now();

  let queue;
  try { queue = await getPendingQueue(); }
  catch (err) { return { healthy: 0, invalid: 0, quarantined: 0, error: err.message }; }

  const invalid = queue.filter(item =>
    !item.id || !item.storeName || !item.payload ||
    (item.ts && now - item.ts > MAX_AGE_MS)
  );

  if (invalid.length === 0) return { healthy: queue.length, invalid: 0, quarantined: 0 };

  // Quarantine: remove from queue, save to localStorage for inspection
  const quarantine = JSON.parse(localStorage.getItem(QUEUE_QUARANTINE_KEY) || '[]');
  for (const item of invalid) {
    quarantine.push({ ...item, quarantinedAt: now });
    try { await dequeueSync(item.id); } catch {}
  }
  localStorage.setItem(QUEUE_QUARANTINE_KEY, JSON.stringify(quarantine.slice(-50)));

  return { healthy: queue.length - invalid.length, invalid: invalid.length, quarantined: invalid.length };
}

/** Return quarantined items (for debug inspection). */
export function getQuarantinedItems() {
  try { return JSON.parse(localStorage.getItem(QUEUE_QUARANTINE_KEY) || '[]'); }
  catch { return []; }
}

/** Clear quarantine store. */
export function clearQuarantine() { localStorage.removeItem(QUEUE_QUARANTINE_KEY); }

// ── Service Worker Health ─────────────────────────────────────────────────────

const SW_ERROR_KEY = 'bt-sw-error';

/**
 * Check if a Service Worker is registered and active.
 * Returns { registered, active, version, error }.
 */
export async function checkSWHealth() {
  if (!('serviceWorker' in navigator)) {
    return { registered: false, active: false, version: null, error: 'SW not supported' };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration('./');
    if (!reg) return { registered: false, active: false, version: null, error: 'No SW registered' };
    const state = reg.active?.state || reg.installing?.state || reg.waiting?.state || 'unknown';
    return { registered: true, active: reg.active !== null, state, error: null };
  } catch (err) {
    return { registered: false, active: false, version: null, error: err.message };
  }
}

/**
 * Force-unregister all Service Workers and reload.
 * Use when SW is stuck or serving stale content.
 */
export async function nukeServiceWorker() {
  if (!('serviceWorker' in navigator)) return { ok: false, error: 'Not supported' };
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    // Clear all caches
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    return { ok: true, cleared: regs.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Record a SW error for later inspection. */
export function recordSWError(msg) {
  const errors = JSON.parse(localStorage.getItem(SW_ERROR_KEY) || '[]');
  errors.push({ msg, ts: Date.now() });
  localStorage.setItem(SW_ERROR_KEY, JSON.stringify(errors.slice(-20)));
}

/** Get recorded SW errors. */
export function getSWErrors() {
  try { return JSON.parse(localStorage.getItem(SW_ERROR_KEY) || '[]'); }
  catch { return []; }
}

// ── Safe Boot ─────────────────────────────────────────────────────────────────

const BOOT_FAIL_KEY = 'bt-boot-fails';
const MAX_BOOT_FAILS = 3;

/** Record a boot failure. Returns total consecutive failures. */
export function recordBootFailure(reason) {
  const fails = JSON.parse(localStorage.getItem(BOOT_FAIL_KEY) || '[]');
  fails.push({ reason, ts: Date.now() });
  localStorage.setItem(BOOT_FAIL_KEY, JSON.stringify(fails.slice(-MAX_BOOT_FAILS)));
  return fails.length;
}

/** Clear boot failure counter (call after successful boot). */
export function clearBootFailures() { localStorage.removeItem(BOOT_FAIL_KEY); }

/** Get consecutive boot failure count. */
export function getBootFailures() {
  try { return JSON.parse(localStorage.getItem(BOOT_FAIL_KEY) || '[]'); }
  catch { return []; }
}

/**
 * Show a recovery banner when the app detects repeated boot failures.
 * Non-blocking — does not prevent the app from continuing.
 */
export function showRecoveryBanner(failCount) {
  if (document.getElementById('recovery-banner')) return;
  const div = document.createElement('div');
  div.id = 'recovery-banner';
  div.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'background:#dc2626', 'color:#fff', 'padding:12px 16px',
    'font-size:.875rem', 'display:flex', 'align-items:center', 'gap:12px',
  ].join(';');
  div.innerHTML = `
    <span>⚠️ Die App hatte ${failCount}× Startprobleme.</span>
    <button id="recovery-repair-btn" style="background:rgba(255,255,255,.25);border:none;border-radius:6px;padding:4px 10px;color:#fff;cursor:pointer;font-size:.8rem">Reparieren</button>
    <button id="recovery-dismiss-btn" style="background:none;border:none;color:#fff;cursor:pointer;margin-left:auto;font-size:1.1rem">✕</button>
  `;
  document.body.prepend(div);

  document.getElementById('recovery-dismiss-btn').onclick = () => div.remove();
  document.getElementById('recovery-repair-btn').onclick  = async () => {
    div.innerHTML = '<span>⏳ Repariere…</span>';
    const { repairQueue: rq } = await import('./recovery.js');
    await rq();
    clearBootFailures();
    div.innerHTML = '<span>✅ Repariert — bitte Seite neu laden.</span><button onclick="location.reload()" style="background:rgba(255,255,255,.25);border:none;border-radius:6px;padding:4px 10px;color:#fff;cursor:pointer;margin-left:8px">Neu laden</button>';
  };
}

/**
 * Safe boot wrapper: run boot function, record failure on crash.
 * If too many consecutive failures, show recovery banner.
 */
export async function safeBoot(bootFn) {
  const fails = getBootFailures();
  if (fails.length >= MAX_BOOT_FAILS) {
    showRecoveryBanner(fails.length);
  }
  try {
    await bootFn();
    clearBootFailures();
  } catch (err) {
    console.error('[SafeBoot] Boot failed:', err);
    recordBootFailure(err.message);
    const newFails = getBootFailures();
    showRecoveryBanner(newFails.length);
    throw err;
  }
}
