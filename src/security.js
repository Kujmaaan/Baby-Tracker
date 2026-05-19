// ─── security.js — Security utilities for Baby Tracker ───────────────────────
// Centralises: sanitization, CSP reporting, JSON import validation,
// CSV injection prevention, input constraints.

// ── DOMPurify-free sanitizer (no dependencies) ────────────────────────────────

/**
 * Sanitize a string for safe HTML insertion.
 * Strips all tags, encodes entities.
 * @param {string} str
 * @returns {string}
 */
export function sanitize(str) {
  if (str === null || str === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML; // entity-encoded, no tags
}

/**
 * Escape HTML entities (faster, no DOM — for already-trusted static strings).
 * Use sanitize() for user input.
 * @param {string} str
 * @returns {string}
 */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── CSV Injection Prevention ──────────────────────────────────────────────────

/**
 * Escape a CSV cell value to prevent formula injection.
 * Prefixes cells starting with = + - @ with a single quote.
 * @param {*} val
 * @returns {string}
 */
export function csvCell(val) {
  const s = String(val ?? '');
  // CSV formula injection: prefix dangerous leading chars
  const dangerous = /^[=+\-@\t\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return `"${dangerous ? "'" + escaped : escaped}"`;
}

// ── JSON Import Validation ────────────────────────────────────────────────────

const MAX_IMPORT_SIZE_MB = 50;
const MAX_ENTRIES_PER_STORE = 100_000;

const STORE_ENTRY_SCHEMA = {
  sleep:       { required: ['id','childId','ts'], ts: true },
  feed:        { required: ['id','childId','ts'], ts: true },
  diaper:      { required: ['id','childId','ts'], ts: true },
  health:      { required: ['id','childId','ts','type','value'], ts: true },
  milestone:   { required: ['id','childId','ts','label'], ts: true },
  appointment: { required: ['id','childId','ts','title'], ts: true },
  meal:        { required: ['id','childId','ts'], ts: true },
  tagesplan:   { required: ['id','childId','ts','label'], ts: true },
  config:      { required: [], ts: false },
};

// Known top-level keys in a valid backup — anything else is an unknown key warning
const KNOWN_TOP_LEVEL_KEYS = new Set([
  'version', 'exportedAt', 'deviceId', 'familyId', 'appVersion',
  ...Object.keys(STORE_ENTRY_SCHEMA),
]);

/**
 * Validate a single store entry against its schema.
 * Returns a string describing the problem, or null if valid.
 * @param {unknown} entry
 * @param {number}  i         index in the store array
 * @param {string}  store     store name (for error messages)
 * @param {object}  schema    { required: string[], ts: boolean }
 * @returns {string|null}
 */
function validateStoreEntry(entry, i, store, schema) {
  if (!entry || typeof entry !== 'object') return `${store}[${i}]: kein Objekt`;
  for (const field of schema.required) {
    if (!(field in entry)) return `${store}[${i}]: Pflichtfeld "${field}" fehlt`;
  }
  if (schema.ts) {
    const ts = Number(entry.ts);
    if (isNaN(ts) || ts < 0 || ts > 9_999_999_999_999) {
      return `${store}[${i}]: Ungültiger Timestamp`;
    }
  }
  if (entry.id !== undefined && typeof entry.id !== 'string') {
    return `${store}[${i}]: id muss ein String sein`;
  }
  if (entry.childId !== undefined && typeof entry.childId !== 'string') {
    return `${store}[${i}]: childId muss ein String sein`;
  }
  return null;
}

/**
 * Validate a JSON backup object before importing.
 * Performs full validation of ALL entries (not just a sample).
 *
 * @param {unknown} data
 * @param {number}  fileSizeBytes
 * @returns {{
 *   ok:      boolean,
 *   errors:  string[],
 *   summary: {
 *     totalEntries: number,
 *     totalValid:   number,
 *     totalInvalid: number,
 *     warnings:     string[],
 *     perStore:     Array<{store:string, valid:number, invalid:number, skipped:number}>
 *   }
 * }}
 */
export function validateImport(data, fileSizeBytes = 0) {
  const errors   = [];
  const warnings = [];
  const perStore = [];
  let totalEntries = 0;
  let totalValid   = 0;
  let totalInvalid = 0;

  const fatal = (msg) => { errors.push(msg); };
  const makeSummary = () => ({
    totalEntries, totalValid, totalInvalid, warnings, perStore,
  });

  // ── Size check ──────────────────────────────────────────────────────────────
  if (fileSizeBytes > MAX_IMPORT_SIZE_MB * 1024 * 1024) {
    fatal(`Datei zu groß (max ${MAX_IMPORT_SIZE_MB} MB).`);
    return { ok: false, errors, summary: makeSummary() };
  }

  // ── Structural check ────────────────────────────────────────────────────────
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fatal('Ungültiges Backup-Format — kein JSON-Objekt.');
    return { ok: false, errors, summary: makeSummary() };
  }

  // ── Version check ───────────────────────────────────────────────────────────
  if (data.version !== undefined && typeof data.version !== 'number') {
    fatal('Ungültige Backup-Version.');
  }

  // ── Unknown top-level keys → warnings (not fatal) ───────────────────────────
  for (const key of Object.keys(data)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`Unbekannter Top-Level-Key ignoriert: "${key}"`);
    }
  }

  // ── Per-store validation ────────────────────────────────────────────────────
  for (const [store, schema] of Object.entries(STORE_ENTRY_SCHEMA)) {
    if (!(store in data)) continue; // partial restore OK

    const entries = data[store];

    if (store === 'config') continue; // key-value map, not array

    if (!Array.isArray(entries)) {
      fatal(`Store "${store}" ist kein Array.`);
      continue;
    }
    if (entries.length > MAX_ENTRIES_PER_STORE) {
      fatal(`Store "${store}" hat zu viele Einträge (${entries.length} > ${MAX_ENTRIES_PER_STORE}).`);
      perStore.push({ store, valid: 0, invalid: 0, skipped: entries.length });
      continue;
    }

    // Full validation of ALL entries
    let storeValid   = 0;
    let storeInvalid = 0;
    const ERROR_CAP  = 20; // keep error list readable

    for (let i = 0; i < entries.length; i++) {
      const problem = validateStoreEntry(entries[i], i, store, schema);
      if (problem === null) {
        storeValid++;
      } else {
        storeInvalid++;
        if (errors.length < ERROR_CAP) errors.push(problem);
        else if (errors.length === ERROR_CAP) {
          errors.push('...weitere Fehler unterdrückt (max 20 angezeigt).');
        }
      }
    }

    totalEntries += entries.length;
    totalValid   += storeValid;
    totalInvalid += storeInvalid;
    perStore.push({ store, valid: storeValid, invalid: storeInvalid, skipped: 0 });
  }

  // ── Overall invalid rate check ──────────────────────────────────────────────
  if (totalEntries > 0 && totalInvalid > 0) {
    const rate = totalInvalid / totalEntries;
    if (rate > 0.05) {
      // > 5% invalid entries → fatal: do not silently import corrupt data
      fatal(`Zu viele ungültige Einträge (${totalInvalid}/${totalEntries}, ${Math.round(rate * 100)}%). Backup möglicherweise beschädigt.`);
    } else {
      warnings.push(`${totalInvalid} von ${totalEntries} Einträgen ungültig — werden beim Import übersprungen.`);
    }
  }

  const ok = errors.length === 0;
  return { ok, errors, summary: makeSummary() };
}

// ── Input length constraints ──────────────────────────────────────────────────
export const MAX_LENGTHS = {
  childName:  50,
  apptTitle:  100,
  note:       500,
  tpLabel:    100,
  feedAmount: 4,    // digits
};

/**
 * Truncate a string to max length.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
export function clampStr(str, max) {
  return String(str ?? '').slice(0, max);
}

// ── URL/filename sanitization ─────────────────────────────────────────────────
/**
 * Sanitize a filename (remove path traversal, special chars).
 * @param {string} name
 * @returns {string}
 */
export function safeFilename(name) {
  return String(name ?? 'export')
    .replace(/[^a-zA-Z0-9\-_.äöüÄÖÜß]/g, '_')
    .slice(0, 64);
}
