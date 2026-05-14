# Baby Tracker — Testing Guide

## Automated Tests

Run the sleep logic test suite:
```bash
node --experimental-vm-modules src/sleep.test.js
```

The test cases cover:
- Normal sleep (22:00 → 06:00)
- DST spring forward (March, Europe)
- DST fall back (October, Europe)
- 23:59 → 00:01 midnight crossing
- Future start timestamp (must be invalid)
- Negative duration / end before start (must be invalid)
- Excessive duration > 24h (must be invalid)

## Manual QA Checklist

### Core Flows
- [ ] Start sleep → stop sleep → duration correct
- [ ] Fix sleep start: set yesterday 23:00 while it's 01:00 today → no "future" error
- [ ] Fix sleep start: set today 02:00 when it's 03:00 → accepted
- [ ] Add feeding + diaper → appear in today's log
- [ ] Child switcher: all data isolated per child

### Offline
- [ ] Open app → disable WiFi → add sleep entry → re-enable WiFi → entry synced to Firebase
- [ ] Reload page while offline → app fully usable
- [ ] Export CSV while offline → file downloads correctly

### Multi-Tab
- [ ] Open app in two tabs → start sleep in tab 1 → tab 2 shows updated state after refresh
- [ ] Upgrade DB: open old tab after update → tab-conflict banner appears

### Edge Cases
- [ ] Import a corrupt JSON → validation error shown, no data loss
- [ ] Import JSON > 50 MB → rejected with error
- [ ] Enter child name with HTML `<script>alert(1)</script>` → displayed as literal text
- [ ] CSV export: field starting with `=SUM()` → exported with `'=SUM()` prefix

### PWA
- [ ] Install prompt appears after first visit
- [ ] App works on iOS Safari (standalone mode)
- [ ] Safe area insets respected on iPhone notch
- [ ] Service Worker update banner appears after new deployment

### Accessibility
- [ ] Tab navigation works through all interactive elements
- [ ] Screen reader announces page changes
- [ ] Color contrast passes WCAG 2.1 AA

## Load Testing
To simulate 2 years of data (for performance check):
```js
// Paste in browser console on the app:
const { addEntry, STORES, openDB } = await import('./src/storage.js');
await openDB();
const childId = 'test-child-perf';
const now = Date.now();
const DAY = 86400000;
for (let i = 0; i < 730; i++) {
  const ts = now - (730 - i) * DAY;
  await addEntry(STORES.SLEEP, { childId, ts, end: ts + 8 * 3600000 });
  await addEntry(STORES.FEED,  { childId, ts: ts + 4 * 3600000, type: 'Brust' });
  await addEntry(STORES.FEED,  { childId, ts: ts + 8 * 3600000, type: 'Flasche', amount: 120 });
  await addEntry(STORES.DIAPER, { childId, ts: ts + 6 * 3600000, kind: 'Nass' });
}
console.log('2 years of test data added');
```
Then navigate through all pages and check for slowness.
