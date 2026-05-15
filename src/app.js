// ─── app.js — Main application controller (ES Module entry point) ─────────────
// Wires together: config, storage, firebase, sleep, UI rendering.
// Loaded as <script type="module" src="src/app.js"> in index.html.

import {
  loadCfg, saveCfg, getCfg, patchCfg,
  getChildren, getChild, addChild, updateChild, deleteChild,
  getActiveChild, setActiveChild,
  getTheme, applyTheme, toggleTheme,
  hasOnboarded, setOnboarded, getFamilyId,
  genderLabel, genderEmoji,
} from './config.js';

import {
  openDB, STORES,
  addEntry, updateEntry, deleteEntry, getEntry,
  getEntriesByChild, getEntriesByChildRange,
  exportDB, importDB, bulkPut,
} from './storage.js';

import { initFB, fbWrite, fbDelete, syncUp, fbReady, fbRegisterMember } from './firebase.js';

import {
  validateSleepEntry, normalizeSleepEntry,
  sleepDuration, isSleeping, crossesMidnight,
  dailySleepTotals, sleepEntriesForDay, sleepMsForDay,
  parseFixStart,
  activeSleepGuard,
} from './sleep.js';

import {
  pad, fmtDur, fmtDurLong, fmtTime, fmtDate, fmtDateShort, fmtShort,
  addMin, ageExact, ageMonths, toLocalDateStr, startOfDay, endOfDay,
  uid, deepClone, debounce, escHtml, fmtWeight, fmtHeight,
} from './helpers.js';

import { DEVICE_ID, PRESET_MILESTONES, ICONS } from './constants.js';
import { sanitize, esc, csvCell, validateImport, clampStr, safeFilename, MAX_LENGTHS } from './security.js';
import { getDailySummaries, getVerlaufPage, batchRender, lazyRenderChart, addTrackedListener, cleanupAllListeners, PAGE_SIZE } from './perf.js';
import { takeSnapshot, previewRestore, safeRestore, rollbackToSnapshot, getSnapshot, clearSnapshot } from './restore.js';
import { initSyncRevision } from './conflict.js';
import { softDelete, filterDeleted, getActiveEntries, getRecentlyDeleted, purgeTombstones } from './tombstone.js';
import { openDebugPanel, attachDebugTrigger, isDebugMode, startQuarantineMonitor } from './debug.js';
import { renderGrowthSVG, buildGrowthList } from './growth.js';
import {
  showNotification, scheduleApptReminder, cancelApptReminder,
  startFeedingReminder, stopFeedingReminder, getFeedIntervalMs,
  startSleepMonitor, stopSleepMonitor, getSleepThresholdMs,
  initReminders,
} from './notif.js';
import { t, setLanguage, getLanguage, applyI18n } from './i18n.js';

// ── State ─────────────────────────────────────────────────────────────────────
let cfg          = null;
let _verlaufPage = 0; // current pagination page for Verlauf (perf.js)
let activeChild  = null;
let currentPage  = 'home';
let isOnline     = navigator.onLine;
let deferredPWA  = null;   // beforeinstallprompt event

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await boot();
  } catch (err) {
    console.error('[App] Boot error:', err);
    showToast(t('toast.start_error'), 'error');
  }
});

async function boot() {
  // 1. DB
  await openDB();
  await initSyncRevision(); // restore syncRevision from IDB if localStorage was cleared

  // 2. Config
  cfg = await loadCfg();
  activeChild = await getActiveChild();

  // 3. Theme
  await applyTheme(cfg.theme || 'light');

  document.documentElement.lang = getLanguage();
  applyI18n();

  // 4. Firebase (non-blocking)
  showFbLoading();
  initFB().then(ok => {
    hideFbLoading();
    if (ok) {
      getFamilyId().then(fid => {
        fbRegisterMember(fid);
        syncUp();
      });
    }
  });

  // 5. Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => {
        reg.addEventListener('updatefound', () => showUpdateBanner());
      })
      .catch(err => console.warn('[SW] Registration failed:', err));
    // Listen for sync requests from SW
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_REQUESTED') syncUp();
    });
  }

  // 6. Online/offline
  window.addEventListener('online',  () => { isOnline = true;  updateOnlineStatus(); syncUp(); });
  window.addEventListener('offline', () => { isOnline = false; updateOnlineStatus(); });
  updateOnlineStatus();

  // 7. PWA install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPWA = e;
    showPWAInstallBtn();
  });

  // 8. Bottom nav
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  // 9. Onboarding
  if (!(await hasOnboarded())) {
    setTimeout(showOnboarding, 500);
  }

  // 10. Render initial page
  await showPage('home');

  // 11. Notification banner (delayed)
  setTimeout(showNotifBannerIfNeeded, 2000);
}

// ── Navigation ────────────────────────────────────────────────────────────────

/**
 * Show a page and update nav state.
 * @param {string} pageId
 */
async function showPage(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Show target
  const target = document.querySelector(`.page[data-page="${pageId}"]`) || $(`page-${pageId}`);
  if (target) target.classList.add('active');

  // Update nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  currentPage = pageId;

  // Render page data
  switch (pageId) {
    case 'home':       await renderHome();       break;
    case 'tracker':    await renderTracker();    break;
    case 'stats':      await renderStats();      break;
    case 'verlauf':    await renderVerlauf();    break;
    case 'wachstum':   await renderWachstum();   break;
    case 'meilensteine': await renderMilestones(); break;
    case 'gesundheit': await renderGesundheit(); break;
    case 'tagesplan':  await renderTagesplan();  break;
    case 'einstellungen': await renderSettings(); break;
  }
}

// ── Home page ─────────────────────────────────────────────────────────────────

