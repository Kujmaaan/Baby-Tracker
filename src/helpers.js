// ─── helpers.js — Pure utility functions (no side-effects, no imports) ────────
// All date math is DST-safe: we never add 86_400_000 ms blindly.

/**
 * Zero-pad a number to 2 digits.
 * @param {number} n
 * @returns {string}
 */
export function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Format a duration in milliseconds → "Xh Ym" or "Ym" if < 1 h.
 * @param {number} ms
 * @returns {string}
 */
export function fmtDur(ms) {
  if (!ms || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Format a duration in milliseconds → "Xh Ym" with full labels.
 * @param {number} ms
 * @returns {string}
 */
export function fmtDurLong(ms) {
  if (!ms || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} Min`;
  return m === 0 ? `${h} Std` : `${h} Std ${m} Min`;
}

/**
 * Format a timestamp → "HH:MM".
 * @param {number|string} ts
 * @returns {string}
 */
export function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Format a timestamp → "DD.MM.YYYY".
 * @param {number|string} ts
 * @returns {string}
 */
export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Format a timestamp → "DD.MM.YY".
 * @param {number|string} ts
 * @returns {string}
 */
export function fmtDateShort(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}

/**
 * Format a timestamp → "DD.MM. HH:MM".
 * @param {number|string} ts
 * @returns {string}
 */
export function fmtShort(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Add minutes to a Date, returning a new Date.
 * DST-safe because we add ms = minutes * 60000.
 * @param {Date} date
 * @param {number} minutes
 * @returns {Date}
 */
export function addMin(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * Compute exact age string from birthdate ISO string.
 * @param {string} iso — e.g. "2024-03-15"
 * @returns {string} e.g. "1 J 2 M 5 T"
 */
export function ageExact(iso) {
  if (!iso) return '—';
  const birth = new Date(iso);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();
  if (days < 0) {
    months--;
    // Days in previous month (DST-safe: use calendar month subtraction)
    const prev = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prev.getDate();
  }
  if (months < 0) { years--; months += 12; }
  if (years === 0 && months === 0) return `${days} T`;
  if (years === 0) return `${months} M ${days} T`;
  return `${years} J ${months} M`;
}

/**
 * Age in complete months (for WHO growth chart x-axis).
 * @param {string} iso
 * @returns {number}
 */
export function ageMonths(iso) {
  if (!iso) return 0;
  const birth = new Date(iso);
  const now = new Date();
  return (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
}

/**
 * Returns a YYYY-MM-DD string for a Date (local timezone).
 * DST-safe alternative to toISOString() which uses UTC.
 * @param {Date} d
 * @returns {string}
 */
export function toLocalDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Create a Date from a YYYY-MM-DD string at local midnight.
 * DST-safe: avoids UTC parsing issues.
 * @param {string} str
 * @returns {Date}
 */
export function fromLocalDateStr(str) {
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}

/**
 * Returns start-of-day timestamp (00:00:00.000) for a given date.
 * DST-safe via calendar arithmetic.
 * @param {Date} d
 * @returns {number} timestamp
 */
export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Returns end-of-day timestamp (23:59:59.999) for a given date.
 * @param {Date} d
 * @returns {number} timestamp
 */
export function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * Clamp a value between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * Generate a short UUID-like ID (collision-resistant for local use).
 * @returns {string}
 */
export function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Deep-clone a plain object via JSON (no functions/Dates).
 * @param {*} obj
 * @returns {*}
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce a function call.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/**
 * Escape HTML entities for safe DOM insertion.
 * @param {string} str
 * @returns {string}
 */
export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format grams → "XXX g" or "X.XX kg".
 * @param {number} g
 * @returns {string}
 */
export function fmtWeight(g) {
  if (!g && g !== 0) return '—';
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g} g`;
}

/**
 * Format cm → "XX.X cm".
 * @param {number} cm
 * @returns {string}
 */
export function fmtHeight(cm) {
  if (!cm && cm !== 0) return '—';
  return `${cm} cm`;
}
