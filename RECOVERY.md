# Recovery Guide — Baby Tracker

This guide covers how to recover from common failure scenarios.

---

## The app shows a blank/white screen

**Cause**: JavaScript module load failure (syntax error, missing file, CSP violation).

**Steps**:
1. Open browser DevTools → Console tab
2. Look for red errors mentioning `src/*.js`
3. Try **Shift+Reload** to bypass the Service Worker cache
4. If still broken, proceed to SW reset below

---

## Clicking buttons does nothing

**Cause**: A silent module import error prevented event handlers from registering.

**Steps**:
1. **Shift+Reload** (hard refresh, bypasses SW cache)
2. If still broken: DevTools → Application → Service Workers → **Unregister**
3. Reload the page

---

## "Update available" banner won't go away

**Cause**: Another tab is keeping the old Service Worker alive.

**Steps**:
1. Close all other Baby Tracker tabs
2. Tap "Aktualisieren" in the banner
3. Or: DevTools → Application → Service Workers → **Skip waiting** → Reload

---

## Service Worker reset (nuclear option)

Use when the SW is stuck serving stale/broken content.

**Via Debug Panel** (preferred):
1. Open Settings → tap version text 5× to open Debug Panel
2. Tap **⚙️ SW prüfen** → verify state
3. To force-clear: open DevTools → Application → Storage → **Clear site data**

**Manual** (browser):
```
DevTools → Application → Service Workers → Unregister
DevTools → Application → Cache Storage → delete all bt-* caches
Reload
```

---

## Data not syncing to Firebase

**Check**:
1. Are you online? (offline indicator in top bar)
2. Debug Panel → Sync Queue → how many pending items?
3. Debug Panel → **🔧 Queue reparieren** to remove corrupt entries

**If queue is stuck**:
- Backup first: Settings → Backup
- Debug Panel → Queue reparieren
- Reload the app

---

## IndexedDB appears corrupt

**Symptoms**: app loads but shows no data, or throws IDB errors in console.

**Steps**:
1. **Always backup first**: Settings → 📦 Backup → save the JSON file
2. Debug Panel → **🏥 IDB prüfen** → check result
3. If corrupt: DevTools → Application → IndexedDB → delete `baby-tracker` database
4. Reload → the app creates a fresh database
5. Restore: Settings → ♻️ Wiederherstellen → select your backup JSON

---

## Recovery banner appears on boot

The app tracks consecutive boot failures. After 3 failures, a red banner appears.

**Tap "Reparieren"** in the banner — this:
1. Repairs the sync queue
2. Clears the failure counter
3. Prompts a reload

If the banner reappears, follow the IndexedDB recovery steps above.

---

## Lost data (no backup)

If IndexedDB was cleared without a backup and Firebase sync was active:

1. Firebase RTDB may still have your data
2. Open the app → wait for sync to complete (Firebase → local)
3. If sync doesn't restore data: contact Firebase Console → Realtime Database → browse your data manually

**Prevention**: enable regular backups (Settings → 📦 Backup). Consider scheduling a weekly reminder.

---

## Debug Panel access

- **5× tap** on the version text in Settings
- URL param: `?debug=1`
- localStorage: `bt_debug_mode = '1'`
