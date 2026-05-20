// ─── ui-helpers.js — Inline UI utility functions (extracted from index.html) ─
// These functions were previously inline scripts in index.html.
// Moved here to allow removal of CSP 'unsafe-inline' from script-src.
// All functions are attached to window.* for use by onclick handlers in index.html.

// ── Onboarding navigation ─────────────────────────────────────────────────────

let _obSlide = 0;
let _obSlides, _obDots;

function _obInit() {
  _obSlides = document.querySelectorAll('.ob-slide');
  _obDots   = document.querySelectorAll('.ob-dot');
}

function obShowSlide(n) {
  if (!_obSlides) _obInit();
  _obSlides.forEach((s, i) => s.classList.toggle('active', i === n));
  _obDots.forEach((d, i)   => d.classList.toggle('active', i === n));
  document.getElementById('ob-prev').style.display = n === 0 ? 'none' : '';
  document.getElementById('ob-next').textContent = n === _obSlides.length - 1 ? 'Los geht\'s!' : 'Weiter';
}
window.obShowSlide = obShowSlide;

window.obNext = function() {
  if (!_obSlides) _obInit();
  if (_obSlide < _obSlides.length - 1) { _obSlide++; obShowSlide(_obSlide); }
  else window.finishOnboard?.();
};

window.obPrev = function() {
  if (_obSlide > 0) { _obSlide--; obShowSlide(_obSlide); }
};

// ── Fix-start day selection ───────────────────────────────────────────────────

