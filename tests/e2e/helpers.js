// ─── tests/e2e/helpers.js — Shared test helpers ───────────────────────────────

/**
 * Clear all IndexedDB databases in the page context.
 * Call before each test to ensure a clean slate.
 */
export async function clearAppStorage(page) {
  await page.evaluate(async () => {
    // Delete IndexedDB
    const dbs = await indexedDB.databases?.() || [];
    for (const db of dbs) {
      await new Promise((res, rej) => {
        const req = indexedDB.deleteDatabase(db.name);
        req.onsuccess = res;
        req.onerror   = rej;
        req.onblocked = () => { req.result?.close(); res(); };
      });
    }
    // Clear localStorage / sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    // Unregister Service Workers
    const regs = await navigator.serviceWorker?.getRegistrations() || [];
    for (const reg of regs) await reg.unregister();
  });
}

/**
 * Wait for the app to be fully booted (no loading overlay visible).
 */
export async function waitForBoot(page) {
  await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 10_000 });
}

/**
 * Complete the onboarding flow — create first child.
 */
export async function onboard(page, name = 'Testbaby', gender = 'f') {
  // If onboarding modal is visible
  const modal = page.locator('#onboarding-modal, .onboarding-modal');
  if (await modal.isVisible().catch(() => false)) {
    await page.fill('input[name="childName"], #child-name-input, #new-child-name', name);
    const genderBtn = page.locator(`[data-gender="${gender}"], button:has-text("Mädchen")`).first();
    if (await genderBtn.isVisible().catch(() => false)) await genderBtn.click();
    await page.click('button[type="submit"], .btn-primary, button:has-text("Speichern")');
    await page.waitForTimeout(500);
  } else {
    // Add via settings if no onboarding
    await page.click('[data-page="settings"], nav button:last-child');
    await page.waitForTimeout(300);
    await page.fill('#new-child-name', name);
    await page.click('button:has-text("Kind")');
    await page.waitForTimeout(500);
  }
}

/**
 * Navigate to a named tab.
 */
export async function goTo(page, tabName) {
  const navBtn = page.locator(`[data-page="${tabName}"], nav button:has-text("${tabName}")`).first();
  await navBtn.click();
  await page.waitForTimeout(300);
}

/**
 * Simulate going offline.
 */
export async function goOffline(page) {
  await page.context().setOffline(true);
}

/**
 * Simulate coming back online.
 */
export async function goOnline(page) {
  await page.context().setOffline(false);
}
