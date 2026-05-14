# Backup & Restore

## Export

Settings → Datensicherung → Exportieren

Produces `baby-tracker-backup-YYYY-MM-DD.json`:
```json
{
  "version": 1,
  "exportedAt": "2024-06-15T10:30:00.000Z",
  "stores": {
    "sleep":    [ ...entries ],
    "feeding":  [ ...entries ],
    "diaper":   [ ...entries ],
    "growth":   [ ...entries ],
    "health":   [ ...entries ],
    "milestones": [ ...entries ],
    "config":   [ ...configEntries ]
  }
}
```

## Import (Restore)

Settings → Datensicherung → Wiederherstellen

### Flow

1. **Auto-snapshot**: Before any import, `takeSnapshot()` saves the current DB state to `bt_pre_restore_snapshot` in localStorage (≤5 MB)
2. **Preview diff**: `previewRestore(backup)` computes per-store stats:
   - `newEntries`: in backup, not in current DB
   - `duplicates`: identical id + updatedAt
   - `conflicts`: same id, different data
   - Warnings for: large queue, old backup (>30 days), corrupted stores
3. **User chooses mode**:
   - **Merge**: keep newer entry by `updatedAt`; skip exact duplicates
   - **Overwrite**: clear store completely, then bulk-insert backup data (atomic IDB transaction)
4. **Progress**: `onProgress(pct, message)` callback updates UI
5. **Success**: snapshot cleared, success toast shown

### Rollback

If restore produces unexpected results:
- Settings → Datensicherung → Rückgängig
- Calls `rollbackToSnapshot()` which re-imports the pre-restore snapshot using overwrite mode
- Available until the next export/import cycle

### Size Limits

| Limit | Value |
|---|---|
| Max backup file size | 10 MB |
| Max snapshot in localStorage | ~5 MB (localStorage cap) |
| Warning: backup age | > 30 days |
| Warning: pending sync queue | > 0 items |

### Error Handling

- Overwrite uses a single IDB transaction — if any `put()` fails, the entire store reverts
- Individual store errors are caught and logged; other stores continue
- Final result includes `{ success, restored, skipped, conflicts, errors }`
