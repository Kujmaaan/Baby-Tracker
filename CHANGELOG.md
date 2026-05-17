# Changelog

All notable changes to Baby Tracker are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [3.1.0] — 2026-05-17 (Production Stabilization)

### Performance
- Eliminated all full-table IndexedDB scans in hot paths
- `toggleSleep` / `openFixStartModal`: 7-day range instead of all-time scan
- `updateGrowthView`: in-memory health entry cache (invalidated on write)
- `renderGesundheit`: Promise.all + range-limited appt query
- `toggleMilestone`: single DB read with optimistic UI update

### Reliability
- `src/recovery.js`: IndexedDB health probe, Queue repair, SW health check, safe boot wrapper
- `src/appcheck.js`: Firebase App Check stub (opt-in, graceful fallback)
- Boot failures tracked in localStorage; recovery banner after 3 failures
- Queue corruption quarantine with localStorage inspection

### Observability
- Debug panel: IDB health, SW errors, boot failures, quarantine, App Check status
- New debug actions: Queue repair, IDB check, SW check

### i18n
- `src/i18n.js`: 200+ keys, DE/EN, `t()` / `setLanguage()` / `applyI18n()`
- Language switcher in Settings (persists to localStorage)
- CSV export headers/values, age string, duration — all language-aware
- Remaining hardcoded strings replaced

### SW
- v30: recovery.js + appcheck.js added to APP_SHELL

---

## [3.0.0] — 2026-05-15 (Major Refactor)

### Added
- ES Module architecture (no bundler)
- IndexedDB with multi-store schema (sleep, feed, diaper, health, milestone, appt, tagesplan)
- Firebase RTDB sync with offline queue
- Conflict resolution (last-write-wins + operation log)
- Soft delete / tombstones
- Service Worker v1→v25 with offline-first caching
- Push Notifications (feeding reminders, wake warnings)
- Growth charts (WHO percentile curves, SVG)
- Milestones tracker
- Health records (weight, height, head circumference)
- Arzttermine (appointment reminders)
- Tagesplan (daily schedule)
- Backup / Restore (JSON export)
- CSV export / import
- Dark / Light mode
- Debug panel (5× tap on version)
- E2E tests (Playwright + GitHub Actions CI)
- PWA (installable, offline)

---

## [1.0.0] — Initial release
- Basic sleep, feeding, diaper tracking
- LocalStorage persistence
