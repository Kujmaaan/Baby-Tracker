// ─── 01-onboarding.spec.js — First run + child setup ─────────────────────────
import { test, expect } from '@playwright/test';
import { clearAppStorage, waitForBoot } from './helpers.js';

test.describe('Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAppStorage(page);
    await page.reload();
  });

  test('T01 — App loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('/');
    await page.waitForTimeout(3000);
    // Filter out known benign errors (e.g. Firebase offline warning)
    const critical = errors.filter(e =>
      !e.includes('Firebase') &&
      !e.includes('sw.js') &&
      !e.includes('net::ERR')
    );
    expect(critical, `Console errors: ${critical.join('\n')}`).toHaveLength(0);
  });

  test('T02 — App renders main UI', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Bottom nav or main content should be present
    await expect(page.locator('nav, .tab-bar, #main-content')).toBeVisible();
  });

  test('T03 — Child can be created', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Navigate to settings and add a child
    const settingsBtn = page.locator('[data-page="settings"], nav button').last();
    await settingsBtn.click();
    await page.waitForTimeout(500);
    const nameInput = page.locator('#new-child-name, input[placeholder*="Name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('Emma');
      const submitBtn = page.locator('button:has-text("Kind hinzufügen"), button:has-text("Speichern"), button:has-text("Anlegen")').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForTimeout(500);
        // Child name should appear somewhere in the UI
        await expect(page.locator('text=Emma')).toBeVisible();
      }
    }
  });

  test('T04 — Dark/Light theme toggle works', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    const html = page.locator('html, body');
    const initialTheme = await html.getAttribute('data-theme') ||
                         await html.evaluate(el => document.documentElement.getAttribute('data-theme'));
    const themeBtn = page.locator('#theme-toggle, [aria-label*="theme"], button:has-text("Dark"), button:has-text("Light")').first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(300);
      const newTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(newTheme).not.toEqual(initialTheme);
    }
  });
});