async function renderHome() {
  if (!activeChild) { renderNoChild('home'); return; }
  const today    = new Date();
  const todayStart = startOfDay(today);
  const todayEnd   = endOfDay(today);
  // 48h window covers: sleep started yesterday and still open (crosses midnight),
  // plus all of today — avoids full-table scan of all entries ever.
  const sleep48hStart = todayStart - 48 * 3600_000;

  const [sleepEntries, feedEntries, diaperEntries] = await Promise.all([
    getEntriesByChildRange(STORES.SLEEP,  activeChild.id, sleep48hStart, todayEnd),
    getEntriesByChildRange(STORES.FEED,   activeChild.id, todayStart,    todayEnd),
    getEntriesByChildRange(STORES.DIAPER, activeChild.id, todayStart,    todayEnd),
  ]);

  const todaysSleep  = sleepEntriesForDay(sleepEntries, today);
  const totalSleepMs = todaysSleep.reduce((s, e) => s + (sleepDuration(e) || 0), 0);
  const currentSleep = sleepEntries.find(isSleeping);

  // Update summary cards
  const elSleep = $('home-sleep');
  if (elSleep) elSleep.textContent = fmtDur(totalSleepMs) || '—';

  const elFeed = $('home-feed');
  if (elFeed) elFeed.textContent = feedEntries.length || 0;

  const elDiaper = $('home-diaper');
  if (elDiaper) elDiaper.textContent = diaperEntries.length || 0;

  // Child name & age
  const elName = $('home-child-name');
  if (elName) elName.textContent = activeChild.name;
  const elAge = $('home-child-age');
  if (elAge) elAge.textContent = ageExact(activeChild.birthday);

  // Current sleep button state
  const sleepBtn = $('btn-sleep-toggle');
  if (sleepBtn) {
    if (currentSleep) {
      sleepBtn.textContent = t('home.btn.sleep.active', { time: fmtTime(currentSleep.ts) });
      sleepBtn.classList.add('active');
    } else {
      sleepBtn.textContent = t('home.btn.sleep');
      sleepBtn.classList.remove('active');
    }
  }

  await renderTodayLog();
}

async function renderTodayLog() {
  const logEl = $('today-log');
  if (!logEl || !activeChild) return;
  const today = new Date();
  const from  = startOfDay(today);
  const to    = endOfDay(today);

  const [sleep, feed, diaper] = await Promise.all([
    getEntriesByChildRange(STORES.SLEEP,   activeChild.id, from, to),
    getEntriesByChildRange(STORES.FEED,    activeChild.id, from, to),
    getEntriesByChildRange(STORES.DIAPER,  activeChild.id, from, to),
  ]);

  const all = [
    ...sleep.map(e => ({ ...e, _type: 'sleep' })),
    ...feed.map(e => ({ ...e, _type: 'feed' })),
    ...diaper.map(e => ({ ...e, _type: 'diaper' })),
  ].sort((a, b) => b.ts - a.ts);

  if (!all.length) {
    logEl.innerHTML = `<p class="empty-state">${t('home.empty')}</p>`;
    return;
  }

  logEl.innerHTML = all.map(e => {
    switch (e._type) {
      case 'sleep':
        return `<div class="log-item">
          <span class="log-icon">${isSleeping(e) ? '😴' : '💤'}</span>
          <span>${fmtTime(e.ts)}${e.end ? ' → ' + fmtTime(e.end) : ' (schläft)'} · ${fmtDur(sleepDuration(e)) || '…'}</span>
        </div>`;
      case 'feed':
        return `<div class="log-item">
          <span class="log-icon">🍼</span>
          <span>${fmtTime(e.ts)} · ${e.amount ? e.amount + ' ml' : esc(e.type) || 'Fütterung'}</span>
        </div>`;
      case 'diaper':
        return `<div class="log-item">
          <span class="log-icon">🧷</span>
          <span>${fmtTime(e.ts)} · ${esc(e.kind) || 'Windel'}</span>
        </div>`;
      default: return '';
    }
  }).join('');
}

// ── Sleep toggle ──────────────────────────────────────────────────────────────

window.toggleSleep = async function() {
  if (!activeChild) { showToast(t('toast.no_child')); return; }
  const entries = await getEntriesByChild(STORES.SLEEP, activeChild.id);
  const ongoing = entries.find(isSleeping);

  if (ongoing) {
    // End sleep
    const end    = Date.now();
    const updated = await updateEntry(STORES.SLEEP, ongoing.id, { end });
    await fbWriteEntry(STORES.SLEEP, updated);
    showToast(t('toast.woke_up', { duration: fmtDur(end - ongoing.ts) }));
  } else {
    // Start sleep — guard against duplicate open sessions
    const guard = activeSleepGuard(entries);
    if (guard) { showToast(guard, 'error'); return; }
    const entry = await addEntry(STORES.SLEEP, {
      childId: activeChild.id,
      ts:      Date.now(),
      end:     null,
    }, DEVICE_ID);
    await fbWriteEntry(STORES.SLEEP, entry);
    showToast(t('toast.sleeping'));
  }
  await renderHome();
};

// ── Fix Sleep Start ───────────────────────────────────────────────────────────

window.openFixStartModal = async function() {
  const entries = await getEntriesByChild(STORES.SLEEP, activeChild?.id || '');
  const ongoing = entries.find(isSleeping);
  if (!ongoing) { showToast(t('toast.no_sleep')); return; }
  $('fs-entry-id').value  = ongoing.id;
  $('fs-time-input').value = fmtTime(ongoing.ts);
  // Default: today
  document.querySelectorAll('#fs-day-btns button').forEach(b =>
    b.classList.toggle('active', b.dataset.day === 'today')
  );
  $('fix-start-modal').classList.remove('hidden');
};

window.saveFixStart = async function() {
  const id      = $('fs-entry-id').value;
  const timeStr = $('fs-time-input').value;
  const dayBtn  = document.querySelector('#fs-day-btns button.active');
  const day     = dayBtn?.dataset.day || 'today';

  const { ts, errors } = parseFixStart({ timeStr, day, nowTs: Date.now() });
  if (errors.length) { showToast(errors.join(' '), 'error'); return; }

  const entry   = await getEntry(STORES.SLEEP, id);
  if (!entry) { showToast(t('toast.entry_not_found'), 'error'); return; }

  // If there's an end time, validate end > new start
  if (entry.end && entry.end <= ts) {
    showToast(t('toast.sleep_before_end'), 'error'); return;
  }

  const updated = await updateEntry(STORES.SLEEP, id, { ts });
  await fbWriteEntry(STORES.SLEEP, updated);
  closeModal('fix-start-modal');
  showToast(t('toast.sleep_fixed'));
  await renderHome();
};

// ── Stats page ────────────────────────────────────────────────────────────────

