# IndexedDB Migrations

Managed in `src/migrations.js` via the `onupgradeneeded` IDB callback.

## Version History

### v1 (initial)
- Stores: `sleep`, `feeding`, `diaper`, `growth`, `health`, `milestones`, `config`
- Basic indexes: `childId`, `ts`

### v2
- Added compound index `[childId, ts]` on all event stores
- Added `syncQueue` store with indexes: `status`, `ts`

### v3 (current)
- Added `tombstones` store with indexes: `storeName`, `deletedAt`
- Enables soft-delete across devices

## Adding a New Migration

1. Increment `DB_VERSION` in `src/storage.js`
2. Add a `case N:` block in `migrations.js` `runMigrations()`:

```js
case 4:
  db.createObjectStore('newStore', { keyPath: 'id' });
  // falls through to next case
case 3:
  // already handled
  break;
```

**Rules:**
- Never modify or remove older `case` blocks — users may skip versions
- Always use `falls through` pattern so upgrades chain correctly
- Never call `store.clear()` in migrations — data loss
- Test by opening the app with a fresh IndexedDB (DevTools → Application → Storage → Clear)
