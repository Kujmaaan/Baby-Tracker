# Firebase App Check Setup

App Check protects your Firebase backend from abuse (quota theft, unauthorized clients).
This is optional but recommended for production.

---

## Step 1 — Get a reCAPTCHA v3 site key

1. Go to https://www.google.com/recaptcha/admin
2. Click **+** (Create)
3. Label: `Baby Tracker`
4. Type: **reCAPTCHA v3**
5. Domains: add `kujmaaan.github.io` (and `localhost` for dev)
6. Accept terms → **Submit**
7. Copy the **Site Key** (public, safe to embed)

---

## Step 2 — Enable App Check in Firebase Console

1. Firebase Console → your project → **App Check**
2. Click **Get started**
3. Select your web app
4. Provider: **reCAPTCHA v3**
5. Paste your site key
6. Click **Save**

---

## Step 3 — Add site key to the app

Edit `src/appcheck.js`, line 14:

```js
const RECAPTCHA_SITE_KEY = 'YOUR_SITE_KEY_HERE';
```

---

## Step 4 — Update CSP in index.html

Add reCAPTCHA domains to the Content Security Policy:

```
script-src ... https://www.google.com https://www.gstatic.com;
connect-src ... https://www.google.com;
frame-src https://www.google.com;
```

---

## Step 5 — Enforce App Check (optional, do last)

Once you've verified the app works with App Check active:

1. Firebase Console → App Check → **Enforce**
2. Select services to enforce (Realtime Database, Auth)
3. ⚠️ **Warning**: enforcing blocks all requests without a valid token.
   Only enforce after verifying tokens are being generated correctly
   (check browser DevTools → Network for Firebase requests).

---

## Development / localhost

App Check tokens don't work on `localhost` by default.
To test locally:

1. Firebase Console → App Check → Apps → your app → **Debug tokens**
2. Generate a debug token
3. In browser console: `localStorage.setItem('FIREBASE_APPCHECK_DEBUG_TOKEN', 'your-debug-token')`
4. Reload — the debug token is used automatically on localhost

---

## Risks & Limitations

- reCAPTCHA v3 scores (0.0–1.0) are not exposed to the app — App Check only passes/fails
- Bot traffic with valid browsers may still pass reCAPTCHA v3
- App Check does **not** replace Firebase Security Rules — both are needed
- If App Check init fails, the app continues working (graceful fallback in `src/appcheck.js`)
