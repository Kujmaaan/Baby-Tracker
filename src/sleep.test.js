// ─── sleep.test.js — Automated tests for sleep logic ─────────────────────────
// Run with: node --input-type=module < src/sleep.test.js
// Or as ES module: node src/sleep.test.js (Node ≥ 18 with "type":"module" in package.json)
//
// Tests: validateSleepEntry, crossesMidnight, sleepDuration, splitSleepAcrossDays,
//        activeSleepGuard, detectSleepOverlaps using TEST_CASES from sleep.js.

import {
  validateSleepEntry,
  crossesMidnight,
  sleepDuration,
  splitSleepAcrossDays,
  activeSleepGuard,
  detectSleepOverlaps,
  TEST_CASES,
  MAX_SLEEP_DURATION_MS,
  MIN_SLEEP_DURATION_MS,
} from './sleep.js';

// ── Tiny test runner ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function assert(label, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ ok: true, label });
  } else {
    failed++;
    results.push({ ok: false, label, detail });
    console.error(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function group(name, fn) {
  console.log(`\n▶ ${name}`);
  fn();
}

// ── 1. TEST_CASES from sleep.js ───────────────────────────────────────────────

group('TEST_CASES (from sleep.js)', () => {
  for (const tc of TEST_CASES) {
    const result = validateSleepEntry(tc.entry);
    const isValid = result.errors.length === 0;

    assert(
      `${tc.label} — valid=${tc.expect.valid}`,
      isValid === tc.expect.valid,
      isValid ? 'expected invalid' : result.errors.join('; ')
    );

    if (tc.expect.valid && tc.entry.end) {
      if (tc.expect.crossesMidnight !== undefined) {
        assert(
          `${tc.label} — crossesMidnight`,
          crossesMidnight(tc.entry) === tc.expect.crossesMidnight
        );
      }
      if (tc.expect.durationH !== undefined) {
        const durH = sleepDuration(tc.entry) / 3_600_000;
        assert(
          `${tc.label} — durationH ≈ ${tc.expect.durationH}`,
          Math.abs(durH - tc.expect.durationH) < 0.1,
          `got ${durH.toFixed(2)}h`
        );
      }
      if (tc.expect.durationMin !== undefined) {
        const durMin = sleepDuration(tc.entry) / 60_000;
        assert(
          `${tc.label} — durationMin ≈ ${tc.expect.durationMin}`,
          Math.abs(durMin - tc.expect.durationMin) < 1,
          `got ${durMin.toFixed(1)}min`
        );
      }
    }
  }
});

// ── 2. splitSleepAcrossDays ───────────────────────────────────────────────────

group('splitSleepAcrossDays', () => {
  // Same-day sleep — should return 1 segment
  const sameDayEntry = {
    id: 's1', childId: 'c1',
    ts:  new Date('2024-06-15T10:00:00').getTime(),
    end: new Date('2024-06-15T12:00:00').getTime(),
  };
  const segs1 = splitSleepAcrossDays(sameDayEntry);
  assert('same-day: 1 segment', segs1.length === 1, `got ${segs1.length}`);
  assert('same-day: full duration', segs1[0].ms === 2 * 3_600_000, `got ${segs1[0].ms}`);

  // Midnight-crossing — should return 2 segments
  const midnightEntry = {
    id: 's2', childId: 'c1',
    ts:  new Date('2024-06-15T22:00:00').getTime(),
    end: new Date('2024-06-16T06:00:00').getTime(),
  };
  const segs2 = splitSleepAcrossDays(midnightEntry);
  assert('midnight-crossing: 2 segments', segs2.length === 2, `got ${segs2.length}`);
  const totalMs = segs2.reduce((s, seg) => s + seg.ms, 0);
  assert('midnight-crossing: total = 8h', Math.abs(totalMs - 8 * 3_600_000) < 1000, `got ${totalMs / 3_600_000}h`);

  // No-end (open/ongoing) — should return empty or single open segment
  const openEntry = { id: 's3', childId: 'c1', ts: Date.now() - 3_600_000 };
  const segs3 = splitSleepAcrossDays(openEntry);
  assert('open entry: returns array', Array.isArray(segs3));

  // 3-day span (very long but within 24h limit)
  // Not valid per validateSleepEntry but splitSleepAcrossDays should still handle it
  const longEntry = {
    id: 's4', childId: 'c1',
    ts:  new Date('2024-06-14T23:00:00').getTime(),
    end: new Date('2024-06-16T01:00:00').getTime(),
  };
  const segs4 = splitSleepAcrossDays(longEntry);
  assert('3-day span: ≥2 segments', segs4.length >= 2, `got ${segs4.length}`);
});

// ── 3. activeSleepGuard ───────────────────────────────────────────────────────

group('activeSleepGuard', () => {
  const noSleepEntries = [
    { id: 'x1', childId: 'c1', ts: Date.now() - 10_000, end: Date.now() - 1_000 }, // completed
  ];
  assert('no active sleep: returns null', activeSleepGuard(noSleepEntries) === null);

  const withActiveSleep = [
    { id: 'x2', childId: 'c1', ts: Date.now() - 3_600_000, end: null }, // ongoing
  ];
  const msg = activeSleepGuard(withActiveSleep);
  assert('active sleep: returns error string', typeof msg === 'string' && msg.length > 0, msg);

  assert('empty entries: returns null', activeSleepGuard([]) === null);
});

// ── 4. detectSleepOverlaps ────────────────────────────────────────────────────

group('detectSleepOverlaps', () => {
  // No overlaps
  const clean = [
    { id: 'o1', childId: 'c1', ts: new Date('2024-06-15T08:00:00').getTime(), end: new Date('2024-06-15T10:00:00').getTime() },
    { id: 'o2', childId: 'c1', ts: new Date('2024-06-15T12:00:00').getTime(), end: new Date('2024-06-15T14:00:00').getTime() },
  ];
  assert('no overlaps: empty result', detectSleepOverlaps(clean).length === 0);

  // One overlap
  const overlapping = [
    { id: 'p1', childId: 'c1', ts: new Date('2024-06-15T08:00:00').getTime(), end: new Date('2024-06-15T11:00:00').getTime() },
    { id: 'p2', childId: 'c1', ts: new Date('2024-06-15T10:00:00').getTime(), end: new Date('2024-06-15T13:00:00').getTime() }, // overlaps p1
  ];
  const found = detectSleepOverlaps(overlapping);
  assert('detects 1 overlap', found.length === 1, `got ${found.length}`);
  assert('overlap includes both IDs', found[0].includes('p1') && found[0].includes('p2'));

  // Ignore open (ongoing) entries
  const withOpen = [
    { id: 'q1', childId: 'c1', ts: new Date('2024-06-15T08:00:00').getTime(), end: new Date('2024-06-15T10:00:00').getTime() },
    { id: 'q2', childId: 'c1', ts: new Date('2024-06-15T09:00:00').getTime() }, // no end — should be ignored
  ];
  assert('open entries ignored in overlap check', detectSleepOverlaps(withOpen).length === 0);
});

// ── 5. validateSleepEntry edge cases ─────────────────────────────────────────

group('validateSleepEntry edge cases', () => {
  // Missing ts
  const noTs = { id: 'v1', childId: 'c1' };
  assert('missing ts: invalid', validateSleepEntry(noTs).errors.length > 0);

  // Exactly at MIN boundary (valid)
  const minDur = {
    id: 'v2', childId: 'c1',
    ts:  Date.now() - MIN_SLEEP_DURATION_MS,
    end: Date.now(),
  };
  assert('min-duration boundary: valid', validateSleepEntry(minDur).errors.length === 0);

  // 1ms under min (invalid)
  const underMin = {
    id: 'v3', childId: 'c1',
    ts:  Date.now() - (MIN_SLEEP_DURATION_MS - 1),
    end: Date.now(),
  };
  assert('under-min-duration: invalid', validateSleepEntry(underMin).errors.length > 0);

  // Exactly at MAX boundary (valid)
  const maxDur = {
    id: 'v4', childId: 'c1',
    ts:  Date.now() - MAX_SLEEP_DURATION_MS,
    end: Date.now(),
  };
  assert('max-duration boundary: valid', validateSleepEntry(maxDur).errors.length === 0);

  // 1ms over max (invalid)
  const overMax = {
    id: 'v5', childId: 'c1',
    ts:  Date.now() - (MAX_SLEEP_DURATION_MS + 1),
    end: Date.now(),
  };
  assert('over-max-duration: invalid', validateSleepEntry(overMax).errors.length > 0);
});


// ── 6. isValidQueueItem ───────────────────────────────────────────────────────

// Inline the validator here (no dynamic import needed for unit tests)
const VALID_OPS_T      = new Set(['put', 'delete']);
const VALID_STATUSES_T = new Set(['pending', 'failed', 'quarantined']);
const MAX_QUEUE_AGE_MS_T = 30 * 24 * 60 * 60 * 1000;
function isValidQueueItem(item) {
  if (!item || typeof item !== 'object')           return 'not an object';
  if (!item.qid  || typeof item.qid  !== 'string') return 'missing qid';
  if (!VALID_OPS_T.has(item.op))                   return `invalid op: ${item.op}`;
  if (!item.path || typeof item.path !== 'string') return 'missing path';
  if (typeof item.createdAt !== 'number')          return 'invalid createdAt';
  if (typeof item.attempts  !== 'number')          return 'invalid attempts';
  if (item.status && !VALID_STATUSES_T.has(item.status)) return `invalid status: ${item.status}`;
  if (item.op === 'put' && (item.data === undefined || item.data === null))
                                                   return 'put requires data';
  if (Date.now() - item.createdAt > MAX_QUEUE_AGE_MS_T) return 'item too old (>30d)';
  return null;
}

group('isValidQueueItem', () => {
  const base = { qid: 'q1', op: 'put', path: 'families/f1/sleep/s1',
                 data: { id: 's1' }, status: 'pending',
                 createdAt: Date.now(), attempts: 0 };

  assert('valid put item: null (no error)',
    isValidQueueItem(base) === null);

  assert('valid delete item (no data): null',
    isValidQueueItem({ ...base, op: 'delete', data: null }) === null);

  assert('missing qid: error',
    isValidQueueItem({ ...base, qid: '' }) !== null);

  assert('invalid op (storeName): error',
    isValidQueueItem({ ...base, op: 'storeName' }) !== null);

  assert('put without data: error',
    isValidQueueItem({ ...base, data: null }) !== null);

  assert('delete without data: valid (data optional)',
    isValidQueueItem({ ...base, op: 'delete', data: undefined }) === null);

  assert('missing path: error',
    isValidQueueItem({ ...base, path: '' }) !== null);

  assert('invalid createdAt: error',
    isValidQueueItem({ ...base, createdAt: 'yesterday' }) !== null);

  assert('invalid attempts: error',
    isValidQueueItem({ ...base, attempts: '3' }) !== null);

  assert('invalid status: error',
    isValidQueueItem({ ...base, status: 'corrupt' }) !== null);

  assert('age > 30 days: error',
    isValidQueueItem({ ...base, createdAt: Date.now() - (31 * 24 * 60 * 60 * 1000) }) !== null);

  assert('null input: error',
    isValidQueueItem(null) !== null);

  assert('array input: error',
    isValidQueueItem([]) !== null);
});


// ── 7. runMigrations fail-fast ────────────────────────────────────────────────

// Inline the key behaviour of runMigrations for pure-JS testing
function runMigrationsTest(migrations, oldVersion, newVersion) {
  const log = [];
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    if (migrations[v]) {
      try {
        migrations[v]();
        log.push({ v, ok: true });
      } catch (err) {
        const wrapped = new Error(`DB migration v${v} failed: ${err.message}`);
        wrapped.migrationVersion = v;
        wrapped.cause = err;
        throw wrapped;
      }
    }
  }
  return log;
}

group('runMigrations fail-fast', () => {
  // All-good migrations should complete silently
  assert('all-ok migrations run without throwing', (() => {
    try {
      const log = runMigrationsTest({ 2: () => {}, 3: () => {} }, 1, 3);
      return log.length === 2;
    } catch { return false; }
  })());

  // A failing migration should throw immediately
  assert('failing migration throws', (() => {
    try {
      runMigrationsTest({ 2: () => { throw new Error('index error'); } }, 1, 2);
      return false; // should not reach here
    } catch (e) {
      return e.message.includes('migration v2 failed');
    }
  })());

  // migrationVersion is set on the thrown error
  assert('thrown error carries migrationVersion', (() => {
    try {
      runMigrationsTest({ 2: () => { throw new Error('oops'); } }, 1, 2);
      return false;
    } catch (e) {
      return e.migrationVersion === 2;
    }
  })());

  // No subsequent migration runs after a failure (fail-fast)
  assert('no migration runs after failure (fail-fast)', (() => {
    let ran3 = false;
    try {
      runMigrationsTest({
        2: () => { throw new Error('v2 broken'); },
        3: () => { ran3 = true; },
      }, 1, 3);
    } catch { /* expected */ }
    return ran3 === false;
  })());

  // Skipped versions are silently ignored
  assert('missing migration version is skipped', (() => {
    try {
      const log = runMigrationsTest({ 3: () => {} }, 1, 3);
      return log.length === 1 && log[0].v === 3;
    } catch { return false; }
  })());
});

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`);
if (failed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
  process.exit(1);
} else {
  console.log('All tests passed ✓');
}
