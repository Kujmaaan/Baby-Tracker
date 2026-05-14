// ─── tombstone.js — Soft Delete Engine ───────────────────────────────────────
// Replaces hard deletes with soft-delete + tombstone syncing.
//
// Why: On multi-device sync, hard deletes cause "resurrection" bugs —
// Device A deletes an entry while offline; Device B syncs the entry to Firebase;
// Device A reconnects and loses the delete silently.
//
// How:
//  - softDelete()  marks deletedAt/deletedBy, writes tombstone to IDB + Firebase
//  - Queries filter out deletedAt entries automatically (via getActiveEntries)
//  - Garbage collection (purge) removes tombstones older than TOMBSTONE_TTL_MS
//  - restoreDeleted() un-deletes (sets deletedAt = null)

import { openDB, STORES, getEntry, updateEntry, getAllEntries } from './storage.js';
import { fbWrite, fbDelete, fbReady } from './firebase.js';
import { uid } from './helpers.js';

// ── Config ────────────────────────────────────────────────────────────────────

/** Keep tombstones for 30 days before purging */
export const TOMBSTONE_TTL_MS = 30 * 24 * 3600_000;

const TOMBSTONE_STORE = 'tombstones'; // created in migration v3

// ── Soft Delete ───────────────────────────────────────────────────────────────

/**
 * Soft-delete an entry.
 * Sets deletedAt + deletedBy on the entry, writes tombstone to IDB,
 * and syncs the tombstone to Firebase.
 *
 * @param {string} storeName    — one of STORES.*
 * @param {string} id           — entry id
 * @param {string} fbBasePath   — Firebase path prefix e.g. "families/xyz/sleep"
 * @param {string} [deviceId]
 * @returns {Promise<void>}
 */
export async function softDelete(storeName, id, fbBasePath, deviceId = '') {
  const now = Date.now();

  // 1. Mark the entry as deleted in IDB
  try {
    await updateEntry(storeName, id, {
      deletedAt: now,
      deletedBy: deviceId,
    });
  } catch {
    // Entry might not exist locally (already hard-deleted elsewhere) — that's OK
  }

  // 2. Write tombstone to IDB tombstones store
  const tombstone = {
    id:        `${storeName}/${id}`,
    store:     storeName,
    entryId:   id,
    deletedAt: now,
    deletedBy: deviceId,
    synced:    false,
  };
  await writeTombstone(tombstone);

  // 3. Sync tombstone to Firebase
  await syncTombstoneToFirebase(tombstone, fbBasePath, id);
}

async function writeTombstone(tombstone) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(TOMBSTONE_STORE, 'readwrite');
    const store = tx.objectStore(TOMBSTONE_STORE);
    store.put(tombstone);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function syncTombstoneToFirebase(tombstone, fbBasePath, entryId) {
  if (!fbReady) return;
  try {
    // Mark the entry as deleted in Firebase (preserve tombstone metadata, don't just remove)
    await fbWrite(`${fbBasePath}/${entryId}`, {
      id:        entryId,
      deletedAt: tombstone.deletedAt,
      deletedBy: tombstone.deletedBy,
      _deleted:  true,
    });
    // Update tombstone sync status
    tombstone.synced = true;
    await writeTombstone(tombstone);
  } catch {
    // Will be retried by sync engine on next syncUp()
  }
}

// ── Query helpers (filter out soft-deleted entries) ───────────────────────────

/**
 * Filter out soft-deleted entries from a list.
 * Use this everywhere you display entries to the user.
 * @param {object[]} entries
 * @returns {object[]}
 */
export function filterDeleted(entries) {
  return entries.filter(e => !e.deletedAt);
}

/**
 * Get entries for a child, excluding soft-deleted ones.
 * Drop-in replacement for getEntriesByChild.
 */
export async function getActiveEntries(storeName, childId) {
  const { getEntriesByChild } = await import('./storage.js');
  const all = await getEntriesByChild(storeName, childId);
  return filterDeleted(all);
}

/**
 * Get entries within a time range, excluding soft-deleted ones.
 */
export async function getActiveEntriesRange(storeName, childId, from, to) {
  const { getEntriesByChildRange } = await import('./storage.js');
  const all = await getEntriesByChildRange(storeName, childId, from, to);
  return filterDeleted(all);
}

