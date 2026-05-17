# Baseline Report — Baby Tracker v3.1

*Generated: 2026-05-17 | Auditor: Principal Engineer review*

---

## Repository State

| Item | Value |
|------|-------|
| Branch | `main` |
| HEAD commit | `cd9b65a` feat(stabilization): Phases 2–6 |
| Local = Remote | ✅ In sync (GitHub) |
| Working tree | ✅ Clean (nothing uncommitted) |
| SW version | `baby-tracker-v30` |
| DB schema version | v7 |

---

## File Inventory

| Category | Count | Status |
|----------|-------|--------|
| JS source files (`src/*.js`) | 21 | ✅ All syntax OK |
| Files in SW APP_SHELL | 25 (24 + `./`) | ✅ All app files cached |
| `sleep.test.js` in APP_SHELL | — | ✅ Correct (test file excluded) |
| CSS files | 2 (main + themes) | ✅ Both in APP_SHELL |
| Doc files (*.md) | 11 | ✅ |
| Icons | icon-192.png, icon-512.png | ✅ |
| Firebase rules | data/firebase-rules.json | ✅ |
| CI config | .github/workflows/ci.yml | ✅ |

---

## Test Status

| Test | Result |
|------|--------|
| Unit tests (sleep logic) | ✅ 31/31 passed |
| Syntax check (all 21 JS files) | ✅ 21/21 OK |
| node --check sw.js | ✅ OK |
| node --check index.html | N/A (HTML) |

---

## Live Site

| Check | Status |
|-------|--------|
| GitHub Pages URL | https://kujmaaan.github.io/Baby-Tracker/ |
| Reachable | ✅ (HTTP 200) |
| Content matches codebase | ✅ (i18n, language switcher present) |
| SW update pending | None |

---

## Known Risks (carried from FINAL_AUDIT.md)

| Risk | Severity | Status |
|------|----------|--------|
| Duplicate SW message listener | Low | Documented, harmless |
| App Check not activated | Medium | Opt-in, setup guide available |
| Growth chart unvirtualised (>500 entries) | Low | Documented limit |
| First load requires network | Low | PWA standard limitation |
| iOS < 16.4 no Push Notifications | Low | Browser limitation |
| URL.createObjectURL (backup/CSV/debug) | ✅ Fixed | revokeObjectURL after 60 s |
| toggleSleep full-table scan | ✅ Fixed | 7-day range query |

---

## Architecture Integrity

| Component | Status |
|-----------|--------|
| ES Module import graph (no circular deps) | ✅ |
| helpers.js: no i18n import (uses `document.lang`) | ✅ |
| recovery.js wired into app.js boot | ✅ |
| appcheck.js wired into initFB() callback | ✅ |
| applyI18n() called at boot | ✅ |
| Health entry cache invalidated on write | ✅ |
| All hot-path queries use range indexes | ✅ |

---

## Open Items for This Audit Cycle

| Phase | Task |
|-------|------|
| 2 | Mass-data stress test (10 000+ entries) |
| 3 | Real-device QA checklist |
| 4 | Data safety final audit |
| 5 | SW & update hardening audit |
| 6 | Security final check |
| 7 | Product polish |
| 8 | Final release package |

---

## Recommendation

**GO ✅**

The codebase is in a clean, well-tested state. All syntax valid, tests green,
no uncommitted changes, live site matches code. Proceeding with Phases 2–8.
