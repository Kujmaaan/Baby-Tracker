# Security

## Firebase Security Rules

Location: `data/firebase-rules.json`

### Rule Design

All data is isolated under `families/{familyId}/` where `familyId` is derived from the anonymous Firebase UID. This means:

- Each device/family gets its own isolated namespace
- No cross-family data access is possible at the DB level
- Anonymous auth is mandatory — unauthenticated reads/writes are rejected

```json
{
  "rules": {
    "families": {
      "$familyId": {
        ".read":  "auth != null && auth.uid === $familyId",
        ".write": "auth != null && auth.uid === $familyId"
      }
    }
  }
}
```

### Deploying Rules

Firebase Console → Realtime Database → Rules → paste content → Publish

Or via CLI:
```bash
firebase deploy --only database
```

## Client-Side Sanitization

All user input passes through `src/security.js` before storage or rendering:

| Function | Purpose |
|---|---|
| `sanitize(str, maxLen)` | Strip HTML tags, truncate |
| `esc(str)` | HTML-escape for innerHTML insertion |
| `csvCell(str)` | RFC 4180 CSV escaping |
| `validateImport(data, maxBytes)` | Reject oversized / malformed backups |
| `clampStr(str, maxLen)` | Hard truncate without error |
| `safeFilename(str)` | Strip path traversal characters |
| `MAX_LENGTHS` | Per-field length caps (name:50, notes:500, etc.) |

## XSS Prevention

- All dynamic HTML uses `esc()` or `sanitize()` — no raw `innerHTML` with user data
- `textContent` preferred over `innerHTML` for simple strings
- No `eval()`, no `document.write()`
- CSP not yet implemented (planned for v3.1)

## Data at Rest

- All data stored in IndexedDB (browser-local, sandboxed per origin)
- Firebase data encrypted in transit (HTTPS/WSS)
- No PII sent to any third-party analytics service
- Family ID is the anonymous Firebase UID — not user-chosen, not guessable

## Threat Model

| Threat | Mitigation |
|---|---|
| Cross-family data access | Firebase rules: UID must equal familyId |
| XSS via user input | sanitize() + esc() on all dynamic content |
| Oversized backup import | validateImport() rejects > 10 MB |
| Path traversal in export filename | safeFilename() strips `../` etc. |
| Sync loop / infinite write | isSyncLoop() 60s operationId dedup |
| Stale write stomping newer data | resolveConflict() revision + timestamp check |