async function renderStats() {
  if (!activeChild) { renderNoChild('stats'); return; }

  // getDailySummaries uses indexed range queries only (no full-table scans)
  const summaries    = await getDailySummaries(activeChild.id, 7);
  const totalMs      = summaries.reduce((s, d) => s + d.sleepMs, 0);
  const totalFeed    = summaries.reduce((s, d) => s + d.feeds,   0);
  const totalDiaper  = summaries.reduce((s, d) => s + d.diapers, 0);

  const elTotalSleep  = $('total-sleep');
  const elTotalFeed   = $('total-feed');
  const elTotalDiaper = $('total-diaper');
  if (elTotalSleep)  elTotalSleep.textContent  = fmtDur(totalMs) || '—';
  if (elTotalFeed)   elTotalFeed.textContent   = totalFeed;
  if (elTotalDiaper) elTotalDiaper.textContent = totalDiaper;

  // Bar chart still needs per-entry data — fetch last 7 days only via range
  const now      = new Date();
  const weekAgo  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const sleepEntries = await getEntriesByChildRange(STORES.SLEEP, activeChild.id, startOfDay(weekAgo), endOfDay(now));
  renderSleepBarChart(sleepEntries);
}

function renderSleepBarChart(entries) {
  const canvas = $('sleep-chart-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const totals = dailySleepTotals(entries, 7);
  const maxMs  = Math.max(...totals.map(d => d.ms), 1);

  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const barW   = Math.floor(W / totals.length) - 6;
  const padL   = 4;
  const maxBarH = H - 28;

  totals.forEach((day, i) => {
    const x     = padL + i * (barW + 6);
    const barH  = Math.round((day.ms / maxMs) * maxBarH);
    const y     = H - 20 - barH;
    const color = day.ms >= 10 * 3600000 ? '#8b5cf6' : day.ms >= 6 * 3600000 ? '#a78bfa' : '#c4b5fd';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect?.(x, y, barW, barH, 4) || ctx.rect(x, y, barW, barH);
    ctx.fill();
    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(day.label, x + barW / 2, H - 4);
  });
}

// ── Wachstum (Growth) ─────────────────────────────────────────────────────────

async function updateGrowthView(type = 'weight') {
  if (!activeChild) return;
  const entries = await getEntriesByChild(STORES.HEALTH, activeChild.id);

  const percentile = renderGrowthSVG($('growth-svg'), type, entries, activeChild.birthday, activeChild.gender);

  const badgeEl = $('growth-percentile');
  if (badgeEl) {
    if (percentile) {
      badgeEl.textContent = t('growth.percentile.current', { value: percentile });
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  ['weight', 'height', 'head'].forEach(t => {
    const panel = $(`growth-${t}-panel`);
    if (panel) panel.style.display = t === type ? '' : 'none';
  });
  document.querySelectorAll('#growth-type-btns .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === type));

  const listEl = $(`growth-${type}-list`);
  if (listEl) listEl.innerHTML = buildGrowthList(entries, type, activeChild.birthday);
}

async function renderWachstum() {
  if (!activeChild) { renderNoChild('wachstum'); return; }
  const activeType = document.querySelector('#growth-type-btns .seg-btn.active')?.dataset.type || 'weight';
  await updateGrowthView(activeType);
}

// ── Meilensteine ──────────────────────────────────────────────────────────────

async function renderMilestones() {
  if (!activeChild) { renderNoChild('meilensteine'); return; }
  const entries = await getEntriesByChild(STORES.MILESTONE, activeChild.id);
  const done = new Set(entries.map(e => e.label));
  const listEl = $('milestone-list');
  if (!listEl) return;
  listEl.innerHTML = PRESET_MILESTONES.map(m => `
    <label class="milestone-item${done.has(m.label) ? ' done' : ''}">
      <input type="checkbox" ${done.has(m.label) ? 'checked' : ''}
        onchange="toggleMilestone(${JSON.stringify(m.label)}, this.checked)">
      <span>${m.emoji} ${m.label}</span>
      ${done.has(m.label) ? `<span class="done-date">${fmtDate(entries.find(e => e.label === m.label)?.ts)}</span>` : `<small>${m.months} M</small>`}
    </label>`).join('');
}

window.toggleMilestone = async function(label, checked) {
  if (!activeChild) return;
  const entries = await getEntriesByChild(STORES.MILESTONE, activeChild.id);
  const existing = entries.find(e => e.label === label);
  if (checked && !existing) {
    const entry = await addEntry(STORES.MILESTONE, { childId: activeChild.id, ts: Date.now(), label }, DEVICE_ID);
    await fbWriteEntry(STORES.MILESTONE, entry);
  } else if (!checked && existing) {
    const _mPath = fbPath(STORES.MILESTONE, existing.id).replace('/' + existing.id, '');
    await softDelete(STORES.MILESTONE, existing.id, _mPath, DEVICE_ID);
  }
  await renderMilestones();
};

// ── Gesundheit ────────────────────────────────────────────────────────────────

async function renderGesundheit() {
  if (!activeChild) { renderNoChild('gesundheit'); return; }
  const entries = await getEntriesByChild(STORES.HEALTH, activeChild.id);
  const appts   = await getEntriesByChild(STORES.APPT,   activeChild.id);

  const weightEl = $('health-weight-list');
  const heightEl = $('health-height-list');
  const apptEl   = $('appt-list');

  if (weightEl) {
    const ws = entries.filter(e => e.type === 'weight').slice(0, 5);
    weightEl.innerHTML = ws.length
      ? ws.map(e => `<div class="log-item"><span>⚖️</span><span>${fmtDate(e.ts)} · ${fmtWeight(e.value)}</span></div>`).join('')
      : '<p class="empty-state">Noch kein Gewicht eingetragen.</p>';
  }
  if (heightEl) {
    const hs = entries.filter(e => e.type === 'height').slice(0, 5);
    heightEl.innerHTML = hs.length
      ? hs.map(e => `<div class="log-item"><span>📏</span><span>${fmtDate(e.ts)} · ${fmtHeight(e.value)}</span></div>`).join('')
      : '<p class="empty-state">Noch keine Größe eingetragen.</p>';
  }
  if (apptEl) {
    apptEl.innerHTML = appts.length
      ? appts.map(a => `<div class="log-item">
          <span>🏥</span>
          <div><strong>${escHtml(a.title)}</strong><br>
          <small>${fmtDate(a.ts)} ${fmtTime(a.ts)}</small></div>
          <button class="icon-btn danger" onclick="deleteAppt(${JSON.stringify(a.id)})">🗑️</button>
        </div>`).join('')
      : '<p class="empty-state">Keine Arzttermine.</p>';
  }
}

window.addHealthEntry = async function(type, value, ts = Date.now()) {
  if (!activeChild || isNaN(value) || value <= 0) return;
  const entry = await addEntry(STORES.HEALTH, { childId: activeChild.id, ts, type, value }, DEVICE_ID);
  await fbWriteEntry(STORES.HEALTH, entry);
  showToast(t('toast.health_saved'));
  await updateGrowthView(type);
  await renderGesundheit();
};

window.deleteHealthEntry = async function(id) {
  if (!activeChild) return;
  const path = fbPath(STORES.HEALTH, id).replace('/' + id, '');
  await softDelete(STORES.HEALTH, id, path, DEVICE_ID);
  showToast(t('toast.entry_deleted'));
  const activeType = document.querySelector('#growth-type-btns .seg-btn.active')?.dataset.type || 'weight';
  await updateGrowthView(activeType);
  await renderGesundheit();
};

window.addAppt = async function() {
  if (!activeChild) return;
  const title   = clampStr($('appt-title')?.value?.trim() || '', MAX_LENGTHS.apptTitle);
  const dateStr = $('appt-date')?.value;
  const timeStr = $('appt-time')?.value || '00:00';
  if (!title || !dateStr) { showToast(t('toast.appt_fields'), 'error'); return; }
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min]  = timeStr.split(':').map(Number);
  const ts = new Date(y, m - 1, d, h, min, 0, 0).getTime();
  const entry = await addEntry(STORES.APPT, { childId: activeChild.id, ts, title }, DEVICE_ID);
  await fbWriteEntry(STORES.APPT, entry);
  scheduleApptNotif(entry);
  showToast(t('toast.appt_saved'));
  if ($('appt-title')) $('appt-title').value = '';
  if ($('appt-date'))  $('appt-date').value  = '';
  await renderGesundheit();
};

window.deleteAppt = async function(id) {
  cancelApptReminder(id);
  const _aPath = fbPath(STORES.APPT, id).replace('/' + id, '');
  await softDelete(STORES.APPT, id, _aPath, DEVICE_ID);
  await renderGesundheit();
};

function scheduleApptNotif(entry) {
  scheduleApptReminder(entry);
}

// ── Tagesplan ─────────────────────────────────────────────────────────────────

async function renderTagesplan() {
  if (!activeChild) { renderNoChild('tagesplan'); return; }
  const today   = new Date();
  const from    = startOfDay(today);
  const to      = endOfDay(today);
  const entries = await getEntriesByChildRange(STORES.TAGESPLAN, activeChild.id, from, to);
  const listEl  = $('tagesplan-list');
  if (!listEl) return;
  if (!entries.length) {
    listEl.innerHTML = `<p class="empty-state">${t('tagesplan.empty')}</p>`;
    return;
  }
  listEl.innerHTML = entries
    .sort((a, b) => a.ts - b.ts)
    .map(e => `<div class="log-item tagesplan-item${e.done ? ' done' : ''}">
      <input type="checkbox" ${e.done ? 'checked' : ''}
        onchange="toggleTagesplan(${JSON.stringify(e.id)}, this.checked)">
      <span>${fmtTime(e.ts)} · ${escHtml(e.label)}</span>
      <button class="icon-btn danger" onclick="deleteTagesplan(${JSON.stringify(e.id)})">🗑️</button>
    </div>`).join('');
}

window.toggleTagesplan = async function(id, done) {
  await updateEntry(STORES.TAGESPLAN, id, { done });
  await renderTagesplan();
};

window.deleteTagesplan = async function(id) {
  const _tPath = fbPath(STORES.TAGESPLAN, id).replace('/' + id, '');
  await softDelete(STORES.TAGESPLAN, id, _tPath, DEVICE_ID);
  await renderTagesplan();
};

// ── Settings ──────────────────────────────────────────────────────────────────

async function renderSettings() {
  cfg = await getCfg();
  const children = await getChildren();
  const listEl = $('children-list');
  if (listEl) {
    listEl.innerHTML = children.length
      ? children.map(c => `
          <div class="child-item${c.id === cfg.activeChildId ? ' active' : ''}"
               onclick="switchChild(${JSON.stringify(c.id)})">
            <span class="child-emoji">${genderEmoji(c.gender)}</span>
            <div>
              <strong>${escHtml(c.name)}</strong>
              <small>${c.birthday ? ageExact(c.birthday) : ''}</small>
            </div>
            ${c.id === cfg.activeChildId ? '<span class="active-badge">✓ Aktiv</span>' : ''}
          </div>`).join('')
      : '<p class="empty-state">Noch kein Kind. Füge eines hinzu!</p>';
  }

  // Language selector
  const langSel = $('language-select');
  if (langSel) langSel.value = getLanguage();

  // Theme toggle
  const themeBtn = $('theme-toggle');
  if (themeBtn) {
    themeBtn.textContent = cfg.theme === 'light' ? t('settings.btn.dark_mode') : t('settings.btn.light_mode');
  }
}

window.switchChild = async function(id) {
  await setActiveChild(id);
  activeChild = await getActiveChild();
  cfg = await getCfg();
  showToast(t('toast.active_child', { name: activeChild?.name }));
  await renderSettings();
  await renderHome();
};

window.openAddChild = function() {
  $('add-child-modal')?.classList.remove('hidden');
};

window.saveNewChild = async function() {
  const name     = $('new-child-name')?.value?.trim();
  const gender   = $('new-child-gender')?.value || 'none';
  const birthday = $('new-child-birthday')?.value || '';
  if (!name) { showToast(t('toast.child_name_required'), 'error'); return; }
  const child = await addChild({ name, gender, birthday });
  activeChild = await getActiveChild();
  closeModal('add-child-modal');
  showToast(t('toast.child_added', { name: child.name }));
  await renderSettings();
};

// ── Reminder settings UI ──────────────────────────────────────────────────────

function renderReminderSettings() {
  const feedSel  = $('feed-reminder-interval');
  const sleepSel = $('sleep-reminder-threshold');
  if (feedSel)  feedSel.value  = String(getFeedIntervalMs());
  if (sleepSel) sleepSel.value = String(getSleepThresholdMs());
}

window.setFeedReminder = async function(val) {
  const ms = parseInt(val, 10) || 0;
  if (ms) await startFeedingReminder(ms);
  else stopFeedingReminder();
};

window.setSleepReminder = async function(val) {
  const ms = parseInt(val, 10) || 0;
  const getSleepStart = () => {
    try { return JSON.parse(localStorage.getItem('bt_active_sleep') || 'null')?.ts ?? null; }
    catch { return null; }
  };
  if (ms) await startSleepMonitor(ms, getSleepStart);
  else stopSleepMonitor();
};

// ── Theme toggle ──────────────────────────────────────────────────────────────
window.toggleThemeUI = async function() {
  const next = await toggleTheme();
  cfg = await getCfg();
  showToast(next === 'light' ? t('toast.theme.light') : t('toast.theme.dark'));
  await renderSettings();
};

// ── Language switcher ─────────────────────────────────────────────────────────
window.setAppLanguage = async function(lang) {
  setLanguage(lang);
  document.documentElement.lang = lang;
  applyI18n();
  // Re-render current page content
  switch (currentPage) {
    case 'home':           await renderHome();        break;
    case 'tracker':        await renderTracker();     break;
    case 'stats':          await renderStats();       break;
    case 'verlauf':        await renderVerlauf();     break;
    case 'wachstum':       await renderWachstum();    break;
    case 'meilensteine':   await renderMilestones();  break;
    case 'gesundheit':     await renderGesundheit();  break;
    case 'tagesplan':      await renderTagesplan();   break;
    case 'einstellungen':  await renderSettings();    break;
  }
};
window.setAppLanguage = window.setAppLanguage; // expose for onclick

// ── Backup / Restore ──────────────────────────────────────────────────────────
window.backupJSON = async function() {
  const data = await exportDB();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `baby-tracker-backup-${toLocalDateStr(new Date())}.json`;
  a.click();
  showToast(t('toast.backup_created'));
};

window.restoreJSON = function() {
  const inp = document.createElement('input');
  inp.type   = 'file';
  inp.accept = '.json';
  inp.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let data;
      try { data = JSON.parse(text); } catch { showToast(t('toast.json_invalid'), 'error'); return; }

      // 1. Security validation
      const { ok, errors } = validateImport(data, file.size);
      if (!ok) {
        showToast(t('toast.backup_invalid', { reason: errors[0] }), 'error');
        return;
      }

      // 2. Preview diff — show what will change
      const preview = await previewRestore(data);
      window._restoreData = data; // stash for modal confirm
      showRestorePreviewModal(preview);
    } catch (err) {
      showToast(t('toast.error', { message: err.message }), 'error');
    }
  };
  inp.click();
};

function showRestorePreviewModal(preview) {
  const warnings = preview.warnings.map(w => `<p class="restore-warning">${w}</p>`).join('');
  const stats = preview.storeStats
    .filter(s => s.inBackup > 0 || s.inDB > 0)
    .map(s => `<tr><td>${s.store}</td><td>${s.inDB}</td><td>${s.inBackup}</td><td class="text-green">+${s.new}</td><td class="text-yellow">${s.conflicts}</td></tr>`)
    .join('');

  const html = `
    <div id="restore-preview-modal" class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal-card" style="max-width:480px">
        <h3>📦 Backup-Vorschau</h3>
        ${warnings}
        <p>Backup-Datum: <strong>${preview.exportedAt ? new Date(preview.exportedAt).toLocaleString('de-DE') : 'Unbekannt'}</strong></p>
        <table class="restore-table" style="width:100%;font-size:.8rem;margin:.75rem 0">
          <thead><tr><th>Store</th><th>Aktuell</th><th>Backup</th><th>Neu</th><th>Konflikte</th></tr></thead>
          <tbody>${stats}</tbody>
        </table>
        <p style="font-size:.8rem;color:var(--text-muted)">
          ${preview.newEntries} neue Einträge · ${preview.duplicates} Duplikate · ${preview.conflicts} Konflikte
        </p>
        <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:1rem">
          <button class="btn-primary" onclick="confirmRestore('overwrite')">
            🔄 Überschreiben (alle Daten ersetzen)
          </button>
          <button class="btn-secondary" onclick="confirmRestore('merge')">
            🔀 Zusammenführen (nur neue hinzufügen)
          </button>
          <button class="btn-danger" onclick="closeRestoreModal()">Abbrechen</button>
        </div>
        <p style="font-size:.75rem;color:var(--text-muted);margin-top:.5rem">
          ℹ️ Vor dem Restore wird automatisch ein Sicherungs-Snapshot erstellt.
        </p>
      </div>
    </div>`;

  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div.firstElementChild);
}

