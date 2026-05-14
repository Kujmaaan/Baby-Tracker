# Baby Tracker v3.0

A production-grade Progressive Web App for tracking infant sleep, feeding, diapers, growth, and health — built entirely in vanilla ES Modules with Firebase Realtime Database sync, full offline support, and multi-device conflict resolution.

**Live:** https://kujmaaan.github.io/Baby-Tracker/

---

## Features

| Area | What it does |
|---|---|
| **Sleep** | Start/stop, midnight-split, DST-safe, overlap detection, overlap guard |
| **Feeding** | Breast (L/R), bottle, solid — duration + amount logging |
| **Diapers** | Wet/dirty/both, notes |
| **Growth** | Weight + length, WHO percentile curve (SVG) |
| **Health** | Doctor appointments, medication reminders |
| **Milestones** | Preset + custom, date tracking |
| **Stats** | 7-day sleep bar chart, daily summaries, lazy-rendered charts |
| **Verlauf** | Paginated history (50/page), per-store filter |
| **Multi-child** | Unlimited children, instant switching, per-child data isolation |
| **Backup/Restore** | Export JSON, preview diff before import, merge or overwrite mode, auto-snapshot + rollback |
| **Sync** | Firebase Realtime DB, anonymous auth, family-ID isolation, offline queue with exponential backoff |
| **Conflict resolution** | last-write-wins, tombstone-wins, stale-write detection, sync loop guard |
| **Soft delete** | 30-day tombstone TTL, undo toast, cross-device resurrection via Firebase |
| **Debug panel** | Hidden (5-tap or `?debug=1`) — queue inspector, IDB diagnostics, conflict log, export |
| **PWA** | Installable, SW v21, offline-first, iOS safe areas, update banner |

---

## Architecture

```
src/
  constants.js    — DEVICE_ID, WHO_DATA, PRESET_MILESTONES, ICONS
  helpers.js      — Date math (DST-safe), formatting, uid()
  storage.js      — IndexedDB v3, 9 stores, versioned migrations
  firebase.js     — Anonymous auth, fbWrite/fbDelete, sync queue, conflict resolution
  sleep.js        — validateSleepEntry, crossesMidnight, splitSleepAcrossDays, activeSleepGuard
  config.js       — Children, settings, theme, familyId
  security.js     — sanitize, esc, csvCell, validateImport, MAX_LENGTHS
  migrations.js   — IDB schema upgrades (v1→v2→v3)
  perf.js         — getDailySummaries, batchRender, lazyRenderChart, addTrackedListener
  restore.js      — takeSnapshot, previewRestore, safeRestore, rollbackToSnapshot
  tombstone.js    — softDelete, getActiveEntries, purgeTombstones, restoreDeleted
  conflict.js     — resolveConflict, logConflict, getSyncDiagnostics, isSyncLoop
  debug.js        — openDebugPanel, attachDebugTrigger, collectAll, perfStart/perfEnd
  app.js          — UI controller, event wiring, page rendering (~1210 lines)
```

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for a full module dependency graph.

---

## Getting Started

### Run locally
```bash
npm install          # installs Playwright for E2E tests
npx serve . -p 5000  # serves at http://localhost:5000
```

### Run tests
```bash
npm test             # unit tests (Node) + E2E (Playwright, Chromium)
npm run test:unit    # sleep.test.js only
npm run test:e2e     # Playwright all browsers
npm run test:e2e:ui  # Playwright UI mode
```

### Deploy
Static site — push to `main` and GitHub Pages auto-deploys via Actions.

---

## Firebase Setup

1. Create a Firebase project with Realtime Database enabled
2. Copy your config into `src/firebase.js` (`firebaseConfig`)
3. Deploy Security Rules from `data/firebase-rules.json`:
   - Firebase Console → Realtime Database → Rules → paste → Publish
4. Enable Anonymous Authentication (Authentication → Sign-in method)

See [SECURITY.md](docs/SECURITY.md) for the full rule rationale.

---

## Debug Panel

Access via:
- **5-tap** on the version text in Settings
- **URL:** `?debug=1`
- **localStorage:** `bt_debug_mode = '1'`

Shows: IDB store sizes, sync queue, sync diagnostics, tombstones, conflict log, SW caches, performance timings, memory usage.

---

## Browser Support

Chrome 90+, Firefox 88+, Safari 14+ (iOS), Edge 90+.
Requires: ES2020, IndexedDB, Service Workers, CSS Custom Properties.
