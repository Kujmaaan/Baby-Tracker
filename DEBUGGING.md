# Baby Tracker — Debugging Guide

## Common Issues

### App doesn't load after update
1. Open DevTools → Application → Service Workers
2. Click "Unregister" on baby-tracker SW
3. Clear Site Data (Application → Storage → Clear site data)
4. Reload

### Firebase not syncing
1. Check browser console for `[FB]` prefixed logs
2. Verify `fbReady` is true: in console → `import('./src/firebase.js').then(m => console.log(m.fbReady))`
3. Check Firebase project status: https://console.firebase.google.com
4. Look for quarantined items: IndexedDB → baby-tracker-db → sync_queue → filter status='quarantined'

### Sleep entry shows "in the future"
The fix-start modal has Heute/Gestern buttons. If you're correcting a sleep from
yesterday (e.g. it's 02:00 and the sleep started at 23:00 the day before), select
**Gestern** before submitting the time.

### IndexedDB migration error
Open DevTools → Console → look for `[DB] Migration v` logs.
If a migration fails, data is not lost — the app continues with partial schema.
File a bug with the error message.

### CSV import shows "Backup ungültig"
The validator checks:
- File must be valid JSON
- `sleep`, `feed`, `diaper` etc. must be arrays
- Each entry must have `id`, `childId`, `ts`
- Timestamps must be numbers between 0 and 9999999999999

Export a fresh backup to see the expected format.

### "Tab conflict" banner
Another browser tab has a newer version of the app open.
Click "Neu laden" to reload this tab with the latest version.

## Debug Flags (browser console)
```js
// See all pending sync queue items
const { getPendingQueue } = await import('./src/storage.js');
console.table(await getPendingQueue());

// Check DB version
const { openDB } = await import('./src/storage.js');
const db = await openDB();
console.log('DB version:', db.version);

// Manually trigger sync
const { syncUp } = await import('./src/firebase.js');
console.log(await syncUp());
```

## Log Prefixes
- `[App]` — app.js boot and page rendering
- `[DB]`  — IndexedDB / migration events
- `[FB]`  — Firebase connection and sync
- `[SW]`  — Service Worker cache events
