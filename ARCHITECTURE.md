# Architecture — Baby Tracker v3.1

## Overview

Baby Tracker is a **vanilla ES Module PWA** — no framework, no build step, no TypeScript.
All logic runs in the browser; Firebase RTDB provides optional cloud sync.

```
index.html          ← single HTML shell, all pages rendered via JS
src/
  app.js            ← main controller, page routing, event handlers (1 300 lines)
  storage.js        ← IndexedDB abstraction layer
  firebase.js       ← Firebase RTDB sync engine + offline queue
  conflict.js       ← conflict detection + resolution (LWW + operation log)
  tombstone.js      ← soft delete / sync tombstones
  sync.js           ← sync orchestration helpers
  helpers.js        ← pure utility functions (date math, formatting)
  security.js       ← input sanitisation, CSV injection prevention, SRI
  config.js         ← app config, family ID, active child management
  constants.js      ← PRESET_MILESTONES, shared constants
  growth.js         ← WHO growth chart SVG renderer
  sleep.js          ← sleep business logic (duration, guard, validate)
  notif.js          ← Push Notification scheduling
  perf.js           ← pagination, lazy chart loading, memory-safe listeners
  debug.js          ← debug panel, quarantine monitor, performance timings
  recovery.js       ← IDB health probe, queue repair, SW check, safe boot
  appcheck.js       ← Firebase App Check stub (opt-in)
  i18n.js           ← internationalisation (DE/EN, 200+ keys)
  migrations.js     ← IndexedDB schema migrations (versioned)
  restore.js        ← backup/restore logic
  ui-helpers.js     ← modal helpers, toast system
sw.js               ← Service Worker v30 (network-first + offline cache)
styles/main.css     ← all styles (CSS variables, dark/light mode)
data/
  firebase-rules.json ← Firebase Security Rules
```

## Data Flow

```
User Action
    │
    ▼
app.js handler
    │
    ├─ write → storage.js (IndexedDB)
    │               │
    │               └─ firebase.js (enqueueSync → write to RTDB when online)
    │
    └─ read  → storage.js (IndexedDB, always local-first)
                    │
                    └─ firebase.js (syncDown merges remote → local on reconnect)
```

## IndexedDB Schema (v7)

| Store       | Key    | Indexes              | Purpose                  |
|-------------|--------|----------------------|--------------------------|
| config      | key    | —                    | App settings, family ID  |
| sleep       | id     | byChild, byChildTs   | Sleep sessions           |
| feed        | id     | byChild, byChildTs   | Feeding entries          |
| diaper      | id     | byChild, byChildTs   | Diaper entries           |
| health      | id     | byChild, byChildTs   | Weight/height/head       |
| milestone   | id     | byChild, byChildTs   | Milestone completions    |
| appointment | id     | byChild, byChildTs   | Doctor appointments      |
| tagesplan   | id     | byChild, byChildTs   | Daily plan entries       |
| sync_queue  | id     | byStatus             | Offline write queue      |

All `byChildTs` indexes enable range queries — no full-table scans in hot paths.

## Sync Engine

1. **Write**: local IndexedDB first → enqueue to `sync_queue`
2. **Online**: drain queue → write to Firebase RTDB → dequeue
3. **Conflict**: last-write-wins by timestamp; operation log detects sync loops
4. **Offline**: queue survives app restarts (IndexedDB), replayed on reconnect
5. **Multi-device**: each device has a `DEVICE_ID`; tombstones prevent ghost resurrections

## Service Worker (sw.js)

- **Strategy**: network-first with cache fallback (22-file APP_SHELL)
- **Cache name**: `baby-tracker-v{N}` — bumped on every deploy
- **Font cache**: separate `baby-tracker-fonts` cache
- **Update flow**: SW posts `SKIP_WAITING` → page shows "Update available" banner

## Security

- **CSP**: strict `default-src 'self'`; Firebase/gstatic allowlisted; no inline scripts
- **SRI**: all CDN scripts pinned with `integrity` hashes
- **Firebase Rules**: all reads/writes require valid anonymous auth UID + family membership
- **Input sanitisation**: `security.js` — `escHtml()`, `csvCell()`, `clampStr()`, `validateImport()`
- **App Check**: opt-in reCAPTCHA v3 (see `src/appcheck.js`, `docs/APP_CHECK_SETUP.md`)

## i18n

- Module: `src/i18n.js` — `t(key, params?)`, `setLanguage()`, `applyI18n()`
- Languages: DE (default), EN
- DOM: `data-i18n`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-aria-label`
- Persistence: `localStorage['bt-lang']`
- Dynamic strings (toasts, empty states, CSV): `t()` calls in `app.js`
