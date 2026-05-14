# Testing

## Unit Tests

**File:** `src/sleep.test.js`  
**Runner:** Node.js (no framework)  
**Command:** `npm run test:unit`

### Test Groups (31 tests)

| Group | Tests |
|---|---|
| TEST_CASES from sleep.js | 7 scenarios × validity + crossesMidnight + duration |
| splitSleepAcrossDays | same-day, midnight-crossing, open entry, 3-day span |
| activeSleepGuard | no active sleep, active sleep, empty array |
| detectSleepOverlaps | no overlaps, 1 overlap, open entries ignored |
| validateSleepEntry edge cases | missing ts, min/max boundary conditions |

### Running

```bash
node src/sleep.test.js
# or
npm run test:unit
```

Expected output:
```
▶ TEST_CASES (from sleep.js)
▶ splitSleepAcrossDays
▶ activeSleepGuard
▶ detectSleepOverlaps
▶ validateSleepEntry edge cases

──────────────────────────────────────────────────
Results: 31/31 passed ✓
All tests passed ✓
```

---

## E2E Tests (Playwright)

**Directory:** `tests/e2e/`  
**Config:** `playwright.config.js`  
**Command:** `npm run test:e2e`

### Browsers

| Project | Device |
|---|---|
| chromium | Desktop Chrome |
| firefox | Desktop Firefox |
| mobile-chrome | Pixel 5 (375×667) |
| mobile-safari | iPhone 13 (390×844) |

### Test Suites

| File | Tests | Coverage |
|---|---|---|
| `01-onboarding.spec.js` | T01–T04 | App load, UI render, child creation, theme toggle |
| `02-sleep.spec.js` | T05–T08, T13–T14 | Sleep start/stop, double-sleep guard, correction modal, DST, midnight split |
| `03-offline.spec.js` | T09–T11, T15 | Offline load, entry queueing, flush on reconnect, quarantine |
| `04-backup.spec.js` | T08a–T08d | Export JSON, size validation, restore, corruption guard |
| `05-pwa.spec.js` | T10a, T11–T12 | SW registration, theme persistence, manifest, no mixed content |
| `06-multitab.spec.js` | T07a–T07b | Two tabs share IDB, versionchange banner |

### Helpers (`tests/e2e/helpers.js`)

```js
clearAppStorage(page)      // wipe IDB + localStorage
waitForBoot(page)          // wait for #app-ready
onboard(page, name)        // complete onboarding with child name
goTo(page, tab)            // click nav tab
goOffline(page)            // CDP Network.emulateNetworkConditions
goOnline(page)             // restore network
```

### CI (GitHub Actions)

File: `.github/workflows/e2e.yml`

- Triggered on push to `main`
- Runs Chromium only in CI (full matrix locally)
- Uploads `playwright-report/` as artifact
- Separate job for Node unit tests

### Running locally

```bash
npm install                        # install Playwright + browsers
npm run test:e2e                   # headless, all browsers
npm run test:e2e:headed            # headed (visible browser)
npm run test:e2e:ui                # Playwright UI mode (interactive)
npx playwright show-report         # view last HTML report
```
