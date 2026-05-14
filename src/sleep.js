// ─── sleep.js — Sleep entry logic with DST-safe hardening ────────────────────
// Replaces the ad-hoc sleep functions scattered across index.html.

import { pad, fmtDur, fmtTime, fmtDate, startOfDay, endOfDay } from './helpers.js';

// ── Types (JSDoc) ─────────────────────────────────────────────────────────────
/**
 * @typedef {object} SleepEntry
 * @property {string}  id
 * @property {string}  childId
 * @property {number}  ts         — start timestamp (ms)
 * @property {number}  [end]      — end timestamp (ms); undefined = still sleeping
 * @property {string}  [note]
 * @property {string}  [createdAt]
 * @property {string}  [updatedAt]
 * @property {string}  [deviceId]
 * @property {'pending'|'synced'|'failed'} [syncStatus]
 */

// ── Constants ─────────────────────────────────────────────────────────────────
export const MAX_SLEEP_DURATION_MS = 24 * 60 * 60 * 1000; // 24 h upper bound
export const MIN_SLEEP_DURATION_MS = 60 * 1000;            // 1 min lower bound
export const MAX_FUTURE_TOLERANCE  = 60 * 1000;            // allow 1 min clock drift

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a sleep entry before save.
 * @param {SleepEntry} entry
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSleepEntry(entry) {
  const errors = [];
  const now = Date.now();

  if (!entry.childId) {
    errors.push('Kein Kind ausgewählt.');
  }
  if (!entry.ts || typeof entry.ts !== 'number') {
    errors.push('Schlafbeginn fehlt oder ist ungültig.');
  } else {
    if (entry.ts > now + MAX_FUTURE_TOLERANCE) {
      errors.push('Schlafbeginn liegt in der Zukunft.');
    }
  }
  if (entry.end !== undefined && entry.end !== null) {
    if (typeof entry.end !== 'number') {
      errors.push('Schlafende ist ungültig.');
    } else {
      if (entry.end > now + MAX_FUTURE_TOLERANCE) {
        errors.push('Schlafende liegt in der Zukunft.');
      }
      if (entry.end <= entry.ts) {
        errors.push('Schlafende muss nach Schlafbeginn liegen.');
      }
      const dur = entry.end - entry.ts;
      if (dur < MIN_SLEEP_DURATION_MS) {
        errors.push(`Schlafdauer zu kurz (min. ${MIN_SLEEP_DURATION_MS / 60000} Min).`);
      }
      if (dur > MAX_SLEEP_DURATION_MS) {
        errors.push(`Schlafdauer zu lang (max. 24 h).`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Normalize and coerce a sleep entry.
 * - Clamps future timestamps to now
 * - Rounds ts/end to minute precision
 * - Ensures end > ts
 * @param {SleepEntry} entry
 * @returns {SleepEntry}
 */
export function normalizeSleepEntry(entry) {
  const now = Date.now();
  let { ts, end } = entry;

  // Round to minute precision
  if (ts)  ts  = Math.floor(ts  / 60000) * 60000;
  if (end) end = Math.floor(end / 60000) * 60000;

  // Clamp future start to now
  if (ts && ts > now) ts = Math.floor(now / 60000) * 60000;

  // Clamp future end to now
  if (end && end > now) end = Math.floor(now / 60000) * 60000;

  // Ensure end > ts (add 1 min minimum)
  if (ts && end && end <= ts) end = ts + 60000;

  return { ...entry, ts, end };
}

// ── Duration helpers ──────────────────────────────────────────────────────────

/**
 * Compute duration of a sleep entry in ms.
 * Returns null if still in progress.
 * @param {SleepEntry} entry
 * @returns {number|null}
 */
export function sleepDuration(entry) {
  if (!entry.end) return null;
  return entry.end - entry.ts;
}

/**
 * True if entry is still in progress (no end).
 * @param {SleepEntry} entry
 * @returns {boolean}
 */
export function isSleeping(entry) {
  return !entry.end;
}

// ── Day-crossing detection ────────────────────────────────────────────────────

/**
 * True if a sleep entry crosses midnight (starts one day, ends the next).
 * @param {SleepEntry} entry
 * @returns {boolean}
 */
export function crossesMidnight(entry) {
  if (!entry.end) return false;
  const startDay = new Date(entry.ts);
  const endDay   = new Date(entry.end);
  return startDay.getDate()  !== endDay.getDate()  ||
         startDay.getMonth() !== endDay.getMonth() ||
         startDay.getFullYear() !== endDay.getFullYear();
}

// ── Statistics helpers ────────────────────────────────────────────────────────

/**
 * Total sleep ms for a list of completed entries.
 * @param {SleepEntry[]} entries
 * @returns {number}
 */
export function totalSleepMs(entries) {
  return entries.reduce((sum, e) => {
    const d = sleepDuration(e);
    return sum + (d || 0);
  }, 0);
}

/**
 * Filter entries to those overlapping a given calendar day.
 * DST-safe: uses calendar midnight boundaries, not hardcoded 86400000 ms arithmetic.
 * @param {SleepEntry[]} entries
 * @param {Date} day
 * @returns {SleepEntry[]}
 */
export function sleepEntriesForDay(entries, day) {
  const dayStart = startOfDay(day);
  const dayEnd   = endOfDay(day);
  return entries.filter(e => {
    const eEnd = e.end || Date.now();
    // Entry overlaps [dayStart, dayEnd] if it starts before dayEnd AND ends after dayStart
    return e.ts <= dayEnd && eEnd >= dayStart;
  });
}

/**
 * Total sleep ms for a specific calendar day.
 * Clamps entry boundaries to the day.
 * @param {SleepEntry[]} entries
 * @param {Date} day
 * @returns {number}
 */
export function sleepMsForDay(entries, day) {
  const dayStart = startOfDay(day);
  const dayEnd   = endOfDay(day);
  const dayEntries = sleepEntriesForDay(entries, day);
  return dayEntries.reduce((sum, e) => {
    const s = Math.max(e.ts, dayStart);
    const f = Math.min(e.end || Date.now(), dayEnd);
    return sum + Math.max(0, f - s);
  }, 0);
}

/**
 * Compute daily sleep totals for the last N days.
 * @param {SleepEntry[]} entries
 * @param {number} days
 * @returns {{ label: string, ms: number }[]}  — length == days, index 0 = oldest
 */
export function dailySleepTotals(entries, days = 7) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    // DST-safe: subtract i full calendar days
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ms = sleepMsForDay(entries, d);
    result.push({
      label: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`,
      ms,
    });
  }
  return result;
}

// ── Fix-start logic ───────────────────────────────────────────────────────────

/**
 * Parse a fix-start form submission.
 * @param {object} params
 * @param {string} params.timeStr   — "HH:MM"
 * @param {'today'|'yesterday'} params.day
 * @param {number} params.nowTs     — current timestamp (Date.now())
 * @returns {{ ts: number, errors: string[] }}
 */
export function parseFixStart({ timeStr, day, nowTs }) {
  const errors = [];
  const [hStr, mStr] = (timeStr || '').split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    errors.push('Ungültige Uhrzeit.');
    return { ts: 0, errors };
  }

  const base = new Date(nowTs);
  if (day === 'yesterday') {
    base.setDate(base.getDate() - 1);
  }
  base.setHours(h, m, 0, 0);
  const ts = base.getTime();

  if (ts > nowTs + MAX_FUTURE_TOLERANCE) {
    errors.push('Schlafbeginn liegt in der Zukunft.');
  }

  return { ts, errors };
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

/**
 * Generate HTML for a single sleep log entry.
 * @param {SleepEntry} entry
 * @param {(id: string) => void} onDelete
 * @param {(id: string) => void} onEdit
 * @returns {string} HTML string
 */
export function renderSleepItem(entry, onDelete, onEdit) {
  const dur     = sleepDuration(entry);
  const ongoing = isSleeping(entry);
  const night   = crossesMidnight(entry);
  const icon    = ongoing ? '😴' : (night ? '🌙' : '💤');
  const durStr  = ongoing ? '…läuft' : fmtDur(dur);
  const endStr  = entry.end ? fmtTime(entry.end) : '—';

  return `
    <div class="log-item sleep-item${ongoing ? ' ongoing' : ''}" data-id="${entry.id}">
      <span class="log-icon">${icon}</span>
      <div class="log-details">
        <span class="log-time">${fmtTime(entry.ts)} → ${endStr}</span>
        <span class="log-dur">${durStr}</span>
        ${night ? '<span class="log-badge night">über Mitternacht</span>' : ''}
        ${entry.note ? `<span class="log-note">${entry.note}</span>` : ''}
      </div>
      <div class="log-actions">
        <button class="icon-btn" onclick="(${onEdit})(${JSON.stringify(entry.id)})" aria-label="Bearbeiten">✏️</button>
        <button class="icon-btn danger" onclick="(${onDelete})(${JSON.stringify(entry.id)})" aria-label="Löschen">🗑️</button>
      </div>
    </div>`;
}

// ── Split sleep across day boundaries ────────────────────────────────────────

/**
 * Split a sleep entry that crosses midnight into segments per calendar day.
 * Each segment has the same id but scoped timestamps.
 * Used for per-day statistics — does NOT mutate the original entry.
 * @param {SleepEntry} entry
 * @returns {Array<{date: string, ms: number}>}  segments
 */
export function splitSleepAcrossDays(entry) {
  if (!entry.end) return [];
  const segments = [];
  let cursor = entry.ts;
  while (cursor < entry.end) {
    const d = new Date(cursor);
    const dayEnd = endOfDay(d);
    const segEnd = Math.min(entry.end, dayEnd);
    segments.push({
      date: toLocalDateStr(d),
      ms:   segEnd - cursor,
    });
    // Move to start of next calendar day (DST-safe)
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    cursor = next.getTime();
  }
  return segments;
}

// ── Active sleep guard ────────────────────────────────────────────────────────

/**
 * Check if there is already an open (active) sleep entry for a child.
 * Returns the active entry or null.
 * @param {SleepEntry[]} entries
 * @returns {SleepEntry|null}
 */
export function findActiveSleep(entries) {
  return entries.find(e => !e.end) || null;
}

/**
 * Guard: prevent starting a new sleep when one is already active.
 * Returns an error message or null if safe to proceed.
 * @param {SleepEntry[]} entries
 * @returns {string|null}
 */
export function activeSleepGuard(entries) {
  const active = findActiveSleep(entries);
  if (active) {
    return `Schlaf läuft bereits seit ${fmtTime(active.ts)}. Bitte zuerst beenden.`;
  }
  return null;
}

// ── Overlap detection ─────────────────────────────────────────────────────────

/**
 * Detect overlapping sleep entries (completed entries only).
 * Returns pairs of overlapping [a, b] entry IDs.
 * @param {SleepEntry[]} entries
 * @returns {Array<[string, string]>}
 */
export function detectSleepOverlaps(entries) {
  const completed = entries.filter(e => e.end).sort((a, b) => a.ts - b.ts);
  const overlaps = [];
  for (let i = 0; i < completed.length - 1; i++) {
    const a = completed[i];
    for (let j = i + 1; j < completed.length; j++) {
      const b = completed[j];
      if (b.ts >= a.end) break; // sorted by ts, no more overlaps possible
      overlaps.push([a.id, b.id]);
    }
  }
  return overlaps;
}

// ── DST Test cases (for automated testing) ───────────────────────────────────
// Run via: node --input-type=module src/sleep.test.js

export const TEST_CASES = [
  {
    label: 'Normal sleep',
    entry: { id:'t1', childId:'c1', ts: new Date('2024-06-15T22:00:00').getTime(),
             end: new Date('2024-06-16T06:00:00').getTime() },
    expect: { valid: true, crossesMidnight: true, durationH: 8 },
  },
  {
    label: 'DST spring forward (March — clocks +1h)',
    // In Europe 31.03.2024 02:00 → 03:00, so this night is only 7 real hours
    entry: { id:'t2', childId:'c1', ts: new Date('2024-03-30T22:00:00').getTime(),
             end: new Date('2024-03-31T06:00:00').getTime() },
    expect: { valid: true, crossesMidnight: true },
  },
  {
    label: 'DST fall back (October — clocks -1h)',
    entry: { id:'t3', childId:'c1', ts: new Date('2024-10-26T22:00:00').getTime(),
             end: new Date('2024-10-27T07:00:00').getTime() },
    expect: { valid: true, crossesMidnight: true },
  },
  {
    label: '23:59 → 00:01 short sleep',
    entry: { id:'t4', childId:'c1', ts: new Date('2024-06-15T23:59:00').getTime(),
             end: new Date('2024-06-16T00:01:00').getTime() },
    expect: { valid: true, crossesMidnight: true, durationMin: 2 },
  },
  {
    label: 'Future start (invalid)',
    entry: { id:'t5', childId:'c1', ts: Date.now() + 3_600_000 },
    expect: { valid: false },
  },
  {
    label: 'Negative duration (end before start)',
    entry: { id:'t6', childId:'c1', ts: new Date('2024-06-15T08:00:00').getTime(),
             end: new Date('2024-06-15T07:00:00').getTime() },
    expect: { valid: false },
  },
  {
    label: 'Too long (25h)',
    entry: { id:'t7', childId:'c1', ts: new Date('2024-06-15T00:00:00').getTime(),
             end: new Date('2024-06-16T01:00:00').getTime() },
    expect: { valid: false },
  },
];
