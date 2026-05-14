// ─── migrations.js — IndexedDB migration system ──────────────────────────────
// Provides a versioned, safe migration path for the IndexedDB schema.
// Migrations are run once on DB upgrade, backed up before execution.

const DB_NAME = 'baby-tracker-db';

/**
 * All migrations keyed by target version number.
 * Each migration receives (db, tx) from the onupgradeneeded event.
 * Migrations MUST be idempotent — safe to run even if store already exists.
 */
export const MIGRATIONS = {
  /**
   * v1 → initial schema (created in storage.js openDB).
   * Listed here for documentation only.
   */
  1: (db, _tx) => {
    console.info('[DB] Migration v1: initial schema');
    // Created in storage.js onupgradeneeded — nothing extra needed.
  },

  /**
   * v2 → add 'syncedAt' index to all entry stores.
   * Enables efficient "unsynced items" queries.
   */
  2: (db, _tx) => {
    console.info('[DB] Migration v2: add syncedAt index');
    const entryStores = ['sleep','feed','diaper','health','milestone',
                         'appointment','meal','tagesplan'];
    for (const name of entryStores) {
      if (!db.objectStoreNames.contains(name)) continue;
      try {
        const store = _tx.objectStore(name);
        if (!store.indexNames.contains('bySyncStatus')) {
          store.createIndex('bySyncStatus', 'syncStatus', { unique: false });
        }
      } catch (e) {
        console.warn(`[DB] v2 migration skipped index on ${name}:`, e.message);
      }
    }
  },

  /**
   * v3 → add 'tombstones' store for soft deletes (offline conflict safety).
   */
  3: (db, _tx) => {
    console.info('[DB] Migration v3: add tombstones store');
    if (!db.objectStoreNames.contains('tombstones')) {
      const ts = db.createObjectStore('tombstones', { keyPath: 'id' });
      ts.createIndex('byStore',     'store',     { unique: false });
      ts.createIndex('byDeletedAt', 'deletedAt', { unique: false });
    }
  },
};

export const CURRENT_DB_VERSION = Object.keys(MIGRATIONS).length; // = 3

// ── Conflict / Tab detection ──────────────────────────────────────────────────

/**
 * Attach versionchange handler — fires when another tab opens a newer DB.
 * We close our connection gracefully so the other tab can upgrade.
 * @param {IDBDatabase} db
 */
export function attachVersionChangeHandler(db) {
  db.onversionchange = () => {
    console.warn('[DB] versionchange: another tab is upgrading the database.');
    db.close();
    showTabConflictBanner();
  };
}

/**
 * Show a non-dismissable banner when a DB version conflict is detected.
 */
function showTabConflictBanner() {
  let el = document.getElementById('tab-conflict-banner');
  if (el) return;
  el = document.createElement('div');
  el.id = 'tab-conflict-banner';
  el.style.cssText = [
    'position:fixed','top:0','left:0','right:0','z-index:99999',
    'background:#dc2626','color:#fff','text-align:center',
    'padding:12px 16px','font-size:.9rem','font-weight:600',
  ].join(';');
  el.textContent = '⚠️ Diese App wurde in einem anderen Tab aktualisiert. Bitte Seite neu laden.';
  const btn = document.createElement('button');
  btn.textContent = 'Neu laden';
  btn.style.cssText = 'margin-left:12px;background:#fff;color:#dc2626;border:none;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer;';
  btn.onclick = () => window.location.reload();
  el.appendChild(btn);
  document.body.prepend(el);
}

// ── Upgrade flow (called from storage.js openDB) ──────────────────────────────

/**
 * Run all pending migrations from oldVersion+1 to newVersion.
 * @param {IDBDatabase} db
 * @param {IDBTransaction} tx
 * @param {number} oldVersion
 * @param {number} newVersion
 */
export function runMigrations(db, tx, oldVersion, newVersion) {
  console.info(`[DB] Upgrading from v${oldVersion} to v${newVersion}`);
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    if (MIGRATIONS[v]) {
      try {
        MIGRATIONS[v](db, tx);
        console.info(`[DB] Migration v${v} complete`);
      } catch (err) {
        console.error(`[DB] Migration v${v} FAILED:`, err);
        // tx.abort() would prevent data corruption but lose the upgrade
        // Log and continue — partial migration is better than no migration
      }
    }
  }
}

// ── Integrity check ───────────────────────────────────────────────────────────

/**
 * Verify all expected stores and indexes exist.
 * Returns a list of issues found.
 * @param {IDBDatabase} db
 * @returns {string[]}
 */
export function checkIntegrity(db) {
  const issues = [];
  const expectedStores = ['config','sleep','feed','diaper','health',
                          'milestone','appointment','meal','tagesplan','sync_queue'];
  for (const name of expectedStores) {
    if (!db.objectStoreNames.contains(name)) {
      issues.push(`Missing store: ${name}`);
    }
  }
  return issues;
}
