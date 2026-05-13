// ─── storage.js — IndexedDB wrapper + Offline Sync Queue ─────────────────────
// Replaces localStorage for all app data. Falls back gracefully if IDB unavailable.
// Offline queue: stores pending writes; sync engine flushes on reconnect.

import { uid } from './helpers.js';

const DB_NAME  = 'baby-tracker-db';
const DB_VER   = 1;

// Object store names
const STORES = {
  CFG:        'config',       // key-value store for app config/settings
  SLEEP:      'sleep',        // sleep entries
  FEED:       'feed',         // feeding entries
  DIAPER:     'diaper',       // diaper entries
  HEALTH:     'health',       // health entries (weight, height, head circ)
  MILESTONE:  'milestone',    // milestone entries
  APPT:       'appointment',  // appointment entries
  MEAL:       'meal',         // detailed meal entries
  TAGESPLAN:  'tagesplan',    // daily plan entries
  QUEUE:      'sync_queue',   // offline write queue
};
export { STORES };

/** @type {IDBDatabase|null} */
let _db = null;

/**
 * Open (or upgrade) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Config: key-value
      if (!db.objectStoreNames.contains(STORES.CFG)) {
        db.createObjectStore(STORES.CFG); // out-of-line key
      }

      // Entry stores: all use auto-generated `id`, indexed by childId + ts
      const entryStores = [
        STORES.SLEEP, STORES.FEED, STORES.DIAPER,
        STORES.HEALTH, STORES.MILESTONE, STORES.APPT,
        STORES.MEAL, STORES.TAGESPLAN,
      ];
      for (const name of entryStores) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          store.createIndex('byChild', 'childId', { unique: false });
          store.createIndex('byChildTs', ['childId', 'ts'], { unique: false });
          store.createIndex('byTs', 'ts', { unique: false });
        }
      }

      // Sync queue
      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        const q = db.createObjectStore(STORES.QUEUE, { keyPath: 'qid' });
        q.createIndex('byStatus', 'status', { unique: false });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Low-level IDB helpers ─────────────────────────────────────────────────────

/** Execute a transaction returning a promise.
 * @param {string|string[]} storeNames
 * @param {'readonly'|'readwrite'} mode
 * @param {(tx: IDBTransaction) => IDBRequest|IDBRequest[]} fn
 */
async function idbTx(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    tx.onerror = () => reject(tx.error);
    const result = fn(tx);
    // If fn returns an IDBRequest, resolve with its result
    if (result && typeof result.onsuccess !== 'undefined') {
      result.onsuccess = () => resolve(result.result);
      result.onerror   = () => reject(result.error);
    } else {
      tx.oncomplete = () => resolve();
    }
  });
}

// ── Config store ──────────────────────────────────────────────────────────────

/**
 * Read config value by key.
 * @param {string} key
 * @param {*} fallback
 */
