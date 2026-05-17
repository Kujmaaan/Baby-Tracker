# Baby Tracker v3.1

A production-quality offline-first PWA for tracking infant sleep, feeding, diapers, growth, milestones, and health — no app store required.

**Live**: https://kujmaaan.github.io/Baby-Tracker/
**Stack**: Vanilla ES Modules · IndexedDB · Firebase RTDB · Service Worker · No build step

---

## Features

- 🌙 **Sleep tracking** — start/stop, correction, duration display
- 🍼 **Feeding** — breast, bottle, solids + amount (ml)
- 🧷 **Diapers** — wet, dirty, both, dry
- 📊 **Statistics** — 7-day sleep bar chart, weekly summaries
- 📈 **Growth charts** — WHO percentile curves (weight, height, head circumference)
- 🏆 **Milestones** — preset developmental milestones with date tracking
- 🏥 **Health records** — weight/height/head measurements + doctor appointments
- 📝 **Tagesplan** — daily schedule entries
- 🔔 **Push Notifications** — feeding reminders, sleep-too-long warnings
- 📦 **Backup/Restore** — JSON export/import
- 📥 **CSV export** — all entries, language-aware column headers
- 🌍 **i18n** — German (default) + English, switchable in Settings
- 🎨 **Dark/Light mode**
- 👶 **Multi-child support**
- 📴 **Fully offline** — works without internet after first load

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a full technical overview.

```
Vanilla ES Modules → IndexedDB (local) → Firebase RTDB (optional cloud sync)
                  ↑ Service Worker (offline cache, background updates)
```

---

## Setup

### GitHub Pages (no server needed)

1. Fork this repository
2. Enable GitHub Pages (Settings → Pages → Deploy from `main`)
3. Visit `https://your-username.github.io/Baby-Tracker/`

### Firebase Sync (optional)

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Realtime Database (EU region recommended)
3. Enable Anonymous Authentication
4. Deploy Security Rules from `data/firebase-rules.json`
5. Update `FB_CONFIG` in `src/firebase.js` with your project credentials

### Firebase App Check (optional, recommended)

See [docs/APP_CHECK_SETUP.md](docs/APP_CHECK_SETUP.md).

---

## Offline Behaviour

- All data is stored locally in IndexedDB first
- Service Worker (v30) caches the entire app shell (24 files)
- Writes are queued when offline and synced automatically on reconnect
- The app works fully offline after the first load

---

## i18n

Language is switched via Settings → 🌍 Sprache.
Adding a new language: extend the `TRANSLATIONS` object in `src/i18n.js`.

---

## Backup & Restore

Settings → 📦 Backup exports a JSON file with all entries.
Settings → ♻️ Wiederherstellen imports a backup JSON.
CSV export includes all sleep/feed/diaper entries in the active language.

---

## Debug Panel

Access via 5× tap on the version text in Settings (or `?debug=1` URL param).

Panels: Queue Inspector · IDB Health · SW Errors · Boot Failures · Quarantine · Sync Diagnostics · Conflict Log · Performance Timings · Memory

---

## Recovery

See [RECOVERY.md](RECOVERY.md) for troubleshooting blank screens, stuck SWs, corrupt IDB, and lost sync.

---

## Privacy

All data stays on your device by default. Firebase sync is opt-in.
See [PRIVACY.md](PRIVACY.md) for full details.

---

## Known Limitations

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

---

## Testing

```bash
node --experimental-vm-modules src/sleep.test.js
# Results: 31/31 passed ✓
```

E2E tests: Playwright + GitHub Actions CI (`.github/workflows/`).

---

## License

MIT
