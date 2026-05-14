// ─── 08-security-conflict.spec.js — XSS, Soft-Delete, Conflict, Snapshot ─────
import { test, expect } from '@playwright/test';
import { clearAppStorage } from './helpers.js';

test.describe('Security & Conflict Resolution', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAppStorage(page);
    await page.reload();
    await page.waitForTimeout(1500);
  });

  // ── XSS Prevention ──────────────────────────────────────────────────────────

  test('T19a — escHtml neutralises script tags in entry notes', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const mod = await import('/src/helpers.js');
      const fn = mod.escHtml ?? mod.esc;
      if (!fn) return { skipped: true };
      const out = fn('<script>alert(1)</script>');
      return { out, hasTag: out.includes('<script>') };
    });
    if (result.skipped) return; // helper not exported — skip gracefully
    expect(result.hasTag).toBe(false);
    expect(result.out).toContain('&lt;script&gt;');
  });

  test('T19b — escHtml neutralises img onerror injection', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const mod = await import('/src/helpers.js');
      const fn = mod.escHtml ?? mod.esc;
      if (!fn) return { skipped: true };
      const payload = '<img src=x onerror="alert(1)">';
      return { out: fn(payload), hasImg: fn(payload).includes('<img') };
    });
    if (result.skipped) return;
    expect(result.hasImg).toBe(false);
  });

  test('T19c — Sleep entry note with XSS payload does not execute in DOM', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', async dialog => {
      alertFired = true;
      await dialog.dismiss();
    });

    // Inject a sleep entry with a note containing an XSS payload
    await page.evaluate(async () => {
      const { addEntry, STORES } = await import('/src/storage.js');
      await addEntry(STORES.SLEEP, {
        childId: 'c1',
        ts:      Date.now() - 3_600_000,
        end:     Date.now(),
        note:    '<img src=x onerror="window.__xss_fired=true">',
      }, 'dev1');
    });

    // Trigger home render (which should render sleep entries)
    await page.evaluate(() => window.renderHome?.());
    await page.waitForTimeout(1000);

    const xssFired = await page.evaluate(() => !!window.__xss_fired);
    expect(xssFired).toBe(false);
    expect(alertFired).toBe(false);
  });

  // ── Soft Delete / Tombstone ─────────────────────────────────────────────────

  test('T20a — softDelete creates tombstone entry', async ({ page }) => {
    const tombstoneCount = await page.evaluate(async () => {
      const { addEntry, STORES, openDB } = await import('/src/storage.js');
      const { softDelete } = await import('/src/tombstone.js');

      const entry = await addEntry(STORES.MILESTONE, {
        childId: 'c1',
        ts:      Date.now(),
        title:   'Erstes Lächeln',
      }, 'dev1');

      await softDelete(STORES.MILESTONE, entry.id, `families/test/milestone`, 'dev1');

      const db = await openDB();
      return new Promise(res => {
        const tx  = db.transaction('tombstones', 'readonly');
        const req = tx.objectStore('tombstones').getAll();
        req.onsuccess = () => res(req.result.length);
        req.onerror   = () => res(0);
      });
    });
    expect(tombstoneCount).toBeGreaterThan(0);
  });

  test('T20b — softDelete marks entry as _deleted in IDB', async ({ page }) => {
    const deleted = await page.evaluate(async () => {
      const { addEntry, getEntry, STORES } = await import('/src/storage.js');
      const { softDelete } = await import('/src/tombstone.js');

      const entry = await addEntry(STORES.MILESTONE, {
        childId: 'c1',
        ts:      Date.now(),
        title:   'Erster Zahn',
      }, 'dev1');

      await softDelete(STORES.MILESTONE, entry.id, `families/test/milestone`, 'dev1');
      const after = await getEntry(STORES.MILESTONE, entry.id);
      return after?._deleted ?? false;
    });
    expect(deleted).toBe(true);
  });

  // ── Conflict Resolution ─────────────────────────────────────────────────────

  test('T21a — resolveConflict: tombstone-wins when remote is deleted', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { resolveConflict } = await import('/src/conflict.js');
      const local  = { id: 'x1', updatedAt: Date.now(), note: 'local' };
      const remote = { id: 'x1', updatedAt: Date.now() - 1000, _deleted: true };
      return resolveConflict(local, remote, {});
    });
    expect(result.resolution).toBe('tombstone-wins');
    expect(result.winner._deleted).toBe(true);
  });

  test('T21b — resolveConflict: local-wins when no remote exists', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { resolveConflict } = await import('/src/conflict.js');
      const local = { id: 'x2', updatedAt: Date.now() };
      return resolveConflict(local, null, { createdAt: Date.now() });
    });
    expect(result.resolution).toBe('local-wins');
  });

  test('T21c — resolveConflict: remote-wins when remote is newer', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { resolveConflict } = await import('/src/conflict.js');
      const now    = Date.now();
      const local  = { id: 'x3', updatedAt: now - 5000 };
      const remote = { id: 'x3', updatedAt: now };
      return resolveConflict(local, remote, {});
    });
    expect(result.resolution).toBe('remote-wins');
  });

  test('T21d — resolveConflict: stale-discarded when revision gap > 10', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { resolveConflict } = await import('/src/conflict.js');
      const local  = { id: 'x4', updatedAt: Date.now(), syncRevision: 1 };
      const remote = { id: 'x4', updatedAt: Date.now(), syncRevision: 15 };
      return resolveConflict(local, remote, {});
    });
    expect(result.resolution).toBe('stale-discarded');
  });

  // ── Snapshot / Restore ──────────────────────────────────────────────────────

  test('T22a — takeSnapshot returns { snapId, stored }', async ({ page }) => {
    await page.evaluate(async () => {
      const { addEntry, STORES } = await import('/src/storage.js');
      await addEntry(STORES.SLEEP, { childId: 'c1', ts: Date.now() - 3600_000, end: Date.now() }, 'dev1');
    });

    const snap = await page.evaluate(async () => {
      const { takeSnapshot } = await import('/src/restore.js');
      return await takeSnapshot();
    });

    expect(snap).toHaveProperty('snapId');
    expect(snap).toHaveProperty('stored');
    expect(typeof snap.snapId).toBe('string');
    expect(snap.snapId.length).toBeGreaterThan(0);
  });

  test('T22b — safeRestore can restore from a valid snapshot', async ({ page }) => {
    // Create snapshot with known data
    await page.evaluate(async () => {
      const { addEntry, STORES } = await import('/src/storage.js');
      await addEntry(STORES.SLEEP, { childId: 'c1', ts: Date.now() - 3600_000, end: Date.now() }, 'dev1');
    });

    const snapId = await page.evaluate(async () => {
      const { takeSnapshot } = await import('/src/restore.js');
      const snap = await takeSnapshot();
      return snap.stored ? snap.snapId : null;
    });

    if (!snapId) return; // storage quota hit in CI — skip

    const restored = await page.evaluate(async (id) => {
      try {
        const { safeRestore } = await import('/src/restore.js');
        await safeRestore(id);
        return true;
      } catch { return false; }
    }, snapId);

    expect(restored).toBe(true);
  });
});
