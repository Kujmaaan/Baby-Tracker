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

/**
 * Validate a JSON backup object before importing.
 * @param {unknown} data
 * @param {number} fileSizeBytes
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateImport(data, fileSizeBytes = 0) {
  const errors = [];

  // Size check
  if (fileSizeBytes > MAX_IMPORT_SIZE_MB * 1024 * 1024) {
    errors.push(`Datei zu groß (max ${MAX_IMPORT_SIZE_MB} MB).`);
    return { ok: false, errors };
  }

  // Must be plain object
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Ungültiges Backup-Format — kein JSON-Objekt.');
    return { ok: false, errors };
  }

  // Version check
  if (data.version !== undefined && typeof data.version !== 'number') {
    errors.push('Ungültige Backup-Version.');
  }

  // Validate each store
  for (const [store, schema] of Object.entries(STORE_ENTRY_SCHEMA)) {
    if (!(store in data)) continue; // missing store is OK (partial restore)
    const entries = data[store];
    if (store === 'config') continue; // config is a key-value map, skip array checks

    if (!Array.isArray(entries)) {
      errors.push(`Store "${store}" ist kein Array.`);
      continue;
    }
    if (entries.length > MAX_ENTRIES_PER_STORE) {
      errors.push(`Store "${store}" hat zu viele Einträge (max ${MAX_ENTRIES_PER_STORE}).`);
      continue;
    }

    // Validate first 100 entries as a sample
    const sample = entries.slice(0, 100);
    for (const [i, entry] of sample.entries()) {
      if (!entry || typeof entry !== 'object') {
        errors.push(`${store}[${i}]: kein Objekt.`); continue;
      }
      for (const field of schema.required) {
        if (!(field in entry)) {
          errors.push(`${store}[${i}]: Pflichtfeld "${field}" fehlt.`); break;
        }
      }
      if (schema.ts && entry.ts !== undefined) {
        const ts = Number(entry.ts);
        if (isNaN(ts) || ts < 0 || ts > 9_999_999_999_999) {
          errors.push(`${store}[${i}]: Ungültiger Timestamp.`); 
        }
      }
      // id must be string
      if (entry.id !== undefined && typeof entry.id !== 'string') {
        errors.push(`${store}[${i}]: id muss ein String sein.`);
      }
      // childId must be string if present
      if (entry.childId !== undefined && typeof entry.childId !== 'string') {
        errors.push(`${store}[${i}]: childId muss ein String sein.`);
      }
    }
    if (errors.length > 10) {
      errors.push('...weitere Fehler unterdrückt. Backup scheint beschädigt.');
      break;
    }
  }

  return { ok: errors.length === 0, errors };
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
