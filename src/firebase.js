// ─── firebase.js — Firebase RTDB integration + Sync Engine ───────────────────
// Wraps Firebase compat SDK (loaded via CDN in index.html).
// Exports: initFB, syncUp, syncDown, fbWrite, fbDelete, fbListen

import { enqueueSync, getPendingQueue, dequeueSync, failQueueItem } from './storage.js';
import { uid } from './helpers.js';

// ── Firebase Config (public — secured via RTDB Rules) ────────────────────────
const FB_CONFIG = {
  apiKey:            "AIzaSyCxxx_REPLACE_ME_xxx",
  authDomain:        "baby-tracker-app.firebaseapp.com",
  databaseURL:       "https://baby-tracker-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "baby-tracker-app",
  storageBucket:     "baby-tracker-app.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:0000000000000000",
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
    await enqueueSync('put', path, data);
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
  if (!fbReady || _syncing) return { synced: 0, failed: 0 };
  _syncing = true;
  let synced = 0, failed = 0;
  try {
    const queue = await getPendingQueue();
    for (const item of queue) {
      try {
        if (item.op === 'put') {
          await _db.ref(item.path).set(item.data);
        } else if (item.op === 'delete') {
          await _db.ref(item.path).remove();
        }
        await dequeueSync(item.qid);
        synced++;
      } catch (err) {
        console.warn('[FB] Sync item failed:', item.path, err);
        await failQueueItem(item.qid);
        failed++;
      }
    }
  } finally {
    _syncing = false;
  }
  if (synced > 0) console.info(`[FB] Synced ${synced} items, ${failed} failed.`);
  return { synced, failed };
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

// ── Firebase RTDB Security Rules (apply in Firebase Console) ─────────────────
// See: /data/firebase-rules.json
//
// {
//   "rules": {
//     "families": {
//       "$familyId": {
//         ".read":  "auth != null && root.child('members').child(auth.uid).val() == $familyId",
//         ".write": "auth != null && root.child('members').child(auth.uid).val() == $familyId",
//         "$store": {
//           "$entryId": {
//             ".validate": "newData.hasChildren(['id','childId','ts'])"
//           }
//         }
//       }
//     },
//     "members": {
//       "$uid": {
//         ".read":  "auth != null && auth.uid == $uid",
//         ".write": "auth != null && auth.uid == $uid"
//       }
//     }
//   }
// }
