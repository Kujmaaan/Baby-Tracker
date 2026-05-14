// ─── restore.js — Safe Backup/Restore Engine ─────────────────────────────────
// Replaces the naive importDB() flow with:
//  1. Pre-restore auto-snapshot backup
//  2. Preview mode (show diff before committing)
//  3. Merge OR overwrite mode
//  4. Duplicate detection
//  5. Import summary report
//  6. Rollback support (re-import the auto-snapshot)
//  7. Transaction-safe (all-or-nothing per store)
//  8. Queue compatibility check (clears stale queue items post-import)

import { exportDB, importDB, getAllEntries, bulkPut, clearStore, openDB, STORES } from './storage.js';
import { validateImport } from './security.js';
import { uid } from './helpers.js';

// ── Snapshot store (kept in localStorage as JSON, not IDB) ───────────────────
const SNAPSHOT_KEY = 'bt_pre_restore_snapshot';
const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 3600_000; // keep for 7 days

/**
 * Take a full snapshot of the current DB and store in localStorage.
 * Called automatically before every restore.
 * @returns {Promise<string>} snapshot ID
 */
export async function takeSnapshot() {
  const data   = await exportDB();
  const snapId = uid();
  const snap   = { id: snapId, takenAt: Date.now(), data };
  let stored = false;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    stored = true;
  } catch {
    try {
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      stored = true;
    } catch {}
  }
  return { snapId, stored };
}

/**
 * Retrieve the most recent pre-restore snapshot.
 * @returns {{id:string, takenAt:number, data:object}|null}
 */
export function getSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY) || sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (Date.now() - snap.takenAt > MAX_SNAPSHOT_AGE_MS) return null;
    return snap;
  } catch { return null; }
}

/**
 * Delete the stored snapshot (after successful confirm or manual clear).
 */
export function clearSnapshot() {
  localStorage.removeItem(SNAPSHOT_KEY);
  sessionStorage.removeItem(SNAPSHOT_KEY);
}

// ── Preview / Diff ────────────────────────────────────────────────────────────

const ENTRY_STORES = [
  STORES.SLEEP, STORES.FEED, STORES.DIAPER, STORES.HEALTH,
  STORES.MILESTONE, STORES.APPT, STORES.MEAL, STORES.TAGESPLAN,
];

/**
 * Produce a preview diff of what a restore would change.
 * @param {object} backup  — parsed JSON backup
 * @returns {Promise<RestorePreview>}
 *
 * @typedef {object} RestorePreview
 * @property {number} newEntries     — entries not yet in DB
 * @property {number} duplicates     — entries already in DB (same id)
 * @property {number} conflicts      — entries in DB with same id but different updatedAt
 * @property {number} totalInBackup  — total entries across all stores
 * @property {number} totalInDB      — current DB total
 * @property {object[]} storeStats   — per-store breakdown
 * @property {string[]} warnings     — any issues detected
 */
export async function previewRestore(backup) {
  const warnings  = [];
  const storeStats = [];
  let newEntries = 0, duplicates = 0, conflicts = 0, totalInBackup = 0, totalInDB = 0;

  for (const store of ENTRY_STORES) {
    const current   = await getAllEntries(store);
    const currentMap = new Map(current.map(e => [e.id, e]));
    const incoming   = Array.isArray(backup[store]) ? backup[store] : [];
    totalInDB      += current.length;
    totalInBackup  += incoming.length;

    let storeNew = 0, storeDup = 0, storeConf = 0;
    for (const entry of incoming) {
      const existing = currentMap.get(entry.id);
      if (!existing) {
        storeNew++;
        newEntries++;
      } else if (existing.updatedAt === entry.updatedAt) {
        storeDup++;
        duplicates++;
      } else {
        storeConf++;
        conflicts++;
      }
    }
    storeStats.push({ store, inBackup: incoming.length, inDB: current.length, new: storeNew, duplicates: storeDup, conflicts: storeConf });
  }

  // Queue compatibility check
  try {
    const queueItems = await getAllEntries(STORES.QUEUE);
    if (queueItems.length > 0) {
      warnings.push(`⚠️ ${queueItems.length} ungesendete Offline-Einträge in der Queue — diese werden nach dem Restore gelöscht.`);
    }
  } catch {}

  // Backup age warning
  if (backup.exportedAt) {
    const ageDays = (Date.now() - backup.exportedAt) / 86_400_000;
    if (ageDays > 30) warnings.push(`⚠️ Backup ist ${Math.round(ageDays)} Tage alt.`);
  }

  return { newEntries, duplicates, conflicts, totalInBackup, totalInDB, storeStats, warnings };
}

// ── Safe Restore ──────────────────────────────────────────────────────────────

/**
 * @typedef {'overwrite'|'merge'} RestoreMode
 *
 * overwrite: clear each store, then bulk-insert from backup (default)
 * merge:     keep existing entries, only add new ones (by id), conflicts → keep newer by updatedAt
 */

