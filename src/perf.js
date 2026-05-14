// ─── perf.js — Performance utilities: pagination, lazy loading, aggregation ──
// Prevents full-table scans and DOM flooding with large datasets.

import { getEntriesByChildRange, getEntriesByChild, STORES } from './storage.js';
import { startOfDay, endOfDay, toLocalDateStr } from './helpers.js';
import { sleepMsForDay } from './sleep.js';

// ── Pagination ────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 30; // entries per page in Verlauf

/**
 * Get a single page of entries across all types, sorted by ts desc.
 * Uses indexed range queries — never loads entire table.
 * @param {string} childId
 * @param {number} page   — 0-indexed
 * @param {number} [daysBack=30]  — how many days back to search
 * @returns {Promise<{items: object[], hasMore: boolean}>}
 */
export async function getVerlaufPage(childId, page = 0, daysBack = 30) {
  const to   = endOfDay(new Date());
  const from = (() => {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    return startOfDay(d);
  })();

  const [sleep, feed, diaper] = await Promise.all([
    getEntriesByChildRange(STORES.SLEEP,  childId, from, to),
    getEntriesByChildRange(STORES.FEED,   childId, from, to),
    getEntriesByChildRange(STORES.DIAPER, childId, from, to),
  ]);

  const all = [
    ...sleep.map(e  => ({ ...e, _type: 'sleep'  })),
    ...feed.map(e   => ({ ...e, _type: 'feed'   })),
    ...diaper.map(e => ({ ...e, _type: 'diaper' })),
  ].sort((a, b) => b.ts - a.ts);

  const start   = page * PAGE_SIZE;
  const items   = all.slice(start, start + PAGE_SIZE);
  const hasMore = all.length > start + PAGE_SIZE;
  return { items, hasMore, total: all.length };
}

// ── Daily Summary Cache ───────────────────────────────────────────────────────

/**
 * Compute and cache daily summaries for the last N days.
 * Much cheaper than re-querying all entries on every render.
 * @param {string} childId
 * @param {number} days
 * @returns {Promise<Array<{date: string, sleepMs: number, feeds: number, diapers: number}>>}
 */
export async function getDailySummaries(childId, days = 7) {
  const summaries = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const from = startOfDay(d);
    const to   = endOfDay(d);

    const [sleep, feed, diaper] = await Promise.all([
      getEntriesByChildRange(STORES.SLEEP,  childId, from, to),
      getEntriesByChildRange(STORES.FEED,   childId, from, to),
      getEntriesByChildRange(STORES.DIAPER, childId, from, to),
    ]);

    summaries.push({
      date:    toLocalDateStr(d),
      sleepMs: sleepMsForDay(sleep, d),
      feeds:   feed.length,
      diapers: diaper.length,
    });
  }
  return summaries;
}

// ── DOM render batching ───────────────────────────────────────────────────────

/**
 * Render a list of items into a container using DocumentFragment.
 * Avoids multiple reflows by batching all DOM writes.
 * @param {HTMLElement} container
 * @param {string[]} htmlItems  — array of HTML strings
 */
export function batchRender(container, htmlItems) {
  const frag = document.createDocumentFragment();
  const tmp  = document.createElement('div');
  tmp.innerHTML = htmlItems.join('');
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);
  container.innerHTML = '';
  container.appendChild(frag);
}

// ── Event listener registry (leak prevention) ────────────────────────────────

const _listeners = new Map(); // key → { el, event, fn }

/**
 * Add a tracked event listener. Automatically removes old one if key reused.
 * @param {string} key      — unique name e.g. 'homeScroll'
 * @param {EventTarget} el
 * @param {string} event
 * @param {Function} fn
 * @param {object} [opts]
 */
export function addTrackedListener(key, el, event, fn, opts) {
  removeTrackedListener(key);
  el.addEventListener(event, fn, opts);
  _listeners.set(key, { el, event, fn, opts });
}

/**
 * Remove a tracked listener by key.
 * @param {string} key
 */
export function removeTrackedListener(key) {
  const tracked = _listeners.get(key);
  if (tracked) {
    tracked.el.removeEventListener(tracked.event, tracked.fn, tracked.opts);
    _listeners.delete(key);
  }
}

/**
 * Remove all tracked listeners (e.g. on page hide).
 */
export function cleanupAllListeners() {
  for (const [key] of _listeners) removeTrackedListener(key);
}

// ── Intersection Observer for lazy SVG rendering ─────────────────────────────

/**
 * Render an SVG chart only when its container is visible in the viewport.
 * @param {string} containerId
 * @param {Function} renderFn
 */
export function lazyRenderChart(containerId, renderFn) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Already visible — render immediately
  const rect = el.getBoundingClientRect();
  if (rect.top < window.innerHeight && rect.bottom > 0) {
    renderFn();
    return;
  }

  // Defer until visible
  const obs = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        renderFn();
        obs.disconnect();
      }
    }
  }, { rootMargin: '100px' });
  obs.observe(el);
}