window.closeRestoreModal = function() {
  document.getElementById('restore-preview-modal')?.remove();
  delete window._restoreData;
};

window.confirmRestore = async function(mode) {
  const data = window._restoreData;
  if (!data) return;
  window.closeRestoreModal();

  showToast(t('toast.restore_running'));
  const result = await safeRestore(data, mode, (step, total, label) => {
    console.info(`[Restore] ${step}/${total}: ${label}`);
  });

  if (result.success) {
    cfg         = await loadCfg();
    activeChild = await getActiveChild();
    const msg   = mode === 'merge'
      ? `Zusammengeführt: ${result.restored} neu, ${result.skipped} übersprungen, ${result.conflicts} Konflikte gelöst ✓`
      : `Wiederhergestellt: ${result.restored} Einträge ✓`;
    showToast(msg);
    await showPage(currentPage);
  } else {
    showToast(t('toast.restore_failed'), 'error');
    result.errors.forEach(e => console.error('[Restore]', e));
  }
};

window.rollbackRestore = async function() {
  if (!getSnapshot()) { showToast(t('toast.no_snapshot'), 'error'); return; }
  if (!confirm(t('confirm.snapshot'))) return;
  const result = await rollbackToSnapshot();
  showToast(result.message, result.success ? 'success' : 'error');
  if (result.success) {
    cfg = await loadCfg();
    activeChild = await getActiveChild();
    await showPage(currentPage);
  }
};

