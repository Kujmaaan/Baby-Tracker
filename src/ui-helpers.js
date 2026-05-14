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

// ── Tagesplan add ─────────────────────────────────────────────────────────────

window.addTagesplan = async function() {
  const timeStr = document.getElementById('tp-time').value || '08:00';
  const label   = document.getElementById('tp-label').value.trim();
  if (!label) return;
  await window._addTagesplan?.({ timeStr, label });
  document.getElementById('tp-label').value = '';
};
