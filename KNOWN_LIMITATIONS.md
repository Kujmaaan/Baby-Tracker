# Known Limitations — Baby Tracker v3.1

## Storage

**IndexedDB quota** — browsers typically allow 50–80% of available disk space.
After years of daily use (~5 entries/day × 3 stores), expect ~5–10 MB.
No automatic pruning is implemented; use CSV export + manual cleanup if needed.

**iOS Safari storage eviction** — Safari may evict IndexedDB when the device is
low on storage. Mitigate: install as PWA (Add to Home Screen) — PWA storage is
treated as persistent and evicted last. Always keep a backup.

**localStorage limit** — ~5 MB per origin. Used for: sync queue metadata, app
settings, language preference, debug flags. Should never be an issue in practice.

## Sync

**No real-time multi-device sync** — changes sync on reconnect, not instantly.
Two devices editing simultaneously may overwrite each other (last-write-wins).

**Sync queue is device-local** — if you clear browser data, pending offline
writes are lost before they reach Firebase.

**Firebase free tier limits** — Spark plan: 1 GB storage, 10 GB/month download,
100 simultaneous connections. Sufficient for personal/family use.

**Anonymous auth tokens expire** — Firebase anonymous auth tokens are refreshed
automatically while the app is open. If a token expires offline (rare), the user
may need to re-open the app while online to re-authenticate.

## Service Worker

**Update delay** — new SW versions activate only after all tabs are closed or
the user taps "Aktualisieren" in the update banner. During this window, the old
SW serves cached assets.

**Cache poisoning** — if a corrupted response is cached, it persists until the
SW cache name is bumped. Use the Debug Panel → SW check to inspect.

**iOS 16.3 and earlier** — Push Notifications are not supported on iOS Safari
before 16.4. The app functions normally; reminders simply do not fire.

## Performance

**Growth chart with many data points** — the SVG growth chart renders all health
entries. Performance degrades noticeably above ~500 entries per child. No
virtualization is implemented.

**Verlauf (history) pagination** — limited to 7-day windows + 50-entry pages.
Older entries require manual date navigation.

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Notes |
|---------|--------|---------|--------|-------|
| Core app | ✅ | ✅ | ✅ | |
| Push Notifications | ✅ | ✅ | iOS 16.4+ | Not on older iOS |
| PWA install | ✅ | ❌ | ✅ | Firefox has no install prompt |
| `performance.memory` | ✅ | ❌ | ❌ | Debug panel shows N/A |
| `roundRect` canvas | ✅ | ✅ | 15.4+ | Falls back to rect |

## Security

**API key is public** — Firebase web API keys are client identifiers, not secrets.
Access is controlled by Firebase Security Rules. See ARCHITECTURE.md.

**No App Check by default** — Firebase App Check is implemented but requires
a reCAPTCHA v3 site key to activate. See `docs/APP_CHECK_SETUP.md`.

**CSP `unsafe-inline` for styles** — required for dynamic theme variables.
Script CSP is strict (SRI + sha256 hashes only).

## i18n

- Manifest description and PWA shortcuts are English-only (static file, no dynamic i18n)
- WHO growth chart axis labels are language-neutral (numeric only)
- Date formats always use local `dd.mm.yy` regardless of language
