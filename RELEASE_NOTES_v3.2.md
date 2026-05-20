# Baby Tracker v3.2 — Release Notes

**Datum:** 2026-05-20  
**Typ:** Release Candidate (Private Use)  
**Repo:** https://github.com/Kujmaaan/Baby-Tracker  
**Live:** https://kujmaaan.github.io/Baby-Tracker/  
**SW-Version:** baby-tracker-v34  
**Commits:** `aec5974` → `ec087ee` → `(sw-commit)`

---

## Was wurde geändert?

Diese Version enthält ausschließlich Bug-Fixes und Härtungsmaßnahmen.
Keine neuen Features, keine UI-Änderungen.

### Kritische Fixes (aus QA-Audit v3.1)

**Bug #2 — IDB Health Check (`src/recovery.js`)**  
`checkIndexedDB()` meldete die Datenbank als kaputt, obwohl sie gesund war.
Ursache: falscher `put()`-Aufruf im config-Store (out-of-line keys erfordern
`put(value, key)`, nicht `put({key, value})`). Folge: `safeBoot()` konnte
fälschlicherweise in den Recovery-Mode wechseln.

**Bug #3 — Queue Repair (`src/recovery.js`)**  
`repairQueue()` quarantierte alle gültigen Sync-Queue-Einträge, weil es auf
nicht existierende Felder prüfte (`id`, `storeName`, `payload` statt `qid`,
`op`, `path`). Live-Test: 4 gültige Items → alle quarantiert → Firebase
erhielt die Schreibvorgänge nie. Stiller Datenverlust bei jedem
`repairQueue()`-Aufruf.

**Bug #1 — syncUp() Timeout (`src/firebase.js`)**  
`_db.ref().once('value')` hatte keinen Timeout. Bei RTDB-Zugriffsverweigerung
(falsche familyId in `/members/`) hing der Promise indefinit. Behoben durch
`Promise.race()` mit 8-Sekunden-Limit.

### Design-Risiko-Fixes

**syncRevision IDB-primär (`src/conflict.js`)**  
`incrementSyncRevision()` ist jetzt `async` und schreibt IDB zuerst (awaited).
Früher war IDB ein fire-and-forget-Backup — bei Tab-Close vor Abschluss des
IDB-Writes war die Revision in IDB veraltet. Zusätzlich: `initSyncRevision()`
priorisiert IDB klar als Primärquelle beim Boot; localStorage wird bei
Privacy-Clear aus IDB wiederhergestellt.

**SW HTTP-Cache Bypass (`sw.js`)**  
App-Shell-Dateien (HTML, JS, CSS) werden jetzt mit `cache: 'no-cache'`
gefetcht. Vorher konnte der Browser HTTP-gecachte Versionen liefern, was
dazu führte, dass Fixes erst nach Ablauf des HTTP-Cache-TTL beim User ankamen.

**Stale-Write-Schwellwert (`src/conflict.js`)**  
7 Tage → 30 Tage. Eltern, die länger als 7 Tage offline waren (Urlaub,
Elternzeit), verloren vorher beim Reconnect still ihre Offline-Einträge.

---

## Testergebnisse

| Test | Ergebnis |
|------|----------|
| Unit Tests (Node.js) | ✅ 49/49 passed |
| syncRevision Spec-Tests | ✅ 11/11 passed |
| Syntaxcheck (21 JS-Dateien) | ✅ alle OK |
| Live-App erreichbar | ✅ HTTP 200 |

---

## Produktionsreife-Bewertung

| Kategorie | Bewertung | Notizen |
|-----------|-----------|---------|
| Offline-First | ✅ 10/10 | IDB + SW-Cache lückenlos; alle Tests bestanden |
| Datenintegrität | ✅ 9/10 | CRDT LWW + Tombstones + repairQueue jetzt korrekt |
| Firebase Sync | ✅ 9/10 | Timeout-Guard + IDB-primäre Revision + Retry/Backoff |
| SW Lifecycle | ✅ 9/10 | HTTP-Cache-Bypass; saubere Aktivierung ohne Version-Mix |
| Recovery | ✅ 8/10 | safeBoot + Health-Check + repairQueue — alle Bugs behoben |
| Performance | ✅ 10/10 | renderHome <10ms, Heap stabil, keine Memory Leaks |
| Security | ✅ 8/10 | Anon Auth + Firebase Rules + App Check stub |
| i18n | ✅ 9/10 | DE/EN vollständig; 200+ Keys |

**Gesamtbewertung: 9/10**

---

## Verbleibende Restrisiken

| Risiko | Schwere | Notizen |
|--------|---------|---------|
| SW-Message-Listener dupliziert | 🟢 Minimal | Zwei `DOMContentLoaded`-Handler — harmlos, kein Fix nötig |
| `syncRevision` bleibt 0 bei Double-Clear (IDB + LS) | 🟢 Minimal | Unvermeidbar ohne Remote-Quelle; Revision startet neu — kein Datenverlust |
| Child-Switch während async Render | 🟢 Minimal | 1-Frame stale data; kein funktionaler Bug |
| Kein App Check im Production-Mode | 🟡 Niedrig | Stub vorhanden; Aktivierung optional via Firebase Console |

---

## Empfehlung

| Nutzung | Empfehlung |
|---------|------------|
| **Private Nutzung** (Familie, bekannte Nutzer) | ✅ **GO** |
| **Öffentliche Nutzung** (App Store, unbekannte Nutzer) | ⚠️ **Conditional GO** — App Check aktivieren, E2E-Tests mit Playwright aufsetzen |