/**
 * Perform a safe restore with pre-snapshot, transaction safety, and queue cleanup.
 *
 * @param {object} backup           — parsed JSON backup (already validated)
 * @param {RestoreMode} [mode='overwrite']
 * @param {Function} [onProgress]   — optional (step, total, label) callback
 * @returns {Promise<RestoreResult>}
 *
 * @typedef {object} RestoreResult
 * @property {boolean} success
 * @property {string}  snapId       — ID of pre-restore snapshot (for rollback)
 * @property {number}  restored     — entries written
 * @property {number}  skipped      — entries skipped (merge mode duplicates)
 * @property {number}  conflicts    — conflicts resolved (merge mode)
 * @property {string[]} errors
 */
export async function safeRestore(backup, mode = 'overwrite', onProgress = null) {
  const errors  = [];
  let restored  = 0, skipped = 0, conflicts = 0;

  // 1. Auto-snapshot before ANY changes
  const { snapId, stored: _snapStored } = await takeSnapshot();
  if (!_snapStored) {
    errors.push('Snapshot konnte nicht gespeichert werden (Speicher voll) — Rollback nach diesem Restore nicht möglich.');
  }

  const total = ENTRY_STORES.length + 2; // stores + queue + config
  let step    = 0;

  const progress = (label) => {
    step++;
    onProgress?.(step, total, label);
  };

  try {
    // 2. Process each entry store
    for (const store of ENTRY_STORES) {
      progress(`Importiere ${store}…`);
      const incoming = Array.isArray(backup[store]) ? backup[store] : [];

      if (mode === 'overwrite') {
        // Transaction-safe: clear + bulkPut in one logical step
        await safeOverwriteStore(store, incoming);
        restored += incoming.length;
      } else {
        // Merge: add new, skip exact duplicates, keep newer on conflict
        const result = await safeMergeStore(store, incoming);
        restored  += result.written;
        skipped   += result.skipped;
        conflicts += result.conflicts;
      }
    }

    // 3. Restore config (key-value store) — only in overwrite mode
    if (mode === 'overwrite' && backup[STORES.CFG]) {
      progress('Importiere Einstellungen…');
      await restoreConfig(backup[STORES.CFG]);
    }

    // 4. Clear sync queue (stale queue items can corrupt newly restored data)
    progress('Bereinige Sync-Queue…');
    await clearStore(STORES.QUEUE);

  } catch (err) {
    errors.push(`Restore-Fehler: ${err.message}`);
    // Attempt rollback
    try {
      const snap = getSnapshot();
      if (snap) await importDB(snap.data);
      errors.push('Rollback erfolgreich — ursprüngliche Daten wiederhergestellt.');
    } catch (rollbackErr) {
      errors.push(`Rollback fehlgeschlagen: ${rollbackErr.message}`);
    }
  }

  return { success: errors.length === 0, snapId, restored, skipped, conflicts, errors };
}

// ── Transaction-safe store operations ─────────────────────────────────────────

async function safeOverwriteStore(storeName, entries) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    for (const e of entries) store.put({ ...e, syncStatus: 'synced' });
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(new Error(`Store ${storeName}: ${tx.error?.message}`));
    tx.onabort    = () => reject(new Error(`Store ${storeName}: transaction aborted`));
  });
}

async function safeMergeStore(storeName, incoming) {
  const db      = await openDB();
  const current = await getAllEntries(storeName);
  const map     = new Map(current.map(e => [e.id, e]));
  let written = 0, skipped = 0, conflicts = 0;

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    for (const entry of incoming) {
      const existing = map.get(entry.id);
      if (!existing) {
        store.put({ ...entry, syncStatus: 'synced' });
        written++;
      } else if (existing.updatedAt === entry.updatedAt) {
        skipped++; // exact duplicate
      } else {
        // Conflict: keep the newer one
        const winner = (entry.updatedAt || 0) > (existing.updatedAt || 0) ? entry : existing;
        store.put({ ...winner, syncStatus: 'synced' });
        conflicts++;
        written++;
      }
    }

    tx.oncomplete = () => resolve({ written, skipped, conflicts });
    tx.onerror    = () => reject(new Error(`Merge ${storeName}: ${tx.error?.message}`));
  });
}

async function restoreConfig(cfgData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORES.CFG, 'readwrite');
    const store = tx.objectStore(STORES.CFG);
    store.clear();
    if (Array.isArray(cfgData)) {
      for (const item of cfgData) if (item?.key) store.put(item.value, item.key);
    } else if (cfgData && typeof cfgData === 'object') {
      for (const [k, v] of Object.entries(cfgData)) store.put(v, k);
    }
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

// ── Rollback ──────────────────────────────────────────────────────────────────

/**
 * Roll back to the most recent pre-restore snapshot.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function rollbackToSnapshot() {
  const snap = getSnapshot();
  if (!snap) return { success: false, message: 'Kein Snapshot vorhanden.' };
  try {
    await importDB(snap.data);
    clearSnapshot();
    return { success: true, message: `Rollback zu ${new Date(snap.takenAt).toLocaleString()} erfolgreich.` };
  } catch (err) {
    return { success: false, message: `Rollback fehlgeschlagen: ${err.message}` };
  }
}
