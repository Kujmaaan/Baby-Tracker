// ─── firebase.js — Firebase RTDB integration + Sync Engine ───────────────────
// Wraps Firebase compat SDK (loaded via CDN in index.html).
// Exports: initFB, syncUp, syncDown, fbWrite, fbDelete, fbListen

import { enqueueSync, getPendingQueue, dequeueSync, failQueueItem } from './storage.js';
import { uid } from './helpers.js';
import { resolveConflict, logConflict, isSyncLoop, showConflictNotification,
         newOperationId, incrementSyncRevision } from './conflict.js';

// ── Firebase Config (public — secured via RTDB Rules) ────────────────────────
const FB_CONFIG = {
  apiKey:            "AIzaSyA0JAnuaFY4RPOZu7kg4oeeDZ6oQ8J0pIk",
  authDomain:        "baby-tracker-dd17c.firebaseapp.com",
  databaseURL:       "https://baby-tracker-dd17c-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "baby-tracker-dd17c",
  storageBucket:     "baby-tracker-dd17c.firebasestorage.app",
  messagingSenderId: "941022851310",
  appId:             "1:941022851310:web:f61c69cff2cc46f712c3ff",
};

/** @type {firebase.app.App|null} */
let _app  = null;
/** @type {firebase.database.Database|null} */
let _db   = null;
/** @type {firebase.auth.Auth|null} */
let _auth = null;

/** Whether Firebase is available (SDK loaded + initialised). */
export let fbReady = false;

/** Current Firebase user (anonymous). */
export let fbUser = null;

/** Active RTDB listeners keyed by path. */
const _listeners = new Map();

// ── Sync state ────────────────────────────────────────────────────────────────
let _syncing = false;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialise Firebase app + anonymous auth.
 * Safe to call multiple times — idempotent.
 * @param {object} [overrideConfig] — pass actual config at runtime
 * @returns {Promise<boolean>} true if Firebase is ready
 */
export async function initFB(overrideConfig = null) {
  if (fbReady) return true;
  try {
    if (typeof firebase === 'undefined') {
      console.warn('[FB] Firebase SDK not loaded — running offline.');
      return false;
    }
    const cfg = overrideConfig || FB_CONFIG;
    if (!firebase.apps.length) {
      _app = firebase.initializeApp(cfg);
    } else {
      _app = firebase.app();
    }
    _db   = firebase.database();
    _auth = firebase.auth();

    // Sign in anonymously so RTDB rules can filter by uid
    await _auth.signInAnonymously();
    _auth.onAuthStateChanged(user => { fbUser = user; });

    fbReady = true;
    console.info('[FB] Initialised. UID:', _auth.currentUser?.uid);
    return true;
  } catch (err) {
    console.error('[FB] Init failed:', err);
    return false;
  }
}

// ── Low-level RTDB helpers ────────────────────────────────────────────────────

/**
 * Write data to a Firebase path.
 * Queues for later if offline.
 * @param {string} path
 * @param {object} data
 * @param {boolean} merge — use update() instead of set()
 */
export async function fbWrite(path, data, merge = false) {
  if (!fbReady || !_db) {
    // Stamp operationId so sync engine can detect loops
    const stamped = data ? { ...data, operationId: data.operationId || newOperationId() } : data;
    await enqueueSync('put', path, stamped);
    return;
  }
  try {
    const ref = _db.ref(path);
    if (merge) {
      await ref.update(data);
    } else {
      await ref.set(data);
    }
  } catch (err) {
    console.warn('[FB] Write failed, queuing:', path, err);
    await enqueueSync('put', path, data);
  }
}

/**
 * Delete data at a Firebase path.
 * Queues for later if offline.
 * @param {string} path
 */
export async function fbDelete(path) {
  if (!fbReady || !_db) {
    await enqueueSync('delete', path, null);
    return;
  }
  try {
    await _db.ref(path).remove();
  } catch (err) {
    console.warn('[FB] Delete failed, queuing:', path, err);
    await enqueueSync('delete', path, null);
  }
}

/**
 * Read data once from Firebase path.
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function fbRead(path) {
  if (!fbReady || !_db) throw new Error('Firebase not ready');
  const snap = await _db.ref(path).once('value');
  return snap.val();
}

/**
 * Subscribe to realtime updates on a path.
 * Deduplicated — calling again with same path replaces the old listener.
 * @param {string} path
 * @param {(data: any) => void} callback
 */
export function fbListen(path, callback) {
  if (!fbReady || !_db) return;
  // Remove existing listener
  if (_listeners.has(path)) {
    _db.ref(path).off('value', _listeners.get(path));
  }
  const handler = snap => callback(snap.val());
  _db.ref(path).on('value', handler);
  _listeners.set(path, handler);
}

/**
 * Remove a realtime listener.
 * @param {string} path
 */
export function fbUnlisten(path) {
  if (!fbReady || !_db || !_listeners.has(path)) return;
  _db.ref(path).off('value', _listeners.get(path));
  _listeners.delete(path);
}