window.fsDaySelect = function(btn) {
  document.querySelectorAll('#fs-day-btns .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

// ── Diaper kind selection ─────────────────────────────────────────────────────

window.diaperSelect = function(btn) {
  document.querySelectorAll('#diaper-modal .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

// ── Modal open ────────────────────────────────────────────────────────────────

window.openModal = function(id) {
  document.getElementById(id)?.classList.remove('hidden');
};

// ── Mehr sheet ────────────────────────────────────────────────────────────────

window.toggleMehrSheet = function() {
  document.getElementById('mehr-overlay').classList.toggle('hidden');
};

window.closeMehrSheet = function(e) {
  if (e.target === document.getElementById('mehr-overlay'))
    document.getElementById('mehr-overlay').classList.add('hidden');
};

window.gotoPage = function(id) {
  document.getElementById('mehr-overlay').classList.add('hidden');
  window._app?.showPage(id) || document.querySelector(`.nav-btn[data-page="${id}"]`)?.click();
};

// ── Child switcher ────────────────────────────────────────────────────────────

window.openChildSwitcher = function() {
  document.getElementById('child-switcher-overlay').classList.remove('hidden');
  window._refreshChildSwitcher?.();
};

window.closeChildSwitcher = function(e) {
  if (!e || e.target === document.getElementById('child-switcher-overlay'))
    document.getElementById('child-switcher-overlay').classList.add('hidden');
};

// ── Verlauf filter ────────────────────────────────────────────────────────────

window.filterVerlauf = async function() {
  window._app?.filterVerlauf?.();
};

// ── Growth type switch ────────────────────────────────────────────────────────

window.switchGrowthType = function(type) {
  document.querySelectorAll('#growth-type-btns .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === type));
  window._app?.renderGrowthChart?.(type);
};

// ── Tracker quick entries ─────────────────────────────────────────────────────

window.addFeedEntry = async function() {
  const type   = document.getElementById('feed-type').value;
  const amount = parseFloat(document.getElementById('feed-amount').value) || null;
  window._addFeedEntry?.({ type, amount });
};

window.addDiaperEntry = async function() {
  const kind = document.getElementById('diaper-type').value;
  window._addDiaperEntry?.({ kind });
};

// ── Modal save wrappers ───────────────────────────────────────────────────────

window.saveFeedModal = async function() {
  const type   = document.getElementById('modal-feed-type').value;
  const amount = parseFloat(document.getElementById('modal-feed-amount').value) || null;
  await window._addFeedEntry?.({ type, amount });
  window.closeModal?.('feed-modal');
};

window.saveDiaperModal = async function() {
  const btn  = document.querySelector('#diaper-modal .seg-btn.active');
  const kind = btn?.dataset.kind || 'Nass';
  await window._addDiaperEntry?.({ kind });
  window.closeModal?.('diaper-modal');
};

// ── Health entry modal ────────────────────────────────────────────────────────

const _HEALTH_META = {
  weight: { title: '⚖️ Gewicht eintragen',     unit: 'g',  min: 500,   max: 30000, step: 10,  placeholder: 'z.B. 4500' },
  height: { title: '📏 Größe eintragen',        unit: 'cm', min: 30,    max: 150,   step: 0.5, placeholder: 'z.B. 52.5' },
  head:   { title: '📐 Kopfumfang eintragen',   unit: 'cm', min: 20,    max: 70,    step: 0.1, placeholder: 'z.B. 35.0' },
};

window.openHealthModal = function(type) {
  const meta    = _HEALTH_META[type] || _HEALTH_META.weight;
  const titleEl = document.getElementById('health-modal-title');
  const unitEl  = document.getElementById('health-modal-unit');
  const valEl   = document.getElementById('health-modal-value');
  const dateEl  = document.getElementById('health-modal-date');
  const modal   = document.getElementById('health-modal');
  if (!modal) return;

  if (titleEl) titleEl.textContent = meta.title;
  if (unitEl)  unitEl.textContent  = meta.unit;
  if (valEl) {
    valEl.value       = '';
    valEl.min         = meta.min;
    valEl.max         = meta.max;
    valEl.step        = meta.step;
    valEl.placeholder = meta.placeholder;
  }
  if (dateEl) {
    const today = new Date();
    const iso   = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    dateEl.value = iso;
    dateEl.max   = iso;
  }
  modal.dataset.healthType = type;
  window.openModal('health-modal');
};

window.saveHealthModal = async function() {
  const modal   = document.getElementById('health-modal');
  const type    = modal?.dataset.healthType;
  const valStr  = document.getElementById('health-modal-value')?.value?.trim();
  const dateStr = document.getElementById('health-modal-date')?.value;
  if (!valStr || !type) return;

  const value = parseFloat(valStr.replace(',', '.'));
  if (isNaN(value) || value <= 0) {
    window.showToast?.('Ungültiger Wert.', 'error');
    return;
  }

  let ts = Date.now();
  if (dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    ts = new Date(y, m - 1, d, 12, 0, 0).getTime();
  }

  window.closeModal?.('health-modal');
  await window.addHealthEntry?.(type, value, ts);
};

// ── Tagesplan add ─────────────────────────────────────────────────────────────

window.addTagesplan = async function() {
  const timeStr = document.getElementById('tp-time').value || '08:00';
  const label   = document.getElementById('tp-label').value.trim();
  if (!label) return;
  await window._addTagesplan?.({ timeStr, label });
  document.getElementById('tp-label').value = '';
};

// -- SW update banner guard ---------------------------------------------------
// Watches #sw-update-banner via MutationObserver and suppresses it whenever
// the onboarding overlay is active. Runs from ui-helpers.js which is served
// network-first, so the guard takes effect immediately even when an old SW
// version controls the page -- no SW activation required.
(function () {
  function installBannerGuard() {
    const banner = document.getElementById('sw-update-banner');
    const ob     = document.getElementById('ob-guide-overlay');
    if (!banner || !ob) return;

    new MutationObserver(function () {
      // Banner became visible while onboarding is still running
      if (!banner.hidden && !ob.classList.contains('hidden')) {
        banner.hidden = true;
        // Re-show banner after onboarding completes so user still gets notified
        new MutationObserver(function (_, obs) {
          if (ob.classList.contains('hidden')) {
            banner.hidden = false;
            obs.disconnect();
          }
        }).observe(ob, { attributes: true, attributeFilter: ['class', 'style'] });
      }
    }).observe(banner, { attributes: true, attributeFilter: ['hidden'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installBannerGuard);
  } else {
    installBannerGuard();
  }
}());
