// ─── appcheck.js — Firebase App Check (graceful, opt-in) ─────────────────────
//
// App Check verifies requests come from legitimate app instances.
// Provider: reCAPTCHA v3 (GitHub Pages compatible).
//
// SETUP (one-time, in Firebase Console):
//   1. Firebase Console → App Check → Register your app
//   2. Choose "reCAPTCHA v3" provider
//   3. Add your reCAPTCHA v3 site key to RECAPTCHA_SITE_KEY below
//   4. In Firebase Console → App Check → Enforce (per service)
//   See: docs/APP_CHECK_SETUP.md
//
// GRACEFUL FALLBACK: if App Check fails or site key is not set,
// the app continues working — only sync degrades.

/** Replace with your reCAPTCHA v3 site key from Google reCAPTCHA admin. */
const RECAPTCHA_SITE_KEY = '';  // ← set this after Firebase Console setup

let _appCheckReady = false;
let _appCheckError = null;

/**
 * Initialise Firebase App Check.
 * Safe to call multiple times — idempotent.
 * Returns true if App Check is active, false if skipped/failed.
 */
export async function initAppCheck() {
  if (_appCheckReady) return true;
  if (!RECAPTCHA_SITE_KEY) {
    console.info('[AppCheck] No site key configured — skipping App Check.');
    return false;
  }
  try {
    if (typeof firebase === 'undefined' || !firebase.app) {
      console.warn('[AppCheck] Firebase not ready — skipping.');
      return false;
    }
    if (typeof firebase.appCheck !== 'function') {
      console.warn('[AppCheck] App Check SDK not loaded — skipping.');
      return false;
    }

    const appCheck = firebase.appCheck();
    appCheck.activate(
      new firebase.appCheck.ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      /* isTokenAutoRefreshEnabled */ true
    );

    _appCheckReady = true;
    console.info('[AppCheck] Active ✓');
    return true;
  } catch (err) {
    _appCheckError = err;
    console.warn('[AppCheck] Init failed (non-fatal):', err.message);
    return false;
  }
}

/** Is App Check currently active? */
export function isAppCheckReady() { return _appCheckReady; }

/** Last App Check error, if any. */
export function getAppCheckError() { return _appCheckError; }

/**
 * Get an App Check token for manual verification (e.g. custom backend).
 * Returns null if App Check is not active.
 */
export async function getAppCheckToken() {
  if (!_appCheckReady) return null;
  try {
    const result = await firebase.appCheck().getToken(/* forceRefresh */ false);
    return result.token;
  } catch (err) {
    console.warn('[AppCheck] getToken failed:', err.message);
    return null;
  }
}
