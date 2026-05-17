# Privacy Policy — Baby Tracker

*Last updated: May 2026*

## Summary

Baby Tracker stores all data **locally on your device** by default.
Cloud sync is optional and requires explicit setup.

---

## What data is stored

| Data | Where | Who can see it |
|------|-------|----------------|
| Sleep entries | Your device (IndexedDB) | You only |
| Feeding entries | Your device (IndexedDB) | You only |
| Diaper entries | Your device (IndexedDB) | You only |
| Health (weight/height) | Your device (IndexedDB) | You only |
| Milestones | Your device (IndexedDB) | You only |
| Doctor appointments | Your device (IndexedDB) | You only |
| Child name + birthday | Your device (IndexedDB) | You only |
| App settings (theme, lang) | Your device (localStorage) | You only |

## Firebase Cloud Sync (optional)

If you use Firebase sync (configured in `src/config.js`):

- Data is stored in **Firebase Realtime Database** (Google, EU region: `europe-west1`)
- Authentication: **anonymous** — no email or password required
- Each device gets a random `DEVICE_ID` (UUID, stored in localStorage)
- Data is protected by Firebase Security Rules: only devices in the same family group can read/write
- Google's [Privacy Policy](https://policies.google.com/privacy) applies to Firebase services

## What we do NOT collect

- No analytics
- No crash reporting
- No advertising
- No third-party tracking
- No cookies (except Firebase anonymous auth token, stored in localStorage)

## Data deletion

- **Local**: clear your browser's site data (Settings → Privacy → Clear site data)
- **Firebase**: use the in-app Backup & Restore → delete your account entry in Firebase Console

## Third-party services

| Service | Purpose | Data sent |
|---------|---------|-----------|
| Firebase RTDB | Optional cloud sync | Your tracker data (encrypted in transit) |
| Google Fonts | UI fonts | IP address (font request) |

## Children's data

This app is designed to store data **about** infants, entered by their parents/guardians.
No data is shared with third parties. No data is used for profiling or advertising.

## Contact

This is an open-source personal project. Source code: https://github.com/Kujmaaan/Baby-Tracker