export async function cfgGet(key, fallback = null) {
  try {
    const val = await idbTx(STORES.CFG, 'readonly', tx =>
      tx.objectStore(STORES.CFG).get(key)
    );
    return val !== undefined ? val : fallback;
  } catch {
    // localStorage fallback
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
}

/**
 * Write config value.
 * @param {string} key
 * @param {*} value
 */
export async function cfgSet(key, value) {
  try {
    await idbTx(STORES.CFG, 'readwrite', tx =>
      tx.objectStore(STORES.CFG).put(value, key)
    );
  } catch {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
}

/**
 * Delete a config key.
 * @param {string} key
 */
export async function cfgDel(key) {
  try {
    await idbTx(STORES.CFG, 'readwrite', tx =>
      tx.objectStore(STORES.CFG).delete(key)
    );
  } catch {
    localStorage.removeItem(key);
  }
}

// ── Entry store CRUD ──────────────────────────────────────────────────────────

/**
 * Add a new entry. Assigns `id`, `createdAt`, `updatedAt`, `syncStatus`.
 * @param {string} storeName
 * @param {object} entry
 * @param {string} [deviceId]
 * @returns {Promise<object>} the saved entry with id
 */
export async function addEntry(storeName, entry, deviceId = '') {
  const now = Date.now();
  const doc = {
    ...entry,
    id:         entry.id || uid(),
    createdAt:  entry.createdAt  || now,
    updatedAt:  now,
    deviceId:   entry.deviceId   || deviceId,
    syncStatus: entry.syncStatus || 'pending',
  };
  await idbTx(storeName, 'readwrite', tx =>
    tx.objectStore(storeName).put(doc)
  );
  return doc;
}

/**
 * Update an existing entry (merges fields).
 * @param {string} storeName
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
export async function updateEntry(storeName, id, updates) {
  const existing = await getEntry(storeName, id);
  if (!existing) throw new Error(`Entry ${id} not found in ${storeName}`);
  const doc = { ...existing, ...updates, id, updatedAt: Date.now(), syncStatus: 'pending' };
  await idbTx(storeName, 'readwrite', tx =>
    tx.objectStore(storeName).put(doc)
  );
  return doc;
}

/**
 * Delete an entry by id.
 * @param {string} storeName
 * @param {string} id
 */
export async function deleteEntry(storeName, id) {
  await idbTx(storeName, 'readwrite', tx =>
    tx.objectStore(storeName).delete(id)
  );
}

/**
 * Get a single entry by id.
 * @param {string} storeName
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getEntry(storeName, id) {
  try {
    const val = await idbTx(storeName, 'readonly', tx =>
      tx.objectStore(storeName).get(id)
    );
    return val || null;
  } catch { return null; }
}

/**
 * Get all entries for a child, sorted by ts descending.
 * @param {string} storeName
 * @param {string} childId
 * @returns {Promise<object[]>}
 */
export async function getEntriesByChild(storeName, childId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const idx   = store.index('byChild');
    const req   = idx.getAll(childId);
    req.onsuccess = () => {
      const rows = (req.result || []).sort((a, b) => (b.ts || b.createdAt) - (a.ts || a.createdAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get entries for a child within a timestamp range [from, to].
 * @param {string} storeName
 * @param {string} childId
 * @param {number} from  — timestamp ms
 * @param {number} to    — timestamp ms
 * @returns {Promise<object[]>}
 */
export async function getEntriesByChildRange(storeName, childId, from, to) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const idx   = store.index('byChildTs');
    const range = IDBKeyRange.bound([childId, from], [childId, to]);
    const req   = idx.getAll(range);
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.ts - a.ts));
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Get ALL entries from a store (for export/backup).
 * @param {string} storeName
 * @returns {Promise<object[]>}
 */
export async function getAllEntries(storeName) {
  return idbTx(storeName, 'readonly', tx =>
    tx.objectStore(storeName).getAll()
  );
}

/**
 * Bulk-insert entries (e.g. CSV import / restore).
 * @param {string} storeName
 * @param {object[]} entries
 */
export async function bulkPut(storeName, entries) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const e of entries) store.put(e);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Clear all entries from a store.
 * @param {string} storeName
 */
export async function clearStore(storeName) {
  await idbTx(storeName, 'readwrite', tx =>
    tx.objectStore(storeName).clear()
  );
}

// ── Sync Queue ────────────────────────────────────────────────────────────────

/**
 * Enqueue a write operation for later Firebase sync.
 * @param {'put'|'delete'} op
 * @param {string} path  — Firebase RTDB path, e.g. "families/xyz/sleep/abc"
 * @param {object|null} data
 */
export async function enqueueSync(op, path, data = null) {
  const doc = {
    qid:       uid(),
    op,
    path,
    data,
    status:    'pending',
    createdAt: Date.now(),
    attempts:  0,
  };
  await idbTx(STORES.QUEUE, 'readwrite', tx =>
    tx.objectStore(STORES.QUEUE).add(doc)
  );
}

/**
 * Get all pending sync queue items.
 * @returns {Promise<object[]>}
 */
export async function getPendingQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORES.QUEUE, 'readonly');
    const store = tx.objectStore(STORES.QUEUE);
    const idx   = store.index('byStatus');
    const req   = idx.getAll('pending');
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Mark a queue item as synced (removes it).
 * @param {string} qid
 */
export async function dequeueSync(qid) {
  await idbTx(STORES.QUEUE, 'readwrite', tx =>
    tx.objectStore(STORES.QUEUE).delete(qid)
  );
}

/**
 * Mark a queue item as failed and increment attempts.
 * @param {string} qid
 */
export async function failQueueItem(qid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORES.QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.QUEUE);
    const req   = store.get(qid);
    req.onsuccess = () => {
      const item = req.result;
      if (!item) { resolve(); return; }
      item.attempts++;
      item.status = item.attempts >= 5 ? 'failed' : 'pending';
      store.put(item);
      tx.oncomplete = resolve;
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Backup / Restore ──────────────────────────────────────────────────────────

/**
 * Export the entire database to a plain JS object.
 * @returns {Promise<object>}
 */
export async function exportDB() {
  const allStores = Object.values(STORES).filter(s => s !== STORES.QUEUE);
  const out = { version: 1, exportedAt: Date.now() };
  for (const s of allStores) {
    out[s] = await getAllEntries(s);
  }
  return out;
}

/**
 * Import (overwrite) database from a previously exported object.
 * @param {object} backup
 */
export async function importDB(backup) {
  const allStores = Object.values(STORES).filter(s => s !== STORES.QUEUE);
  for (const s of allStores) {
    if (Array.isArray(backup[s])) {
      await clearStore(s);
      if (backup[s].length) await bulkPut(s, backup[s]);
    } else if (s === STORES.CFG && backup[s] && typeof backup[s] === 'object') {
      // Config might be a plain object { key: value }
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx    = db.transaction(STORES.CFG, 'readwrite');
        const store = tx.objectStore(STORES.CFG);
        store.clear();
        for (const [k, v] of Object.entries(backup[s])) store.put(v, k);
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
      });
    }
  }
}
