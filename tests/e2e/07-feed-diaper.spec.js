// ─── 07-feed-diaper.spec.js — Feed & Diaper tracking flows ───────────────────
import { test, expect } from '@playwright/test';
import { clearAppStorage } from './helpers.js';

test.describe('Feed & Diaper Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAppStorage(page);
    await page.reload();
    await page.waitForTimeout(2000);
  });

  test('T16a — addEntry(FEED) stores entry in IDB', async ({ page }) => {
    const id = await page.evaluate(async () => {
      const { addEntry, STORES } = await import('/src/storage.js');
      const entry = await addEntry(STORES.FEED, {
        childId: 'c1',
        ts:      Date.now(),
        type:    'breast',
        ml:      0,
      }, 'dev1');
      return entry?.id ?? null;
    });
    expect(id).not.toBeNull();
    expect(typeof id).toBe('string');
  });

  test('T16b — addEntry(FEED) enqueues sync item', async ({ page }) => {
    const queueLen = await page.evaluate(async () => {
      const { addEntry, getPendingQueue, STORES } = await import('/src/storage.js');
      await addEntry(STORES.FEED, { childId: 'c1', ts: Date.now(), type: 'bottle', ml: 120 }, 'dev1');
      return (await getPendingQueue()).length;
    });
    expect(queueLen).toBeGreaterThan(0);
  });

  test('T17 — addEntry(DIAPER) wet entry is retrievable', async ({ page }) => {
    const entry = await page.evaluate(async () => {
      const { addEntry, getEntriesByChild, STORES } = await import('/src/storage.js');
      await addEntry(STORES.DIAPER, { childId: 'c1', ts: Date.now(), kind: 'wet' }, 'dev1');
      const all = await getEntriesByChild(STORES.DIAPER, 'c1');
      return all.find(e => e.kind === 'wet') ?? null;
    });
    expect(entry).not.toBeNull();
    expect(entry.kind).toBe('wet');
  });

  test('T18 — addEntry(DIAPER) dirty entry has correct kind', async ({ page }) => {
    const kinds = await page.evaluate(async () => {
      const { addEntry, getEntriesByChild, STORES } = await import('/src/storage.js');
      await addEntry(STORES.DIAPER, { childId: 'c1', ts: Date.now(), kind: 'dirty' }, 'dev1');
      await addEntry(STORES.DIAPER, { childId: 'c1', ts: Date.now() + 1, kind: 'both' }, 'dev1');
      const all = await getEntriesByChild(STORES.DIAPER, 'c1');
      return all.map(e => e.kind);
    });
    expect(kinds).toContain('dirty');
    expect(kinds).toContain('both');
  });

  test('T18b — getEntriesByChildRange returns only entries in time window', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { addEntry, getEntriesByChildRange, STORES } = await import('/src/storage.js');
      const now  = Date.now();
      const h1   = now - 3_600_000;   // 1h ago — inside window
      const h25  = now - 25 * 3_600_000; // 25h ago — outside window

      await addEntry(STORES.DIAPER, { childId: 'c1', ts: h1,  kind: 'wet' },  'dev1');
      await addEntry(STORES.DIAPER, { childId: 'c1', ts: h25, kind: 'dirty' }, 'dev1');

      const windowStart = now - 2 * 3_600_000; // 2h window
      const entries = await getEntriesByChildRange(STORES.DIAPER, 'c1', windowStart, now + 1000);
      return { count: entries.length, kinds: entries.map(e => e.kind) };
    });
    expect(result.count).toBe(1);
    expect(result.kinds).toContain('wet');
    expect(result.kinds).not.toContain('dirty');
  });
});