// ── Sync Engine ───────────────────────────────────────────────────────────────

/**
 * Flush the offline sync queue to Firebase.
 * Called on reconnect or manually.
 * @returns {Promise<{synced: number, failed: number}>}
 */
export async function syncUp() {
  if (!fbReady || _syncing) return { synced: 0, failed: 0, quarantined: 0, conflicts: 0 };
  _syncing = true;
  let synced = 0, failed = 0, quarantined = 0, conflicts = 0;
  const BACKOFF = [2000, 4000, 8000, 16000, 32000];
  const MAX_RETRY = 5;

  try {
    const queue = await getPendingQueue();
    if (!queue.length) return { synced: 0, failed: 0, quarantined: 0, conflicts: 0 };

    // Deduplicate: for same path keep only the latest write (by createdAt)
    const deduped = new Map();
    for (const item of queue) {
      const ex = deduped.get(item.path);
      if (!ex || item.createdAt > ex.createdAt) {
        if (ex) await dequeueSync(ex.qid); // discard older duplicate
        deduped.set(item.path, item);
      }
    }

    for (const item of deduped.values()) {
      // Sync loop guard
      if (item.operationId && isSyncLoop(item.operationId)) {
        console.warn('[FB] Sync loop detected, skipping:', item.path);
        await dequeueSync(item.qid);
        continue;
      }

      // Quarantine guard
      if ((item.attempts || 0) >= MAX_RETRY) { quarantined++; continue; }

      // Backoff guard
      if (item.lastFailedAt) {
        const delay = BACKOFF[Math.min((item.attempts || 1) - 1, BACKOFF.length - 1)];
        if (Date.now() - item.lastFailedAt < delay) { failed++; continue; }
      }

      try {
        if (item.op === 'put' && item.data) {
          // Conflict resolution: read remote before writing
          let remote = null;
          try {
            const snap = await _db.ref(item.path).once('value');
            remote = snap.val();
          } catch { /* offline — skip conflict check */ }

          if (remote !== null) {
            const result = resolveConflict(item.data, remote, item);
            if (result.resolution === 'remote-wins' || result.resolution === 'stale-discarded' || result.resolution === 'tombstone-wins') {
              // Discard our write — remote is authoritative
              logConflict({
                path:       item.path,
                resolution: result.resolution,
                reason:     result.reason,
                localTs:    item.data?.updatedAt,
                remoteTs:   remote?.updatedAt,
              });
              conflicts++;
              await dequeueSync(item.qid);
              console.warn('[FB] Conflict discarded local write:', item.path, result.reason);
              continue;
            } else if (result.resolution !== 'local-wins') {
              logConflict({ path: item.path, resolution: result.resolution, reason: result.reason });
              conflicts++;
            }
          }

          // Stamp syncRevision + operationId onto the data
          const payload = {
            ...item.data,
            syncRevision: incrementSyncRevision(),
            operationId:  item.operationId || newOperationId(),
          };
          await _db.ref(item.path).set(payload);

        } else if (item.op === 'delete') {
          await _db.ref(item.path).remove();
        }

        await dequeueSync(item.qid);
        synced++;

      } catch (err) {
        console.warn('[FB] Sync failed:', item.path, err?.message);
        await failQueueItem(item.qid);
        failed++;
      }
    }

    // Surface conflicts to user if significant
    if (conflicts > 0) showConflictNotification(conflicts);

  } finally {
    _syncing = false;
  }

  if (synced > 0 || quarantined > 0 || conflicts > 0)
    console.info(`[FB] Sync: ${synced} synced, ${failed} pending, ${quarantined} quarantined, ${conflicts} conflicts`);

  return { synced, failed, quarantined, conflicts };
}

/**
 * Download all data for a family from Firebase and return it.
 * @param {string} familyId
 * @returns {Promise<object|null>}
 */
export async function syncDown(familyId) {
  if (!fbReady || !_db) return null;
  try {
    const snap = await _db.ref(`families/${familyId}`).once('value');
    return snap.val();
  } catch (err) {
    console.error('[FB] syncDown failed:', err);
    return null;
  }
}

/**
 * Register this device's family membership in /members/{uid}/familyId.
 * Required by RTDB security rules: families/{familyId} is only accessible
 * when root.child('members').child(auth.uid).child('familyId') == familyId.
 * Called once after anonymous sign-in and familyId is resolved.
 * @param {string} familyId
 */
export async function fbRegisterMember(familyId) {
  if (!fbReady || !_db || !_auth?.currentUser) return;
  try {
    await _db.ref(`members/${_auth.currentUser.uid}`).set({ familyId });
  } catch (err) {
    console.warn('[FB] Member registration failed:', err);
  }
}

// ── Firebase RTDB Security Rules (apply in Firebase Console) ─────────────────
// See: /data/firebase-rules.json
//
// Access model: each anonymous user writes their familyId into /members/{uid}.
// RTDB rules verify root.child('members').child(auth.uid).child('familyId') == $familyId
// before allowing access to families/{familyId}/...
// fbRegisterMember() above performs this registration on every boot.
