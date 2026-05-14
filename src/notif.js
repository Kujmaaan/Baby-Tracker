// ─── notif.js — Notification Management ───────────────────────────────────────
// Handles all in-app notifications:
//   • Appointment reminders  (setTimeout, via SW registration.showNotification)
//   • Feeding interval alerts (setInterval, configurable)
//   • Sleep overshoot alerts  (setInterval, configurable)
//
// Web Push with a backend server is out of scope for a static PWA.
// All reminders are re-registered on app boot from saved config.

import { cfgGet, cfgSet } from './storage.js';

const CFG_FEED_INTERVAL   = 'bt_reminder_feed_ms';
const CFG_SLEEP_THRESHOLD = 'bt_reminder_sleep_ms';

// ── Core: show a notification via SW (best-effort fallback to Notification API) ─

/**
 * Show a notification using the Service Worker registration if available.
 * Falls back to the Notification API for browsers without SW notification support.
 * @param {string} title
 * @param {NotificationOptions & {data?: object}} options
 */
export async function showNotification(title, options = {}) {
  if (Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        icon:  '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-192.png',
        vibrate: [200, 100, 200],
        ...options,
      });
    } else {
      new Notification(title, { icon: '/assets/icons/icon-192.png', ...options });
    }
  } catch {
    // Notification blocked or SW not available
  }
}

// ── Appointment Reminders ─────────────────────────────────────────────────────

const _apptTimers = new Map(); // apptId → timerId

/**
 * Schedule a notification 24h before an appointment.
 * Replaces any existing timer for the same appointment.
 * @param {{ id: string, ts: number, title: string }} appt
 */
export function scheduleApptReminder(appt) {
  const delay = appt.ts - Date.now() - 24 * 3600_000;
  if (delay <= 0 || delay > 7 * 24 * 3600_000) return;

  cancelApptReminder(appt.id);
  const timer = setTimeout(async () => {
    _apptTimers.delete(appt.id);
    await showNotification('🏥 Arzttermin morgen', {
      body: appt.title,
      tag:  `appt-${appt.id}`,
      data: { page: 'gesundheit' },
    });
  }, delay);
  _apptTimers.set(appt.id, timer);
}

/**
 * Cancel a scheduled appointment reminder.
 * @param {string} apptId
 */
export function cancelApptReminder(apptId) {
  const t = _apptTimers.get(apptId);
  if (t !== undefined) { clearTimeout(t); _apptTimers.delete(apptId); }
}

// ── Feeding Interval Reminder ─────────────────────────────────────────────────

let _feedTimer = null;
let _feedIntervalMs = 0;

/**
 * Start showing a "Zeit für die Fütterung" reminder every intervalMs ms.
 * Pass 0 to disable.
 * @param {number} intervalMs
 */
export async function startFeedingReminder(intervalMs) {
  stopFeedingReminder();
  _feedIntervalMs = intervalMs;
  await cfgSet(CFG_FEED_INTERVAL, intervalMs);
  if (!intervalMs) return;

  _feedTimer = setInterval(async () => {
    await showNotification('🍼 Fütterung', {
      body: `Es sind ${Math.round(intervalMs / 3_600_000)} Stunden seit der letzten Erinnerung vergangen.`,
      tag:  'feed-reminder',
      data: { page: 'home' },
    });
  }, intervalMs);
}

/**
 * Stop the feeding reminder.
 */
export function stopFeedingReminder() {
  if (_feedTimer !== null) { clearInterval(_feedTimer); _feedTimer = null; }
}

export function getFeedIntervalMs() { return _feedIntervalMs; }

// ── Sleep Overshoot Monitor ───────────────────────────────────────────────────

let _sleepTimer   = null;
let _sleepThreshMs = 0;
let _sleepAlerted = false;

/**
 * Start monitoring for a baby sleeping longer than thresholdMs.
 * Calls getSleepStartFn() to get the current sleep start timestamp (or null).
 * @param {number}    thresholdMs
 * @param {()=>number|null} getSleepStart — returns current sleep start ts or null
 */
export async function startSleepMonitor(thresholdMs, getSleepStart) {
  stopSleepMonitor();
  _sleepThreshMs = thresholdMs;
  _sleepAlerted  = false;
  await cfgSet(CFG_SLEEP_THRESHOLD, thresholdMs);
  if (!thresholdMs || !getSleepStart) return;

  _sleepTimer = setInterval(async () => {
    const start = getSleepStart();
    if (!start) { _sleepAlerted = false; return; }
    const elapsed = Date.now() - start;
    if (elapsed >= thresholdMs && !_sleepAlerted) {
      _sleepAlerted = true;
      const hours = (elapsed / 3_600_000).toFixed(1).replace('.', ',');
      await showNotification('😴 Langes Schläfchen', {
        body: `Das Baby schläft seit ${hours} Stunden.`,
        tag:  'sleep-overshoot',
        data: { page: 'home' },
      });
    }
    if (elapsed < thresholdMs) _sleepAlerted = false;
  }, 60_000); // check every minute
}

/**
 * Stop the sleep overshoot monitor.
 */
export function stopSleepMonitor() {
  if (_sleepTimer !== null) { clearInterval(_sleepTimer); _sleepTimer = null; }
}

export function getSleepThresholdMs() { return _sleepThreshMs; }

// ── Boot initialisation ───────────────────────────────────────────────────────

/**
 * Restore reminder settings from config on app boot.
 * @param {()=>number|null} getSleepStart
 */
export async function initReminders(getSleepStart) {
  const feedMs  = await cfgGet(CFG_FEED_INTERVAL,   0);
  const sleepMs = await cfgGet(CFG_SLEEP_THRESHOLD, 0);
  if (feedMs)  await startFeedingReminder(feedMs);
  if (sleepMs) await startSleepMonitor(sleepMs, getSleepStart);
}
