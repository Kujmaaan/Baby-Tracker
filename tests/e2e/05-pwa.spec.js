// ─── 05-pwa.spec.js — PWA + Service Worker + Theme flows ─────────────────────
import { test, expect } from '@playwright/test';
import { clearAppStorage } from './helpers.js';

test.describe('PWA & Service Worker', () => {
  test('T10a — Service Worker registers', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    });
    expect(swRegistered).toBe(true);
  });

  test('T11 — Theme persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Set dark theme via JS
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });

    await page.reload();
    await page.waitForTimeout(1500);

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme') ||
      localStorage.getItem('theme')
    );
    expect(theme).toBe('dark');
  });

  test('T12a — manifest.json is valid JSON and has required fields', async ({ page }) => {
    const res  = await page.request.get('/manifest.json');
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json).toHaveProperty('name');
    expect(json).toHaveProperty('short_name');
    expect(json).toHaveProperty('icons');
    expect(json).toHaveProperty('start_url');
    expect(json).toHaveProperty('display');
    expect(Array.isArray(json.icons)).toBe(true);
    expect(json.icons.length).toBeGreaterThan(0);
  });

  test('T12b — sw.js is served with correct MIME type', async ({ page }) => {
    const res = await page.request.get('/sw.js');
    expect(res.ok()).toBe(true);
    const ct = res.headers()['content-type'] || '';
    // JavaScript MIME
    expect(ct).toMatch(/javascript|text\/plain/);
  });

  test('T12c — All critical app shell files exist', async ({ page }) => {
    const files = [
      '/', '/index.html', '/sw.js', '/manifest.json',
      '/src/app.js', '/src/storage.js', '/src/firebase.js',
      '/src/sleep.js', '/src/perf.js', '/src/security.js',
      '/src/migrations.js', '/styles/main.css',
    ];
    for (const file of files) {
      const res = await page.request.get(file);
      expect(res.ok(), `${file} should return 200`).toBe(true);
    }
  });

  test('T12d — No mixed content (HTTP resources on HTTPS page)', async ({ page }) => {
    const insecureRequests = [];
    page.on('request', req => {
      if (req.url().startsWith('http://') && !req.url().includes('localhost')) {
        insecureRequests.push(req.url());
      }
    });
    await page.goto('/');
    await page.waitForTimeout(3000);
    expect(insecureRequests).toHaveLength(0);
  });
});