// ── CSV Export ────────────────────────────────────────────────────────────────
window.exportCSV = async function() {
  if (!activeChild) return;
  const sleep  = await getEntriesByChild(STORES.SLEEP,  activeChild.id);
  const feed   = await getEntriesByChild(STORES.FEED,   activeChild.id);
  const diaper = await getEntriesByChild(STORES.DIAPER, activeChild.id);

  const rows = [
    ['Typ','Datum','Uhrzeit','Ende','Dauer/Details'],
    ...sleep.map(e  => ['Schlaf', fmtDate(e.ts), fmtTime(e.ts), fmtTime(e.end), fmtDur(sleepDuration(e))]),
    ...feed.map(e   => ['Fütterung', fmtDate(e.ts), fmtTime(e.ts), '', e.amount ? e.amount + ' ml' : e.type]),
    ...diaper.map(e => ['Windel', fmtDate(e.ts), fmtTime(e.ts), '', e.kind || '']),
  ];

  // csvCell() prevents CSV formula injection (= + - @ prefix)
  const csv  = rows.map(r => r.map(c => csvCell(c)).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `baby-tracker-${safeFilename(activeChild.name)}-${toLocalDateStr(new Date())}.csv`;
  a.click();
  showToast(t('toast.csv_exported'));
};

// ── PWA Install ───────────────────────────────────────────────────────────────
function showPWAInstallBtn() {
  const btn = $('pwa-install-btn');
  if (btn) btn.classList.remove('hidden');
}

window.installPWA = async function() {
  if (!deferredPWA) return;
  deferredPWA.prompt();
  const { outcome } = await deferredPWA.userChoice;
  if (outcome === 'accepted') {
    deferredPWA = null;
    $('pwa-install-btn')?.classList.add('hidden');
    showToast(t('toast.pwa_installed'));
  }
};

// ── Notifications ─────────────────────────────────────────────────────────────
async function showNotifBannerIfNeeded() {
  if (Notification.permission !== 'default') return;
  const banner = $('notif-banner');
  if (banner) banner.classList.remove('hidden');
}

window.requestNotifPermission = async function() {
  const perm = await Notification.requestPermission();
  $('notif-banner')?.classList.add('hidden');
  if (perm === 'granted') showToast(t('toast.notif_enabled'));
};

// ── Online status ─────────────────────────────────────────────────────────────
function updateOnlineStatus() {
  const badge = $('offline-badge');
  if (badge) badge.classList.toggle('hidden', isOnline);
}

// ── Firebase loading overlay ──────────────────────────────────────────────────
function showFbLoading() { $('fb-loading')?.classList.remove('hidden'); }
function hideFbLoading() { $('fb-loading')?.classList.add('hidden'); }

// ── SW update banner ──────────────────────────────────────────────────────────
function showUpdateBanner() {
  const b = $('update-banner');
  if (b) b.classList.remove('hidden');
}
window.reloadSW = () => window.location.reload();

// ── Onboarding ────────────────────────────────────────────────────────────────
function showOnboarding() { $('ob-guide-overlay')?.classList.remove('hidden'); }
window.finishOnboard = async function() {
  await setOnboarded();
  $('ob-guide-overlay')?.classList.add('hidden');
};

// ── Utility UI ────────────────────────────────────────────────────────────────

/**
 * Show a toast message.
 * @param {string} msg
 * @param {'info'|'error'|'success'} type
 */
function showToast(msg, type = 'info') {
  let toast = $('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}
window.showToast = showToast;
window.openDebugPanel = openDebugPanel;

/** Show a toast with an Undo action (5 seconds). */
function showUndoToast(msg, undoFn) {
  let toast = $('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  clearTimeout(toast._timer);
  toast.className = 'toast toast-undo show';
  toast.innerHTML = `<span>${msg}</span><button class="toast-undo-btn" style="background:none;border:none;color:#fff;font-weight:700;cursor:pointer;text-decoration:underline;margin-left:auto">${t('toast.undo')}</button>`;
  let dismissed = false;
  const dismiss = () => { if (!dismissed) { dismissed = true; toast.classList.remove('show'); } };
  toast.querySelector('.toast-undo-btn').onclick = async () => {
    dismiss();
    try { await undoFn(); showToast(t('toast.restored')); }
    catch (e) { showToast(t('toast.error', { message: e.message }), 'error'); }
  };
  toast._timer = setTimeout(dismiss, 5000);
}

function closeModal(id) {
  $(id)?.classList.add('hidden');
}
window.closeModal = closeModal;

function renderNoChild(page) {
  const el = document.querySelector(`.page[data-page="${page}"] .no-child`);
  if (el) el.classList.remove('hidden');
}

// ── Firebase helpers ──────────────────────────────────────────────────────────

function fbPath(store, id) {
  const fid = cfg?.familyId || 'local';
  return `families/${fid}/${store}/${id}`;
}

async function fbWriteEntry(store, entry) {
  await fbWrite(fbPath(store, entry.id), entry);
}

// ── Expose for inline HTML onclick handlers ───────────────────────────────────
window._app = {
  showPage, renderHome, renderStats, cfg: () => cfg,
  activeChild: () => activeChild,
};

// ── Feed entry ────────────────────────────────────────────────────────────────
window._addFeedEntry = async function({ type, amount }) {
  if (!activeChild) { showToast(t('toast.no_child')); return; }
  const entry = await addEntry(STORES.FEED, {
    childId: activeChild.id,
    ts:      Date.now(),
    type,
    amount:  amount || null,
  }, DEVICE_ID);
  await fbWriteEntry(STORES.FEED, entry);
  showToast(t('toast.feed_added', { type }));
  await renderHome();
  await renderTrackerRecent();
};

// ── Diaper entry ──────────────────────────────────────────────────────────────
window._addDiaperEntry = async function({ kind }) {
  if (!activeChild) { showToast(t('toast.no_child')); return; }
  const entry = await addEntry(STORES.DIAPER, {
    childId: activeChild.id,
    ts:      Date.now(),
    kind,
  }, DEVICE_ID);
  await fbWriteEntry(STORES.DIAPER, entry);
  showToast(t('toast.diaper_added', { kind }));
  await renderHome();
  await renderTrackerRecent();
};

// ── Tagesplan entry ───────────────────────────────────────────────────────────
window._addTagesplan = async function({ timeStr, label }) {
  if (!activeChild) { showToast(t('toast.no_child')); return; }
  const [h, m] = timeStr.split(':').map(Number);
  const today  = new Date();
  const ts     = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0, 0).getTime();
  const entry  = await addEntry(STORES.TAGESPLAN, {
    childId: activeChild.id,
    ts,
    label,
    done: false,
  }, DEVICE_ID);
  await fbWriteEntry(STORES.TAGESPLAN, entry);
  await renderTagesplan();
};

// ── Tracker recent ────────────────────────────────────────────────────────────
async function renderTrackerRecent() {
  const el = $('tracker-recent');
  if (!el || !activeChild) return;
  const today = new Date();
  const from  = startOfDay(today);
  const [feed, diaper] = await Promise.all([
    getEntriesByChildRange(STORES.FEED,   activeChild.id, from, Date.now()),
    getEntriesByChildRange(STORES.DIAPER, activeChild.id, from, Date.now()),
  ]);
  const all = [
    ...feed.map(e => ({ ...e, _type: 'feed' })),
    ...diaper.map(e => ({ ...e, _type: 'diaper' })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 10);
  el.innerHTML = all.length
    ? all.map(e => e._type === 'feed'
        ? `<div class="log-item"><span class="log-icon">🍼</span><span>${fmtTime(e.ts)} · ${esc(e.type)}${e.amount ? ' · ' + e.amount + ' ml' : ''}</span></div>`
        : `<div class="log-item"><span class="log-icon">🧷</span><span>${fmtTime(e.ts)} · ${esc(e.kind)}</span></div>`
      ).join('')
    : '<p class="empty-state">Noch keine Einträge heute.</p>';
}

// Patch renderTracker to also fill recent list
async function renderTracker() {
  if (!activeChild) { renderNoChild('tracker'); return; }
  await renderTrackerRecent();
}

// ── Verlauf (History) — full implementation ───────────────────────────────────
async function renderVerlauf() {
  if (!activeChild) { renderNoChild('verlauf'); return; }
  await filterVerlauf();
}

window._app.filterVerlauf = filterVerlauf;
async function filterVerlauf(dateOverride) {
  _verlaufPage = 0; // reset pagination on fresh filter
  if (!activeChild) return;
  const dateVal  = dateOverride || $('verlauf-date')?.value || '';
  const typeVal  = $('verlauf-type')?.value || 'all';
  const listEl   = $('verlauf-list');
  if (!listEl) return;

  let from, to;
  if (dateVal) {
    const [y, m, d] = dateVal.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    from = startOfDay(day);
    to   = endOfDay(day);
  } else {
    // Last 7 days
    const now = new Date();
    const week = new Date(); week.setDate(now.getDate() - 7);
    from = startOfDay(week);
    to   = endOfDay(now);
  }

  const fetches = [];
  if (typeVal === 'all' || typeVal === 'sleep')
    fetches.push(getEntriesByChildRange(STORES.SLEEP,  activeChild.id, from, to));
  else fetches.push(Promise.resolve([]));
  if (typeVal === 'all' || typeVal === 'feed')
    fetches.push(getEntriesByChildRange(STORES.FEED,   activeChild.id, from, to));
  else fetches.push(Promise.resolve([]));
  if (typeVal === 'all' || typeVal === 'diaper')
    fetches.push(getEntriesByChildRange(STORES.DIAPER, activeChild.id, from, to));
  else fetches.push(Promise.resolve([]));

  const [sleepRows, feedRows, diaperRows] = await Promise.all(fetches);
  const all = [
    ...sleepRows.map(e  => ({ ...e, _type: 'sleep'  })),
    ...feedRows.map(e   => ({ ...e, _type: 'feed'   })),
    ...diaperRows.map(e => ({ ...e, _type: 'diaper' })),
  ].sort((a, b) => b.ts - a.ts);

  if (!all.length) {
    listEl.innerHTML = `<p class="empty-state">${t('verlauf.empty')}</p>`;
    return;
  }

  // Group by date
  const groups = {};
  for (const e of all) {
    const dk = fmtDate(e.ts);
    if (!groups[dk]) groups[dk] = [];
    groups[dk].push(e);
  }

  // Build HTML strings per group (DocumentFragment batch render)
  const htmlItems = Object.entries(groups).map(([date, rows]) => `
    <div class="verlauf-group">
      <h4 class="verlauf-date-header">${date}</h4>
      ${rows.map(e => {
        switch (e._type) {
          case 'sleep':
            return `<div class="log-item">
              <span class="log-icon">${isSleeping(e) ? '😴' : '💤'}</span>
              <div class="log-details">
                <span>${fmtTime(e.ts)} → ${e.end ? fmtTime(e.end) : '…'}</span>
                <span class="log-dur">${fmtDur(sleepDuration(e)) || '…'}</span>
              </div>
              <button class="icon-btn danger" onclick="deleteVerlaufEntry('sleep',${JSON.stringify(e.id)})">🗑️</button>
            </div>`;
          case 'feed':
            return `<div class="log-item">
              <span class="log-icon">🍼</span>
              <span>${fmtTime(e.ts)} · ${e.type}${e.amount ? ' · ' + e.amount + ' ml' : ''}</span>
              <button class="icon-btn danger" onclick="deleteVerlaufEntry('feed',${JSON.stringify(e.id)})">🗑️</button>
            </div>`;
          case 'diaper':
            return `<div class="log-item">
              <span class="log-icon">🧷</span>
              <span>${fmtTime(e.ts)} · ${e.kind}</span>
              <button class="icon-btn danger" onclick="deleteVerlaufEntry('diaper',${JSON.stringify(e.id)})">🗑️</button>
            </div>`;
          default: return '';
        }
      }).join('')}
    </div>`);

  // When no date filter, show paginated "Load more" button
  if (!dateVal && all.length >= PAGE_SIZE) {
    htmlItems.push(`<button class="btn-secondary" style="width:100%;margin-top:.5rem"
      onclick="_verlaufLoadMore()">Mehr laden (${all.length} Einträge)</button>`);
  }

  batchRender(listEl, htmlItems);
}

window._verlaufLoadMore = async function() {
  _verlaufPage++;
  const listEl = $('verlauf-list');
  if (!listEl || !activeChild) return;
  const { items, hasMore, total } = await getVerlaufPage(activeChild.id, _verlaufPage, 30);
  const groups = {};
  for (const e of items) {
    const dk = fmtDate(e.ts);
    if (!groups[dk]) groups[dk] = [];
    groups[dk].push(e);
  }
  const htmlItems = Object.entries(groups).map(([date, rows]) => `
    <div class="verlauf-group">
      <h4 class="verlauf-date-header">${date}</h4>
      ${rows.map(e => {
        switch (e._type) {
          case 'sleep':  return `<div class="log-item"><span class="log-icon">\${isSleeping(e) ? '😴' : '💤'}</span><div class="log-details"><span>\${fmtTime(e.ts)} → \${e.end ? fmtTime(e.end) : '…'}</span><span class="log-dur">\${fmtDur(sleepDuration(e)) || '…'}</span></div><button class="icon-btn danger" onclick="deleteVerlaufEntry('sleep',\${JSON.stringify(e.id)})">🗑️</button></div>`;
          case 'feed':   return `<div class="log-item"><span class="log-icon">🍼</span><span>\${fmtTime(e.ts)} · \${e.type}\${e.amount ? ' · ' + e.amount + ' ml' : ''}</span><button class="icon-btn danger" onclick="deleteVerlaufEntry('feed',\${JSON.stringify(e.id)})">🗑️</button></div>`;
          case 'diaper': return `<div class="log-item"><span class="log-icon">🧷</span><span>\${fmtTime(e.ts)} · \${e.kind}</span><button class="icon-btn danger" onclick="deleteVerlaufEntry('diaper',\${JSON.stringify(e.id)})">🗑️</button></div>`;
          default: return '';
        }
      }).join('')}
    </div>`);
  if (hasMore) {
    htmlItems.push(`<button class="btn-secondary" style="width:100%;margin-top:.5rem"
      onclick="_verlaufLoadMore()">Mehr laden (${total} gesamt)</button>`);
  }
  // Append (don't replace) existing items
  const frag = document.createDocumentFragment();
  const tmp  = document.createElement('div');
  tmp.innerHTML = htmlItems.join('');
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);
  // Remove old load-more button then append
  const oldBtn = listEl.querySelector('button.btn-secondary');
  if (oldBtn) oldBtn.remove();
  listEl.appendChild(frag);
};

window.deleteVerlaufEntry = async function(storeKey, id) {
  const store = { sleep: STORES.SLEEP, feed: STORES.FEED, diaper: STORES.DIAPER }[storeKey];
  if (!store) return;
  // Soft delete — marks deletedAt, writes tombstone, syncs _deleted marker to Firebase
  const basePath = fbPath(store, id).replace('/' + id, '');
  await softDelete(store, id, basePath, DEVICE_ID);
  showUndoToast('Eintrag gelöscht', async () => {
    const { restoreDeleted } = await import('./tombstone.js');
    await restoreDeleted(store, id, basePath);
    await filterVerlauf();
  });
  await filterVerlauf();
};

// ── Child Switcher Sheet ──────────────────────────────────────────────────────
window._refreshChildSwitcher = async function() {
  const listEl = $('child-switcher-list');
  if (!listEl) return;
  const children = await getChildren();
  cfg = await getCfg();
  listEl.innerHTML = children.length
    ? children.map(c => `
        <div class="child-item${c.id === cfg.activeChildId ? ' active' : ''}"
             onclick="switchChild(${JSON.stringify(c.id)}); closeChildSwitcher()">
          <span class="child-emoji">${genderEmoji(c.gender)}</span>
          <div><strong>${escHtml(c.name)}</strong> <small>${c.birthday ? ageExact(c.birthday) : ''}</small></div>
          ${c.id === cfg.activeChildId ? '<span class="active-badge">✓</span>' : ''}
        </div>`).join('')
    : '<p class="empty-state">Noch kein Kind angelegt.</p>';
};

// Update header child name on boot / child switch
const _origSwitchChild = window.switchChild;
window.switchChild = async function(id) {
  await _origSwitchChild(id);
  updateHeaderChildName();
};
function updateHeaderChildName() {
  const el = $('active-child-name');
  if (el && activeChild) el.textContent = activeChild.name;
}

window._app.renderGrowthChart = updateGrowthView;

// Patch boot to update header after active child loads
const _origBoot = window._app;
document.addEventListener('DOMContentLoaded', async () => {
  // After boot, update header name
  setTimeout(updateHeaderChildName, 600);
  // Garbage-collect tombstones older than 30 days
  setTimeout(() => purgeTombstones().catch(console.warn), 5000);

  // Quarantine monitor — alerts user when sync items are permanently stuck
  startQuarantineMonitor();
  window.openDebugPanel = openDebugPanel;

  // Debug panel — 5× tap on version text or ?debug=1
  const versionEl = document.querySelector('.settings-section .hint');
  if (versionEl) attachDebugTrigger(versionEl);
  if (isDebugMode()) {
    const dbgBadge = document.createElement('span');
    dbgBadge.textContent = ' [DEBUG]';
    dbgBadge.style.cssText = 'color:var(--accent,#e86);font-weight:700;font-size:.75em;';
    versionEl?.appendChild(dbgBadge);
  }

  // Online/Offline body class for offline-indicator CSS
  const setOnlineState = () => {
    document.body.classList.toggle('is-offline', !navigator.onLine);
  };
  setOnlineState();
  window.addEventListener('online',  setOnlineState);
  window.addEventListener('offline', setOnlineState);

  // SW update detection — show update banner when new SW is waiting
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW?.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            const banner = document.getElementById('sw-update-banner');
            if (banner) banner.hidden = false;
          }
        });
      });
    });

    // Navigate to page when notification is clicked (SW sends NAVIGATE message)
    navigator.serviceWorker.addEventListener('message', async event => {
      if (event.data?.type === 'NAVIGATE' && event.data.page) {
        await showPage(event.data.page);
      }
    });
  }

  // Restore reminder settings from last session
  const getSleepStart = () => {
    try {
      const open = JSON.parse(localStorage.getItem('bt_active_sleep') || 'null');
      return open?.ts ?? null;
    } catch { return null; }
  };
  await initReminders(getSleepStart);

  // Load reminder settings into UI
  renderReminderSettings();
});

// Activate new SW on user request
window.updateSW = function() {
  navigator.serviceWorker.ready.then(reg => {
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  });
};
