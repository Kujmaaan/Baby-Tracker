# Baby Tracker — Database Migration Guide

## Schema Versions

| Version | Changes |
|---------|---------|
| v1 | Initial schema: config, sleep, feed, diaper, health, milestone, appointment, meal, tagesplan, sync_queue |
| v2 | Added `bySyncStatus` index on all entry stores |
| v3 | Added `tombstones` store for soft deletes |

## Adding a New Migration

1. Open `src/migrations.js`
2. Add a new key to the `MIGRATIONS` object (increment the version number)
3. Increment `CURRENT_DB_VERSION`
4. Update `src/storage.js` `DB_VER` is automatically read from `CURRENT_DB_VERSION`

Example:
```js
// In MIGRATIONS object:
4: (db, tx) => {
  console.info('[DB] Migration v4: add notes index to sleep store');
  if (!db.objectStoreNames.contains('sleep')) return;
  const store = tx.objectStore('sleep');
  if (!store.indexNames.contains('byNote')) {
    store.createIndex('byNote', 'note', { unique: false });
  }
},
```

## Safety Rules
- **Never** delete an existing migration — users may be on any old version
- **Always** check `db.objectStoreNames.contains()` before creating stores
- **Always** check `store.indexNames.contains()` before creating indexes
- Migrations run inside the `onupgradeneeded` transaction — if they throw, the upgrade is aborted
- Pre-migration backup is recommended for destructive changes (use `exportDB()`)

## Rollback Strategy
IndexedDB does not support downgrading versions natively.
Safe rollback process:
1. User exports backup (JSON)
2. Clear site data in browser
3. Restore from backup in fresh install
