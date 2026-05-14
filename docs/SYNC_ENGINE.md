# Sync Engine

The sync engine in `src/firebase.js` + `src/conflict.js` provides offline-first, multi-device sync with deterministic conflict resolution.

## Components

### Offline Queue (`syncQueue` IDB store)

Every write produces a queue item:
```js
{
  id:            uid(),           // unique item ID
  path:          'families/x/sleep/abc',
  data:          { ...entry },
  method:        'PUT' | 'DELETE',
  ts:            Date.now(),
  retries:       0,               // incremented on failure
  status:        'pending',       // 'pending' | 'quarantined'
  operationId:   'dev123:1717000000000:a1b2c3d4',
  syncRevision:  42,
}
```

Items are quarantined (not retried) after 5 consecutive failures.

### Exponential Backoff

```
retry 1: 2s
retry 2: 4s
retry 3: 8s
retry 4: 16s
retry 5: quarantine
```

### Conflict Resolution (`src/conflict.js`)

Resolution priority (highest wins):

1. **Tombstone-wins**: if either local or remote has `_deleted: true`, the delete wins
2. **Stale-write discard**: if `syncRevision` gap > 10 or `updatedAt` gap > 7 days, the write is discarded as stale
3. **Last-write-wins**: higher `updatedAt` timestamp wins

Every resolution is logged to a circular buffer (100 entries) in `bt_conflict_log`.

### Sync Revision

A monotonic counter (`bt_sync_revision` in localStorage) increments on every successful sync. Stamped on every Firebase write. Used to detect stale writes.

### Sync Loop Guard

`isSyncLoop(operationId)` uses a 60-second in-memory Set. If the same `operationId` is seen twice within 60 seconds, the write is skipped. This prevents infinite sync loops in multi-tab or multi-device scenarios.

## Soft Delete Protocol

When an entry is deleted:
1. `softDelete(storeName, id)` marks `deletedAt` + `deletedBy` on the entry in IDB
2. Writes `{ id, deletedAt, deletedBy, _deleted: true }` to Firebase (NOT a `remove()`)
3. Other devices receive the tombstone on sync and apply it locally
4. After 30 days, `purgeTombstones()` hard-deletes the entry from IDB and Firebase

This ensures deletions propagate even if a device was offline when the delete happened.

## Diagnostics

`getSyncDiagnostics()` (from `conflict.js`) returns:
```js
{
  pendingItems:     3,
  quarantinedItems: 0,
  syncRevision:     42,
  conflictsLogged:  1,
  oldestPendingMs:  45000,
  syncHealthy:      true,
  warnings:         []
}
```

Accessible via the Debug Panel (5-tap on version in Settings).
