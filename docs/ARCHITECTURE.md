# Architecture

## Module Dependency Graph

```
index.html
  └── src/app.js (ES Module entry)
        ├── src/config.js
        │     └── src/storage.js → src/migrations.js
        ├── src/storage.js
        ├── src/firebase.js
        │     ├── src/conflict.js
        │     └── src/storage.js
        ├── src/sleep.js
        │     └── src/helpers.js
        ├── src/security.js
        │     └── src/constants.js
        ├── src/perf.js
        │     └── src/storage.js
        ├── src/restore.js
        │     └── src/storage.js
        ├── src/tombstone.js
        │     ├── src/storage.js
        │     └── src/firebase.js
        ├── src/conflict.js
        │     └── src/storage.js
        └── src/debug.js
              ├── src/storage.js
              ├── src/conflict.js
              └── src/tombstone.js
```

## IndexedDB Schema (v3)

| Store | Key | Indexes | Purpose |
|---|---|---|---|
| `sleep` | `id` | `childId`, `ts`, `[childId,ts]` | Sleep sessions |
| `feeding` | `id` | `childId`, `ts`, `[childId,ts]` | Feeding events |
| `diaper` | `id` | `childId`, `ts`, `[childId,ts]` | Diaper events |
| `growth` | `id` | `childId`, `ts` | Weight/length measurements |
| `health` | `id` | `childId`, `ts` | Doctor visits, medications |
| `milestones` | `id` | `childId`, `ts` | Milestone events |
| `syncQueue` | `id` | `status`, `ts` | Offline-first sync queue |
| `tombstones` | `id` | `storeName`, `deletedAt` | Soft delete records |
| `config` | `key` | — | App configuration (children, settings) |

## Data Flow: Write Path

```
User action
  → app.js handler
  → addEntry(store, data)         [storage.js]
  → openDB() → IDBObjectStore.add()
  → fbWrite(path, data)           [firebase.js]
      if online:  immediate PUT to Firebase
      if offline: queue item in syncQueue store
                  → syncUp() on reconnect
                      → resolveConflict() if remote exists
                      → logConflict() if resolution needed
```

## Data Flow: Sync Queue

```
syncQueue entry {
  id, path, data, method,
  ts, retries, status,          // 'pending' | 'quarantined'
  operationId,                  // device:ts:rand (dedup)
  syncRevision                  // monotonic counter
}

syncUp() algorithm:
  1. Load all pending items (retries < 5)
  2. For each item:
     a. isSyncLoop guard (60-second operationId dedup)
     b. Read current remote value
     c. resolveConflict(local, remote, item)
        - tombstone-wins if either side deleted
        - stale-write discard if revision gap > 10 or age > 7d
        - last-write-wins on updatedAt otherwise
     d. Write winner to Firebase with operationId + syncRevision stamps
     e. Mark item complete or increment retries (quarantine at 5)
  3. showConflictNotification() if any conflicts resolved
```

## Service Worker Strategy

| Resource | Strategy |
|---|---|
| App shell (HTML/JS/CSS/manifest) | Network-first, fallback to cache |
| Google Fonts | Cache-first (immutable) |
| Firebase domains | Network-only (never cached) |
| Offline fallback | `/index.html` from cache |

Cache name: `baby-tracker-v21` (bump on every deploy that changes cached files).
