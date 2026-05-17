# Baby Tracker PWA — Cross-Review Brief für GPT
> Bitte prüfe dieses Projekt kritisch und gib Feedback zu Risiken, Lücken und Verbesserungspotenzial.

---

## Projektübersicht

**Baby Tracker PWA** — eine Progressive Web App zur Erfassung von Babydaten (Schlaf, Mahlzeiten, Windeln, Gesundheit, Meilensteine, Wachstum).

- **Live:** https://kujmaaan.github.io/Baby-Tracker/
- **Repo:** https://github.com/Kujmaaan/Baby-Tracker
- **Stack:** Vanilla ES Modules · IndexedDB · Firebase RTDB · Service Worker · GitHub Pages
- **Kein Framework, kein Build-Step** — reines Vanilla JS

---

## Architektur (Kurzfassung)

```
index.html
  └── src/app.js          (1321 Zeilen — Hauptlogik, UI, Event-Handler)
  └── src/storage.js      (423 Zeilen — IndexedDB CRUD, bulkWrite, byChildTs-Index)
  └── src/sleep.js        (394 Zeilen — Schlaflogik, Validation, Midnight-Split)
  └── src/i18n.js         (665 Zeilen — DE/EN Keys, t(), applyI18n(), setLanguage())
  └── src/firebase.js     — Firebase Init, Auth, RTDB Sync
  └── src/recovery.js     (237 Zeilen — safeBoot, IDB-Repair, SW-Nuke)
  └── src/conflict.js     — CRDT Merge für Multi-Device-Sync
  └── src/tombstone.js    — Soft Delete
  └── src/debug.js        — Debug Panel (openDebugPanel())
  └── src/appcheck.js     — Firebase App Check (opt-in)
  └── src/perf.js         — Pagination, Memory-sichere Listener
  └── src/growth.js       — WHO-Wachstumskurven SVG
  └── src/notif.js        — Push Notifications
  └── src/security.js     — SRI, CSP-Helpers
  └── src/helpers.js      — Utility (ageExact, fmtDurLong, etc.)
  └── src/sleep.test.js   — Unit Tests (31/31 ✅)
  └── ... (weitere Module)
sw.js                     — Service Worker v30, 25 APP_SHELL Dateien
```

---

## Was wurde implementiert

### Core Features
- Schlaf-Tracking (Start/Stop, Mitternacht-Split, Überlappungserkennung)
- Mahlzeiten-Tracking (Brust L/R, Flasche, Beikost mit Mengenangaben)
- Windel-Tracking
- Gesundheitsdaten (Gewicht, Größe, Kopfumfang, Fieber, Arzttermine)
- Meilensteine
- Multi-Kind-Support
- WHO-Wachstumskurven mit Perzentilen

### Technisch
- **IndexedDB** mit `byChildTs` Compound-Index für effiziente Range-Queries
- **Kein Full-Table-Scan** — alle Hot-Paths nutzen `getEntriesByChildRange()`
- **Firebase RTDB** Anonymous Auth + Offline Sync Queue
- **Conflict Resolution** (CRDT Last-Write-Wins per Entry)
- **Tombstones** für Soft Delete (kein Datenverlust bei Sync)
- **Service Worker v30** mit Network-First + Offline-Fallback
- **safeBoot()** — fängt Boot-Fehler, trackt Failures, zeigt Recovery-Banner
- **i18n** — DE/EN vollständig, `data-i18n*` Attribute, Language-Switch ohne Reload
- **In-Memory Health Cache** (`_healthCache`) — invalidiert bei Writes
- **URL.createObjectURL** Blobs nach 60s revoked (Memory-Leak-Fix)
- **CSV Export** (DE/EN übersetzt) + **JSON Backup/Restore**
- **Debug Panel** mit IDB-Health, SW-Status, Boot-Fails, Quarantine, App-Check

### CI/CD
- GitHub Actions: Syntax-Check (alle .js) + Unit-Tests bei jedem Push
- GitHub Pages: Auto-Deploy bei Push auf main
- Playwright E2E konfiguriert (läuft bei grünem lint-and-test)

---

## Bekannte Schwachstellen (bereits dokumentiert)

1. **exportCSV()** lädt bei 10.000+ Einträgen alles in Memory → kein Streaming
2. **E2E Tests** laufen im CI nur mit Live-Server (separater Job, wird oft geskipped)
3. **App Check** RECAPTCHA_KEY ist leer → opt-in, kein Schutz in Production
4. **helpers.js** musste zirkulären Import (`i18n.js`) entfernen → nutzt `document.documentElement.lang` direkt
5. **Kein TypeScript** — kein statisches Typ-Checking

---

## Was ich von GPT brauche

Bitte prüfe kritisch:

1. **Sicherheit** — Gibt es XSS-Risiken? Ist die CSP vollständig? Sind die Firebase Rules sicher?
2. **Performance** — Gibt es noch Full-Table-Scans oder Memory-Leaks die ich übersehen habe?
3. **Datenintegrität** — Ist die Sync-Logik (CRDT + Tombstones) robust? Was passiert bei gleichzeitigen Writes von 2 Geräten?
4. **Service Worker** — Ist die Update-Logik korrekt? Was passiert wenn ein User die App im Hintergrund offen hat und ein neuer SW deployed wird?
5. **i18n** — Gibt es Kantenfälle bei Sprachumschaltung (z.B. offene Modals, aktive Timer)?
6. **Recovery** — Ist `safeBoot()` sicher genug? Was passiert wenn IndexedDB korrumpiert ist?
7. **Generelle Code-Qualität** — Was würdest du anders machen?

---

## Wichtige Code-Snippets zur Prüfung

### byChildTs Index (storage.js)
```js
// Erstellt beim DB-Upgrade:
store.createIndex('byChildTs', ['childId', 'timestamp']);

// Genutzt in getEntriesByChildRange():
const range = IDBKeyRange.bound([childId, from], [childId, to]);
return store.index('byChildTs').getAll(range);
```

### safeBoot (recovery.js)
```js
export async function safeBoot(bootFn) {
  const fails = parseInt(localStorage.getItem('bt-boot-fails') || '0');
  try {
    await bootFn();
    localStorage.removeItem('bt-boot-fails');
  } catch(e) {
    localStorage.setItem('bt-boot-fails', String(fails + 1));
    if (fails + 1 >= 3) showRecoveryBanner(fails + 1);
    throw e;
  }
}
```

### i18n cross-module (helpers.js)
```js
// KEIN import aus i18n.js (würde zirkuläre Dependency erzeugen)
// Stattdessen:
function fmtDurLong(ms) {
  const lang = (typeof document !== 'undefined' ? document.documentElement.lang : 'de');
  const h = lang === 'en' ? 'h' : 'Std';
  const m = lang === 'en' ? 'min' : 'Min';
  // ...
}
```

### Health Cache (app.js)
```js
let _healthCache = { childId: null, entries: null };

async function getHealthEntries() {
  const id = activeChildId();
  if (_healthCache.childId === id && _healthCache.entries) return _healthCache.entries;
  const entries = await getEntriesByChild(HEALTH, id);
  _healthCache = { childId: id, entries };
  return entries;
}

function invalidateHealthCache() { _healthCache = { childId: null, entries: null }; }
```

---

*Stand: 17. Mai 2026 — Commit 9e71f50 — CI #15 GRÜN ✅*
