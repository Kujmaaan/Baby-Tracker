// ─── conflict.js — Sync Conflict Resolution Engine ───────────────────────────
// Adds: operationId, syncRevision, stale-write detection, conflict logging,
//       conflict UI, merge strategy, safe retry, sync diagnostics.
//
// Conflict scenarios handled:
//  A) Remote-delete vs Local-edit: remote wins (respect tombstone)
//  B) Concurrent edits:           last-write-wins by updatedAt
//  C) Stale write (device offline too long): detected by revision gap > MAX_REVISION_GAP
//  D) Sync loop: detected by same operationId appearing twice in queue

import { openDB, STORES, getEntry, updateEntry, getPendingQueue, dequeueSync, cfgGet, cfgSet } from './storage.js';
import { uid } from './helpers.js';

// ── Config ────────────────────────────────────────────────────────────────────

/** How many revisions behind before we treat a write as "stale" */
const MAX_REVISION_GAP = 10;

/** Max conflict log entries kept in IDB (circular buffer) */
const MAX_CONFLICT_LOG = 100;

const CONFLICT_LOG_KEY  = 'bt_conflict_log';
const SYNC_REVISION_KEY = 'bt_sync_revision';

// ── operationId helpers ───────────────────────────────────────────────────────

/**
 * Generate a globally unique operationId for a write operation.
 * Format: {deviceId}:{timestamp}:{random}
 * @param {string} deviceId
 * @returns {string}
 */
export function newOperationId(deviceId = '') {
  return `${deviceId}:${Date.now()}:${uid().slice(0, 8)}`;
}

/**
 * Extract the timestamp from an operationId.
 * @param {string} opId
 * @returns {number}
 */
export function opIdTimestamp(opId = '') {
  const parts = opId.split(':');
  return parts.length >= 2 ? parseInt(parts[1], 10) || 0 : 0;
}

// ── Sync Revision ─────────────────────────────────────────────────────────────

/**
 * Get the current local sync revision (monotonic counter).
 * @returns {number}
 */
export function getSyncRevision() {
  return parseInt(localStorage.getItem(SYNC_REVISION_KEY) || '0', 10);
}

/**
 * Increment and return the new sync revision.
 * @returns {number}
 */
export function incrementSyncRevision() {
  const next = getSyncRevision() + 1;
  localStorage.setItem(SYNC_REVISION_KEY, String(next));
  // Async IDB backup — fire-and-forget so callers stay synchronous
  cfgSet(SYNC_REVISION_KEY, next).catch(() => {});
  return next;
}

/**
 * Initialise syncRevision from IDB on boot.
 * Recovers the correct value if localStorage was cleared.
 * Call once during app startup (before first syncUp).
 */
export async function initSyncRevision() {
  try {
    const idbRev = await cfgGet(SYNC_REVISION_KEY, 0);
    const lsRev  = parseInt(localStorage.getItem(SYNC_REVISION_KEY) || '0', 10);
    const max    = Math.max(idbRev || 0, lsRev);
    if (max !== lsRev) localStorage.setItem(SYNC_REVISION_KEY, String(max));
    if (max !== (idbRev || 0)) await cfgSet(SYNC_REVISION_KEY, max);
  } catch {}
}

/**
 * Detect if a local entry is "stale" relative to a remote entry.
 * @param {object} local    — local IDB entry
 * @param {object} remote   — remote Firebase entry
 * @returns {boolean}
 */
export function isStaleWrite(local, remote) {
  if (!local || !remote) return false;
  // Revision-based detection
  const localRev  = local.syncRevision  || 0;
  const remoteRev = remote.syncRevision || 0;
  if (remoteRev - localRev > MAX_REVISION_GAP) return true;
  // Timestamp-based fallback: remote is significantly newer
  const localTs  = local.updatedAt  || 0;
  const remoteTs = remote.updatedAt || 0;
  return remoteTs - localTs > 7 * 24 * 3600_000; // 7 days gap
}

// ── Conflict Resolution ───────────────────────────────────────────────────────

/**
 * @typedef {'local-wins'|'remote-wins'|'merge'|'stale-discarded'|'tombstone-wins'} ConflictResolution
 *
 * @typedef {object} ConflictResult
 * @property {ConflictResolution} resolution
 * @property {object} winner         — the entry that was kept
 * @property {string} reason
 */

/**
 * Resolve a conflict between a local pending write and a remote state.
 *
 * @param {object} localEntry   — local IDB entry
 * @param {object} remoteEntry  — remote Firebase entry (null if not found)
 * @param {object} queueItem    — the sync_queue item being processed
 * @returns {ConflictResult}
 */
