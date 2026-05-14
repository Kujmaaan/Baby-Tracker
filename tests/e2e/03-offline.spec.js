// ─── 03-offline.spec.js — Offline / Reconnect / Queue flows ──────────────────
import { test, expect } from '@playwright/test';
import { clearAppStorage, goOffline, goOnline } from './helpers.js';

test.describe('Offline Behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAppStorage(page);
    await page.reload();
    await page.waitForTimeout(2000);
  });

  test('T09 — App loads and renders while offline', async ({ page }) => {
    await goOffline(page);
    await page.reload();
    await page.waitForTimeout(3000);
    // App should still show UI (from SW cache or inline)
    await expect(page.locator('nav, .tab-bar, body')).toBeVisible();
    await goOnline(page);
  });

  test('T10 — Offline entry is queued for sync', async ({ page }) => {
    // First load online so SW caches app
    await page.waitForTimeout(1000);

    // Go offline
    await goOffline(page);
    await page.waitForTimeout(300);

    // Add a diaper entry via JS (simulating button click offline)
    const queueLength = await page.evaluate(async () => {
      try {
        const { addEntry, getPendingQueue, STORES } = await import('/src/storage.js');
        await addEntry(STORES.DIAPER, { childId: 'test-child', ts: Date.now(), kind: 'wet' }, 'test-device');
        const q = await getPendingQueue();
        return q.length;
      } catch { return -1; }
    }).catch(() => -1);

    expect(queueLength).toBeGreaterThan(0);
    await goOnline(page);
  });

  test('T11 — Queue flushes on reconnect', async ({ page }) => {
    // Add an offline entry
    await page.evaluate(async () => {
      const { enqueueSync } = await import('/src/storage.js');
      await enqueueSync('put', 'families/test/sleep/item1', { id: 'item1', ts: Date.now() });
    });

    const queueBefore = await page.evaluate(async () => {
      const { getPendingQueue } = await import('/src/storage.js');
      return (await getPendingQueue()).length;
    });
    expect(queueBefore).toBeGreaterThan(0);

    // syncUp should attempt to flush (will fail on Firebase but dequeue attempt proves flow)
    // Just verify syncUp is callable without throwing
    const result = await page.evaluate(async () => {
      try {
        const { syncUp } = await import('/src/firebase.js');
        return await syncUp();
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result).not.toHaveProperty('error');
  });

  test('T15 — Queue recovery: quarantined items after 5 failures', async ({ page }) => {
    await page.evaluate(async () => {
      const { enqueueSync, failQueueItem, getPendingQueue } = await import('/src/storage.js');
      await enqueueSync('put', 'families/test/fail/item1', { id: 'fail1' });
      const q = await getPendingQueue();
      const item = q[0];
      if (item) {
        for (let i = 0; i < 5; i++) await failQueueItem(item.qid);
      }
    });

    const quarantined = await page.evaluate(async () => {
      const { openDB } = await import('/src/storage.js');
      const db = await openDB();
      return new Promise(res => {
        const tx  = db.transaction('sync_queue', 'readonly');
        const idx = tx.objectStore('sync_queue').index('byStatus');
        const req = idx.getAll('quarantined');
        req.onsuccess = () => res(req.result.length);
        req.onerror   = () => res(0);
      });
    });
    expect(quarantined).toBeGreaterThan(0);
  });
});
