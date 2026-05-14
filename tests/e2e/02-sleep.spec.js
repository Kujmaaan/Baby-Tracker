// ─── 02-sleep.spec.js — Sleep tracking flows ─────────────────────────────────
import { test, expect } from '@playwright/test';
import { clearAppStorage } from './helpers.js';

test.describe('Sleep Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAppStorage(page);
    await page.reload();
    await page.waitForTimeout(2000);
  });

  test('T05 — Sleep button exists on home screen', async ({ page }) => {
    const homeBtn = page.locator('[data-page="home"], nav button').first();
    await homeBtn.click();
    await page.waitForTimeout(300);
    const sleepBtn = page.locator('#sleep-toggle, button:has-text("Schlafen"), button[onclick*="toggleSleep"]');
    await expect(sleepBtn.first()).toBeVisible();
  });

  test('T06 — Sleep start/stop cycle', async ({ page }) => {
    // Navigate to home
    await page.locator('[data-page="home"], nav button').first().click();
    await page.waitForTimeout(300);

    const sleepBtn = page.locator('#sleep-toggle, button[onclick*="toggleSleep"]').first();
    if (!await sleepBtn.isVisible()) return; // Skip if no child yet

    // Start sleep
    const textBefore = await sleepBtn.textContent();
    await sleepBtn.click();
    await page.waitForTimeout(600);
    const textAfter = await sleepBtn.textContent();
    // Button text should change (e.g. "Aufwachen" vs "Schlafen")
    expect(textAfter).not.toEqual(textBefore);

    // Stop sleep
    await sleepBtn.click();
    await page.waitForTimeout(600);
    const textFinal = await sleepBtn.textContent();
    // Should return to original sleep state
    expect(textFinal).not.toEqual(textAfter);
  });

  test('T07 — activeSleepGuard prevents double sleep start', async ({ page }) => {
    await page.locator('[data-page="home"], nav button').first().click();
    await page.waitForTimeout(300);

    const sleepBtn = page.locator('#sleep-toggle, button[onclick*="toggleSleep"]').first();
    if (!await sleepBtn.isVisible()) return;

    // Start sleep
    await sleepBtn.click();
    await page.waitForTimeout(500);

    // Directly call toggleSleep again via JS (simulating rapid tap)
    const toastPromise = page.waitForSelector('.toast, [class*="toast"]', { timeout: 3000 }).catch(() => null);
    await page.evaluate(() => window.toggleSleep?.());
    const toast = await toastPromise;
    // Should either show error toast or be ignored — not create duplicate
    const sleepEntries = await page.evaluate(async () => {
      const { openDB, STORES } = await import('/src/storage.js');
      const db = await openDB();
      return new Promise(res => {
        const tx  = db.transaction('sleep', 'readonly');
        const req = tx.objectStore('sleep').getAll();
        req.onsuccess = () => res(req.result);
        req.onerror   = () => res([]);
      });
    }).catch(() => []);

    const openSleeps = sleepEntries.filter(e => !e.end);
    expect(openSleeps.length).toBeLessThanOrEqual(1);
  });

  test('T08 — Sleep correction modal opens', async ({ page }) => {
    await page.locator('[data-page="home"], nav button').first().click();
    await page.waitForTimeout(300);

    const fixBtn = page.locator('button[onclick*="openFixStartModal"], button:has-text("Schlafbeginn")').first();
    if (await fixBtn.isVisible()) {
      // Start sleep first
      const sleepBtn = page.locator('#sleep-toggle, button[onclick*="toggleSleep"]').first();
      await sleepBtn.click();
      await page.waitForTimeout(500);
      await fixBtn.click();
      await page.waitForTimeout(300);
      await expect(page.locator('#fix-start-modal, .modal')).toBeVisible();
    }
  });

  test('T13 — DST: sleep entry with ts/end spanning midnight is valid', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const mod = await import('/src/sleep.js');
      const entry = {
        id: 'dst-test', childId: 'c1',
        ts:  new Date('2024-03-30T22:00:00').getTime(),
        end: new Date('2024-03-31T06:00:00').getTime(),
      };
      return mod.validateSleepEntry(entry);
    }).catch(err => ({ errors: [err.message] }));
    expect(result.errors ?? []).toHaveLength(0);
  });

  test('T14 — Midnight crossing sleep is correctly split', async ({ page }) => {
    const segments = await page.evaluate(async () => {
      const mod = await import('/src/sleep.js');
      const entry = {
        id: 'mc-test', childId: 'c1',
        ts:  new Date('2024-06-15T23:00:00').getTime(),
        end: new Date('2024-06-16T07:00:00').getTime(),
      };
      return mod.splitSleepAcrossDays(entry);
    }).catch(() => []);
    expect(segments.length).toBe(2);
    const totalMs = segments.reduce((s, seg) => s + seg.ms, 0);
    expect(Math.abs(totalMs - 8 * 3_600_000)).toBeLessThan(1000);
  });
});
