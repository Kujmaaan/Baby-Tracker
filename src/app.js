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

import { initFB, fbWrite, fbDelete, syncUp, fbReady } from './firebase.js';

import {
  validateSleepEntry, normalizeSleepEntry,
  sleepDuration, isSleeping, crossesMidnight,
  dailySleepTotals, sleepEntriesForDay, sleepMsForDay,
  parseFixStart,
} from './sleep.js';

import {
  pad, fmtDur, fmtDurLong, fmtTime, fmtDate, fmtDateShort, fmtShort,
  addMin, ageExact, ageMonths, toLocalDateStr, startOfDay, endOfDay,
  uid, deepClone, debounce, escHtml, fmtWeight, fmtHeight,
} from './helpers.js';

import { DEVICE_ID, WHO_DATA, PRESET_MILESTONES, ICONS } from './constants.js';

// ── State ─────────────────────────────────────────────────────────────────────
let cfg          = null;
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
    showToast('Startfehler — bitte Seite neu laden.', 'error');
  }
});

async function boot() {
  // 1. DB
  await openDB();

  // 2. Config
  cfg = await loadCfg();
  activeChild = await getActiveChild();

  // 3. Theme
  await applyTheme(cfg.theme || 'light');

  // 4. Firebase (non-blocking)
  showFbLoading();
  initFB().then(ok => {
    hideFbLoading();
    if (ok) {
      getFamilyId().then(fid => {
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
  const today = new Date();
  const sleepEntries = await getEntriesByChild(STORES.SLEEP, activeChild.id);
  const todaysSleep  = sleepEntriesForDay(sleepEntries, today);
  const totalSleepMs = todaysSleep.reduce((s, e) => s + (sleepDuration(e) || 0), 0);
  const currentSleep = sleepEntries.find(isSleeping);

  // Update summary cards
  const elSleep = $('home-sleep');
  if (elSleep) elSleep.textContent = fmtDur(totalSleepMs) || '—';

  const feedEntries = await getEntriesByChild(STORES.FEED, activeChild.id);
  const todaysFeed  = feedEntries.filter(e => e.ts >= startOfDay(today));
  const elFeed = $('home-feed');
  if (elFeed) elFeed.textContent = todaysFeed.length || 0;

  const diaperEntries = await getEntriesByChild(STORES.DIAPER, activeChild.id);
  const todaysDiaper  = diaperEntries.filter(e => e.ts >= startOfDay(today));
  const elDiaper = $('home-diaper');
  if (elDiaper) elDiaper.textContent = todaysDiaper.length || 0;

  // Child name & age
  const elName = $('home-child-name');
  if (elName) elName.textContent = activeChild.name;
  const elAge = $('home-child-age');
  if (elAge) elAge.textContent = ageExact(activeChild.birthday);

  // Current sleep button state
  const sleepBtn = $('btn-sleep-toggle');
  if (sleepBtn) {
    if (currentSleep) {
      sleepBtn.textContent = `😴 Aufgewacht (${fmtTime(currentSleep.ts)})`;
      sleepBtn.classList.add('active');
    } else {
      sleepBtn.textContent = '🌙 Schlafen';
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
    logEl.innerHTML = '<p class="empty-state">Noch keine Einträge heute 🌱</p>';
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
          <span>${fmtTime(e.ts)} · ${e.amount ? e.amount + ' ml' : e.type || 'Fütterung'}</span>
        </div>`;
      case 'diaper':
        return `<div class="log-item">
          <span class="log-icon">🧷</span>
          <span>${fmtTime(e.ts)} · ${e.kind || 'Windel'}</span>
        </div>`;
      default: return '';
    }
  }).join('');
}

// ── Sleep toggle ──────────────────────────────────────────────────────────────

window.toggleSleep = async function() {
  if (!activeChild) { showToast('Bitte zuerst ein Kind anlegen.'); return; }
  const entries = await getEntriesByChild(STORES.SLEEP, activeChild.id);
  const ongoing = entries.find(isSleeping);

  if (ongoing) {
    // End sleep
    const end    = Date.now();
    const updated = await updateEntry(STORES.SLEEP, ongoing.id, { end });
    await fbWriteEntry(STORES.SLEEP, updated);
    showToast(`Aufgewacht! Geschlafen: ${fmtDur(end - ongoing.ts)}`);
  } else {
    // Start sleep
    const entry = await addEntry(STORES.SLEEP, {
      childId: activeChild.id,
      ts:      Date.now(),
      end:     null,
    }, DEVICE_ID);
    await fbWriteEntry(STORES.SLEEP, entry);
    showToast('Schläft jetzt 😴');
  }
  await renderHome();
};

// ── Fix Sleep Start ───────────────────────────────────────────────────────────

window.openFixStartModal = async function() {
  const entries = await getEntriesByChild(STORES.SLEEP, activeChild?.id || '');
  const ongoing = entries.find(isSleeping);
  if (!ongoing) { showToast('Kein laufender Schlaf.'); return; }
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
  if (!entry) { showToast('Eintrag nicht gefunden.', 'error'); return; }

  // If there's an end time, validate end > new start
  if (entry.end && entry.end <= ts) {
    showToast('Schlafbeginn muss vor dem Schlafende liegen.', 'error'); return;
  }

  const updated = await updateEntry(STORES.SLEEP, id, { ts });
  await fbWriteEntry(STORES.SLEEP, updated);
  closeModal('fix-start-modal');
  showToast('Schlafbeginn korrigiert ✓');
  await renderHome();
};

// ── Stats page ────────────────────────────────────────────────────────────────

async function renderStats() {
  if (!activeChild) { renderNoChild('stats'); return; }
  const sleepEntries  = await getEntriesByChild(STORES.SLEEP,  activeChild.id);
  const feedEntries   = await getEntriesByChild(STORES.FEED,   activeChild.id);
  const diaperEntries = await getEntriesByChild(STORES.DIAPER, activeChild.id);

  const today   = new Date();
  const weekAgo = new Date(); weekAgo.setDate(today.getDate() - 7);

  const weekSleep  = sleepEntries.filter(e => e.ts >= weekAgo.getTime());
  const weekFeed   = feedEntries.filter(e => e.ts >= weekAgo.getTime());
  const weekDiaper = diaperEntries.filter(e => e.ts >= weekAgo.getTime());

  const totalMs = weekSleep.reduce((s, e) => s + (sleepDuration(e) || 0), 0);

  const elTotalSleep  = $('total-sleep');
  const elTotalFeed   = $('total-feed');
  const elTotalDiaper = $('total-diaper');
  if (elTotalSleep)  elTotalSleep.textContent  = fmtDur(totalMs) || '—';
  if (elTotalFeed)   elTotalFeed.textContent   = weekFeed.length;
  if (elTotalDiaper) elTotalDiaper.textContent = weekDiaper.length;

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

// ── Verlauf (History) ─────────────────────────────────────────────────────────

async function renderVerlauf() {
  // Rendered inline by index.html — called to refresh data
  if (!activeChild) { renderNoChild('verlauf'); return; }
}

// ── Wachstum (Growth) ─────────────────────────────────────────────────────────

async function renderWachstum() {
  if (!activeChild) { renderNoChild('wachstum'); return; }
  renderGrowthChart('weight');
}

function renderGrowthChart(type) {
  const svg = $('growth-svg');
  if (!svg || !activeChild) return;
  const gender  = activeChild.gender?.startsWith('m') ? 'boys' : 'girls';
  const dataset = WHO_DATA[type]?.[gender] || [];
  if (!dataset.length) return;

  const W = 300, H = 160, padL = 28, padB = 20, padT = 8, padR = 8;
  const months = dataset.map(r => r[0]);
  const maxX   = Math.max(...months);
  const vals   = dataset.flatMap(r => r.slice(1));
  const minY   = Math.min(...vals);
  const maxY   = Math.max(...vals);

  const tx = m => padL + ((m / maxX) * (W - padL - padR));
  const ty = v => H - padB - ((v - minY) / (maxY - minY)) * (H - padT - padB);

  const percentiles = [0, 1, 2, 3, 4]; // P3, P15, P50, P85, P97
  const colors = ['#e9d5ff','#c4b5fd','#8b5cf6','#c4b5fd','#e9d5ff'];
  const labels = ['P3','P15','P50','P85','P97'];

  let paths = '';
  percentiles.forEach((pi, idx) => {
    const points = dataset.map(r => `${tx(r[0]).toFixed(1)},${ty(r[pi + 1]).toFixed(1)}`).join(' ');
    const strokeW = pi === 2 ? 1.5 : 0.8;
    paths += `<polyline points="${points}" fill="none" stroke="${colors[idx]}" stroke-width="${strokeW}" />`;
    // Label at end
    const last = dataset[dataset.length - 1];
    paths += `<text x="${(tx(last[0]) + 2).toFixed(1)}" y="${ty(last[pi + 1]).toFixed(1)}"
      font-size="6" fill="${colors[idx]}">${labels[idx]}</text>`;
  });

  // Child data points
  // (health entries would be overlaid here — rendered by gesundheit module)

  // Axes
  const xAxis = `<line x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="var(--border)" stroke-width="0.5"/>`;
  const yAxis = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" stroke="var(--border)" stroke-width="0.5"/>`;

  svg.innerHTML = paths + xAxis + yAxis;
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
    await deleteEntry(STORES.MILESTONE, existing.id);
    await fbDelete(fbPath(STORES.MILESTONE, existing.id));
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

window.addHealthEntry = async function(type) {
  if (!activeChild) return;
  const valStr = prompt(type === 'weight' ? 'Gewicht (g):' : 'Größe (cm):');
  if (!valStr) return;
  const value = parseFloat(valStr.replace(',', '.'));
  if (isNaN(value)) { showToast('Ungültiger Wert.', 'error'); return; }
  const entry = await addEntry(STORES.HEALTH, { childId: activeChild.id, ts: Date.now(), type, value }, DEVICE_ID);
  await fbWriteEntry(STORES.HEALTH, entry);
  showToast('Eintrag gespeichert ✓');
  await renderGesundheit();
};

window.addAppt = async function() {
  if (!activeChild) return;
  const title   = $('appt-title')?.value?.trim();
  const dateStr = $('appt-date')?.value;
  const timeStr = $('appt-time')?.value || '00:00';
  if (!title || !dateStr) { showToast('Bitte Titel und Datum angeben.', 'error'); return; }
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min]  = timeStr.split(':').map(Number);
  const ts = new Date(y, m - 1, d, h, min, 0, 0).getTime();
  const entry = await addEntry(STORES.APPT, { childId: activeChild.id, ts, title }, DEVICE_ID);
  await fbWriteEntry(STORES.APPT, entry);
  scheduleApptNotif(entry);
  showToast('Termin gespeichert ✓');
  if ($('appt-title')) $('appt-title').value = '';
  if ($('appt-date'))  $('appt-date').value  = '';
  await renderGesundheit();
};

window.deleteAppt = async function(id) {
  await deleteEntry(STORES.APPT, id);
  await fbDelete(fbPath(STORES.APPT, id));
  await renderGesundheit();
};

function scheduleApptNotif(entry) {
  const delay = entry.ts - Date.now() - 24 * 3600 * 1000;
  if (delay > 0 && delay < 7 * 24 * 3600 * 1000) {
    setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification('🏥 Arzttermin morgen', { body: entry.title });
      }
    }, delay);
  }
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
    listEl.innerHTML = '<p class="empty-state">Kein Plan für heute — füge Aktivitäten hinzu 📝</p>';
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
  await deleteEntry(STORES.TAGESPLAN, id);
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

  // Theme toggle
  const themeBtn = $('theme-toggle');
  if (themeBtn) {
    themeBtn.textContent = cfg.theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode';
  }
}

window.switchChild = async function(id) {
  await setActiveChild(id);
  activeChild = await getActiveChild();
  cfg = await getCfg();
  showToast(`Aktives Kind: ${activeChild?.name}`);
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
  if (!name) { showToast('Bitte einen Namen eingeben.', 'error'); return; }
  const child = await addChild({ name, gender, birthday });
  activeChild = await getActiveChild();
  closeModal('add-child-modal');
  showToast(`${child.name} hinzugefügt ✓`);
  await renderSettings();
};

// ── Theme toggle ──────────────────────────────────────────────────────────────
window.toggleThemeUI = async function() {
  const next = await toggleTheme();
  cfg = await getCfg();
  showToast(next === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode');
  await renderSettings();
};

// ── Backup / Restore ──────────────────────────────────────────────────────────
window.backupJSON = async function() {
  const data = await exportDB();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `baby-tracker-backup-${toLocalDateStr(new Date())}.json`;
  a.click();
  showToast('Backup erstellt ✓');
};

window.restoreJSON = function() {
  const inp = document.createElement('input');
  inp.type  = 'file';
  inp.accept= '.json';
  inp.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm('Alle Daten werden überschrieben. Fortfahren?')) return;
      await importDB(data);
      cfg = await loadCfg();
      activeChild = await getActiveChild();
      showToast('Backup wiederhergestellt ✓');
      await showPage(currentPage);
    } catch (err) {
      showToast('Fehler beim Wiederherstellen: ' + err.message, 'error');
    }
  };
  inp.click();
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

  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `baby-tracker-${activeChild.name}-${toLocalDateStr(new Date())}.csv`;
  a.click();
  showToast('CSV exportiert ✓');
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
    showToast('App installiert ✓');
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
  if (perm === 'granted') showToast('Benachrichtigungen aktiviert ✓');
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
  if (!activeChild) { showToast('Bitte zuerst ein Kind anlegen.'); return; }
  const entry = await addEntry(STORES.FEED, {
    childId: activeChild.id,
    ts:      Date.now(),
    type,
    amount:  amount || null,
  }, DEVICE_ID);
  await fbWriteEntry(STORES.FEED, entry);
  showToast(`🍼 ${type} eingetragen`);
  await renderHome();
  await renderTrackerRecent();
};

// ── Diaper entry ──────────────────────────────────────────────────────────────
window._addDiaperEntry = async function({ kind }) {
  if (!activeChild) { showToast('Bitte zuerst ein Kind anlegen.'); return; }
  const entry = await addEntry(STORES.DIAPER, {
    childId: activeChild.id,
    ts:      Date.now(),
    kind,
  }, DEVICE_ID);
  await fbWriteEntry(STORES.DIAPER, entry);
  showToast(`🧷 ${kind} eingetragen`);
  await renderHome();
  await renderTrackerRecent();
};

// ── Tagesplan entry ───────────────────────────────────────────────────────────
window._addTagesplan = async function({ timeStr, label }) {
  if (!activeChild) { showToast('Bitte zuerst ein Kind anlegen.'); return; }
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
        ? `<div class="log-item"><span class="log-icon">🍼</span><span>${fmtTime(e.ts)} · ${e.type}${e.amount ? ' · ' + e.amount + ' ml' : ''}</span></div>`
        : `<div class="log-item"><span class="log-icon">🧷</span><span>${fmtTime(e.ts)} · ${e.kind}</span></div>`
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
    listEl.innerHTML = '<p class="empty-state">Keine Einträge für diesen Zeitraum.</p>';
    return;
  }

  // Group by date
  const groups = {};
  for (const e of all) {
    const dk = fmtDate(e.ts);
    if (!groups[dk]) groups[dk] = [];
    groups[dk].push(e);
  }

  listEl.innerHTML = Object.entries(groups).map(([date, rows]) => `
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
    </div>`).join('');
}

window.deleteVerlaufEntry = async function(storeKey, id) {
  const store = { sleep: STORES.SLEEP, feed: STORES.FEED, diaper: STORES.DIAPER }[storeKey];
  if (!store) return;
  await deleteEntry(store, id);
  await fbDelete(fbPath(store, id));
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

// Expose renderGrowthChart for inline switchGrowthType
window._app.renderGrowthChart = renderGrowthChart;

// Patch boot to update header after active child loads
const _origBoot = window._app;
document.addEventListener('DOMContentLoaded', () => {
  // After boot, update header name
  setTimeout(updateHeaderChildName, 600);
});
