# Final Technical Audit — Baby Tracker v3.1

*Audit date: May 2026 | SW: v30 | DB schema: v7 | Tests: 31/31 ✓*

---

## Memory Leaks

| Item | Status | Notes |
|------|--------|-------|
| `URL.createObjectURL` (backup, CSV, debug export) | ✅ Fixed | `revokeObjectURL` called after 60 s |
| `setInterval` in `notif.js` | ✅ OK | Properly cleared via `stopFeedReminder()` / `stopSleepWarning()` |
| `setInterval` in `debug.js` | ✅ OK | Properly cleared via `stopQuarantineMonitor()` |
| DOM event listeners in modals | ✅ OK | `onclick` attributes in HTML — GC'd with element |
| Firebase RTDB listeners (`_listeners` map) | ✅ OK | Tracked + cleaned up via `fbUnlistenAll()` |
| Health entry cache (`_healthCache`) | ✅ OK | Invalidated on write; holds at most one child's entries |

## Event Listener Leaks

| Item | Status |
|------|--------|
| `online` / `offline` listeners on `window` | ✅ Added once at boot, never removed (intentional) |
| SW `updatefound` listener | ✅ Added per-registration (correct) |
| SW `message` listener on `navigator.serviceWorker` | ⚠️ Added twice (boot + second DOMContentLoaded). Harmless duplicate but worth cleaning up in future |
| `visibilitychange` listener | ✅ Added once |

**Minor**: the duplicate SW message listener (two `DOMContentLoaded` handlers) should be consolidated in a future cleanup. No functional impact.

## Race Conditions

| Scenario | Status | Mitigation |
|----------|--------|-----------|
| Double sleep start | ✅ Fixed | `activeSleepGuard()` checks for open session before writing |
| Sync while offline write pending | ✅ OK | Queue is drained sequentially with `_syncing` flag |
| Firebase auth race (write before auth ready) | ✅ OK | `enqueueSync()` stores writes; `syncUp()` only runs after `fbReady` |
| Child switch during async render | ⚠️ Low risk | `activeChild` checked at start of each render; mid-render switch may show stale data for one frame |

## Service Worker Cache Risks

| Risk | Status | Mitigation |
|------|--------|-----------|
| Stale assets after deploy | ✅ OK | Cache name bumped on every deploy (v29→v30) |
| Corrupted cached response | ⚠️ Low risk | No integrity check on cached files; use Debug Panel → SW check |
| Cache grows unboundedly | ✅ OK | Old caches deleted in SW `activate` event |
| `i18n.js` / `recovery.js` in APP_SHELL | ✅ OK | Added in v29/v30 |

## Offline Behaviour

| Scenario | Status |
|----------|--------|
| Write while offline | ✅ Queued → synced on reconnect |
| Read while offline | ✅ Served from IndexedDB (local-first) |
| App load while offline | ✅ SW serves APP_SHELL from cache |
| SW not yet installed (first load, offline) | ❌ App requires network on very first load |
| Queue replay order | ✅ FIFO by `createdAt` timestamp |

## Multi-Tab Behaviour

| Scenario | Status |
|----------|--------|
| Two tabs open, both write | ⚠️ Both write to local IDB independently; sync merges by LWW |
| One tab updates SW, other stays on old | ✅ Old tab keeps working; update banner shown |
| IndexedDB transactions across tabs | ✅ IDB handles concurrency natively |

## Long-Term IndexedDB Growth

| Store | Growth rate | Risk |
|-------|------------|------|
| sleep | ~2–3/day | Low — ~1 KB/entry |
| feed | ~5–8/day | Low |
| diaper | ~6–10/day | Low |
| health | ~1–2/week | None |
| milestone | ~20 total | None |
| appointment | ~1–2/month | None |
| tagesplan | ~3–5/day | Low |
| sync_queue | Transient | ✅ Drained on sync |
| tombstones | Bounded | ✅ Purged after 30 days |

**Estimate**: 3 years of use ≈ 15–25 MB. Well within browser quotas.
No automatic pruning needed for personal use.

## iOS Safari Specifics

| Item | Status |
|------|--------|
| Push Notifications | ❌ Requires iOS 16.4+; silent fail on older versions |
| PWA storage persistence | ✅ Add to Home Screen = persistent storage |
| Storage eviction | ⚠️ Safari may evict non-PWA data under storage pressure |
| `performance.memory` | ❌ Not available (debug panel shows N/A) |
| IDBKeyRange compound indexes | ✅ Supported since iOS 13 |

## Android Chrome Specifics

| Item | Status |
|------|--------|
| Push Notifications | ✅ Full support |
| PWA install | ✅ Full support |
| Background sync | ⚠️ Not implemented (native Background Sync API not used) |
| Storage quota | ✅ Generous (50%+ of free disk) |

## Security Audit

| Item | Status |
|------|--------|
| CSP | ✅ Strict; `script-src` uses SRI hashes |
| SRI on CDN scripts | ✅ All Firebase SDK scripts pinned |
| Input sanitisation | ✅ `escHtml()`, `csvCell()`, `clampStr()`, `validateImport()` |
| Firebase Security Rules | ✅ Auth + family membership required for all reads/writes |
| App Check | ⚠️ Implemented, not activated (requires reCAPTCHA site key) |
| API key exposure | ✅ Acceptable — Firebase web keys are client identifiers, not secrets |
| XSS via innerHTML | ✅ All dynamic content uses `esc()` / `escHtml()` before insertion |

## Technical Debt

| Item | Priority | Effort |
|------|----------|--------|
| Duplicate SW message listener | Low | 15 min |
| Growth chart virtualisation (>500 entries) | Low | 2–4 h |
| Background Sync API for reliable queue drain | Medium | 4–8 h |
| Unit tests for i18n, storage, conflict | Medium | 4–6 h |
| App Check activation | Low | 30 min (user action) |
| Date localisation (dd.mm.yy always DE style) | Low | 1 h |

## Stability Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| Core functionality | ✅ 5/5 | Sleep/feed/diaper tracking rock-solid |
| Offline reliability | ✅ 4/5 | Excellent; first-load requires network |
| Sync correctness | ✅ 4/5 | LWW correct; simultaneous edits may conflict |
| Performance | ✅ 4/5 | No full-table scans; growth chart unvirtualized |
| Recovery | ✅ 4/5 | Boot guard, queue repair, SW check all present |
| Security | ✅ 4/5 | App Check not yet activated |
| Browser compatibility | ✅ 4/5 | iOS <16.4 lacks push; otherwise excellent |

**Overall: Production-ready for personal/family use.**