export function resolveConflict(localEntry, remoteEntry, queueItem) {
  // Case 1: Remote has a tombstone (_deleted: true) — remote delete wins
  if (remoteEntry?._deleted) {
    return {
      resolution: 'tombstone-wins',
      winner:     remoteEntry,
      reason:     'Remote entry was deleted — local edit discarded',
    };
  }

  // Case 2: No remote entry — local write is safe (new entry)
  if (!remoteEntry) {
    return {
      resolution: 'local-wins',
      winner:     localEntry,
      reason:     'No remote entry — local write is authoritative',
    };
  }

  // Case 3: Stale write detection
  if (isStaleWrite(localEntry, remoteEntry)) {
    return {
      resolution: 'stale-discarded',
      winner:     remoteEntry,
      reason:     `Local write is stale (rev gap or >7 days older than remote)`,
    };
  }

  // Case 4: Last-write-wins by updatedAt
  const localTs  = localEntry?.updatedAt  || queueItem?.createdAt || 0;
  const remoteTs = remoteEntry?.updatedAt || 0;

  if (localTs >= remoteTs) {
    return {
      resolution: 'local-wins',
      winner:     localEntry,
      reason:     `Local is newer (local=${localTs}, remote=${remoteTs})`,
    };
  } else {
    return {
      resolution: 'remote-wins',
      winner:     remoteEntry,
      reason:     `Remote is newer (remote=${remoteTs}, local=${localTs})`,
    };
  }
}

// ── Conflict Log ──────────────────────────────────────────────────────────────

/**
 * Append an entry to the conflict log (circular buffer in localStorage).
 * @param {object} entry
 */
export function logConflict(entry) {
  try {
    const raw  = localStorage.getItem(CONFLICT_LOG_KEY);
    const log  = raw ? JSON.parse(raw) : [];
    log.unshift({ ...entry, loggedAt: Date.now() });
    if (log.length > MAX_CONFLICT_LOG) log.length = MAX_CONFLICT_LOG;
    localStorage.setItem(CONFLICT_LOG_KEY, JSON.stringify(log));
  } catch {}
}

/**
 * Get all conflict log entries.
 * @returns {object[]}
 */
export function getConflictLog() {
  try {
    const raw = localStorage.getItem(CONFLICT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * Clear the conflict log.
 */
export function clearConflictLog() {
  localStorage.removeItem(CONFLICT_LOG_KEY);
}

// ── Sync Diagnostics ──────────────────────────────────────────────────────────

/**
 * Get a comprehensive sync health report.
 * @returns {Promise<SyncDiagnostics>}
 *
 * @typedef {object} SyncDiagnostics
 * @property {number} pendingItems
 * @property {number} quarantinedItems
 * @property {number} syncRevision
 * @property {number} conflictsLogged
 * @property {number} oldestPendingMs    — age of oldest pending item in ms
 * @property {boolean} syncHealthy
 * @property {string[]} warnings
 */
export async function getSyncDiagnostics() {
  const queue  = await getPendingQueue();
  const warnings = [];

  const pending     = queue.filter(i => i.status === 'pending');
  const quarantined = queue.filter(i => i.status === 'quarantined');
  const conflicts   = getConflictLog();
  const revision    = getSyncRevision();

  let oldestPendingMs = 0;
  if (pending.length > 0) {
    const oldest = Math.min(...pending.map(i => i.createdAt || Date.now()));
    oldestPendingMs = Date.now() - oldest;
  }

  if (quarantined.length > 0)
    warnings.push(`${quarantined.length} quarantinierte Einträge — manuelles Eingreifen erforderlich`);
  if (oldestPendingMs > 24 * 3600_000)
    warnings.push(`Ältester Pending-Eintrag ist ${Math.round(oldestPendingMs / 3600_000)}h alt`);
  if (conflicts.filter(c => Date.now() - c.loggedAt < 3600_000).length > 5)
    warnings.push('Hohe Konfliktrate in der letzten Stunde');

  return {
    pendingItems:    pending.length,
    quarantinedItems: quarantined.length,
    syncRevision:    revision,
    conflictsLogged: conflicts.length,
    oldestPendingMs,
    syncHealthy:     quarantined.length === 0 && oldestPendingMs < 3600_000,
    warnings,
  };
}

// ── Sync Loop Detection ───────────────────────────────────────────────────────

const _recentOpIds = new Set();

/**
 * Check if an operationId has been seen recently (sync loop detection).
 * @param {string} opId
 * @returns {boolean}
 */
export function isSyncLoop(opId) {
  if (_recentOpIds.has(opId)) return true;
  _recentOpIds.add(opId);
  // Auto-clear after 60 seconds
  setTimeout(() => _recentOpIds.delete(opId), 60_000);
  return false;
}

// ── Conflict UI Notification ──────────────────────────────────────────────────

let _conflictBannerShown = false;

/**
 * Show a non-blocking conflict notification banner.
 * Called by the sync engine when conflicts are detected.
 * @param {number} count
 */
export function showConflictNotification(count) {
  if (_conflictBannerShown || count === 0) return;
  _conflictBannerShown = true;

  const el = document.createElement('div');
  el.id = 'conflict-notification';
  el.style.cssText = [
    'position:fixed','bottom:70px','left:50%','transform:translateX(-50%)',
    'background:#f59e0b','color:#1c1917','border-radius:8px',
    'padding:10px 16px','font-size:.82rem','font-weight:600',
    'z-index:9990','display:flex','align-items:center','gap:.5rem',
    'box-shadow:0 4px 12px rgba(0,0,0,.2)','max-width:340px',
  ].join(';');
  el.innerHTML = `⚠️ ${count} Sync-Konflikt${count !== 1 ? 'e' : ''} erkannt
    <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:1rem;margin-left:auto">✕</button>`;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 8000);
}