// ── Restore deleted entry ─────────────────────────────────────────────────────

/**
 * Un-delete a soft-deleted entry.
 * @param {string} storeName
 * @param {string} id
 * @param {string} fbBasePath
 * @returns {Promise<object>} restored entry
 */
export async function restoreDeleted(storeName, id, fbBasePath) {
  const entry = await getEntry(storeName, id);
  if (!entry) throw new Error(`Entry ${id} not found`);

  const restored = await updateEntry(storeName, id, { deletedAt: null, deletedBy: null });

  // Remove tombstone from IDB
  await deleteTombstone(`${storeName}/${id}`);

  // Re-sync the full entry to Firebase (overwrite the _deleted marker)
  if (fbReady) {
    try {
      await fbWrite(`${fbBasePath}/${id}`, restored);
    } catch {}
  }

  return restored;
}

async function deleteTombstone(tombstoneId) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(TOMBSTONE_STORE, 'readwrite');
    tx.objectStore(TOMBSTONE_STORE).delete(tombstoneId);
    tx.oncomplete = resolve;
    tx.onerror    = resolve; // swallow — not critical
  });
}

// ── Get recently deleted (for undo UI) ───────────────────────────────────────

/**
 * Get all soft-deleted entries from a store, sorted newest first.
 * Useful for "Recently deleted" UI or undo button.
 * @param {string} storeName
 * @param {string} childId
 * @param {number} [limitMs=24*3600_000] — only show entries deleted within this window
 * @returns {Promise<object[]>}
 */
export async function getRecentlyDeleted(storeName, childId, limitMs = 24 * 3600_000) {
  const { getEntriesByChild } = await import('./storage.js');
  const all  = await getEntriesByChild(storeName, childId);
  const cutoff = Date.now() - limitMs;
  return all
    .filter(e => e.deletedAt && e.deletedAt > cutoff && e.childId === childId)
    .sort((a, b) => b.deletedAt - a.deletedAt);
}

// ── Garbage Collection ────────────────────────────────────────────────────────

/**
 * Purge tombstones older than TOMBSTONE_TTL_MS.
 * Also physically deletes the IDB entry if it was soft-deleted and old enough.
 * Call this periodically (e.g. on app boot once per day).
 * @returns {Promise<number>} number of entries purged
 */
export async function purgeTombstones() {
  const db     = await openDB();
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;

  const tombstones = await new Promise((resolve, reject) => {
    const tx  = db.transaction(TOMBSTONE_STORE, 'readonly');
    const idx = tx.objectStore(TOMBSTONE_STORE).index('byDeletedAt');
    const range = IDBKeyRange.upperBound(cutoff);
    const req = idx.getAll(range);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });

  let purged = 0;
  for (const tomb of tombstones) {
    try {
      // Hard-delete from the original store
      const entryStore = tomb.store;
      if (Object.values(STORES).includes(entryStore)) {
        const entryTx = db.transaction(entryStore, 'readwrite');
        entryTx.objectStore(entryStore).delete(tomb.entryId);
      }
      // Remove tombstone record
      const tsTx = db.transaction(TOMBSTONE_STORE, 'readwrite');
      tsTx.objectStore(TOMBSTONE_STORE).delete(tomb.id);
      purged++;
    } catch {}
  }

  if (purged > 0) console.info(`[Tombstone] Purged ${purged} old entries`);
  return purged;
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

/**
 * Get tombstone stats for the debug panel.
 * @returns {Promise<{total: number, synced: number, pending: number, stores: object}>}
 */
export async function getTombstoneStats() {
  const db  = await openDB();
  const all = await new Promise((resolve) => {
    const tx  = db.transaction(TOMBSTONE_STORE, 'readonly');
    const req = tx.objectStore(TOMBSTONE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => resolve([]);
  });

  const stores = {};
  for (const t of all) {
    stores[t.store] = (stores[t.store] || 0) + 1;
  }

  return {
    total:   all.length,
    synced:  all.filter(t => t.synced).length,
    pending: all.filter(t => !t.synced).length,
    stores,
  };
}
