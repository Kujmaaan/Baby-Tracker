// ─── config.js — App configuration manager ───────────────────────────────────
// Single source of truth for settings, children, and active child.
// Reads/writes via storage.js (IndexedDB) with localStorage fallback.

import { cfgGet, cfgSet } from './storage.js';
import { uid, deepClone } from './helpers.js';
import { DEFAULT_CFG, CFG_KEY, GENDER_MAP } from './constants.js';

let _cfg = null;   // in-memory cache

// ── Load / Save ───────────────────────────────────────────────────────────────

/**
 * Load config from IndexedDB (or localStorage fallback).
 * Merges with DEFAULT_CFG so new fields always exist.
 * @returns {Promise<object>}
 */
export async function loadCfg() {
  const stored = await cfgGet(CFG_KEY, null);
  _cfg = { ...deepClone(DEFAULT_CFG), ...(stored || {}) };
  return _cfg;
}

/**
 * Persist the current in-memory config.
 * @returns {Promise<void>}
 */
export async function saveCfg() {
  if (!_cfg) return;
  await cfgSet(CFG_KEY, _cfg);
}

/**
 * Get the current config (loads if not yet loaded).
 * @returns {Promise<object>}
 */
export async function getCfg() {
  if (!_cfg) await loadCfg();
  return _cfg;
}

/**
 * Patch config fields and save.
 * @param {Partial<object>} patch
 * @returns {Promise<object>}
 */
export async function patchCfg(patch) {
  if (!_cfg) await loadCfg();
  Object.assign(_cfg, patch);
  await saveCfg();
  return _cfg;
}

// ── Children ──────────────────────────────────────────────────────────────────

/**
 * Get the list of children.
 * @returns {Promise<object[]>}
 */
export async function getChildren() {
  const cfg = await getCfg();
  return cfg.children || [];
}

/**
 * Get a child by id.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getChild(id) {
  const children = await getChildren();
  return children.find(c => c.id === id) || null;
}

/**
 * Add a new child.
 * @param {{ name: string, gender?: string, birthday?: string }} data
 * @returns {Promise<object>} the created child
 */
export async function addChild(data) {
  const cfg = await getCfg();
  const child = {
    id:       uid(),
    name:     data.name || 'Baby',
    gender:   data.gender || 'none',
    birthday: data.birthday || '',
    createdAt: Date.now(),
  };
  cfg.children.push(child);
  // Auto-select as active if first child
  if (cfg.children.length === 1) cfg.activeChildId = child.id;
  await saveCfg();
  return child;
}

/**
 * Update a child.
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
export async function updateChild(id, updates) {
  const cfg = await getCfg();
  const idx = cfg.children.findIndex(c => c.id === id);
  if (idx < 0) throw new Error(`Child ${id} not found`);
  cfg.children[idx] = { ...cfg.children[idx], ...updates };
  await saveCfg();
  return cfg.children[idx];
}

/**
 * Delete a child.
 * @param {string} id
 */
export async function deleteChild(id) {
  const cfg = await getCfg();
  cfg.children = cfg.children.filter(c => c.id !== id);
  // If deleted child was active, switch to first remaining child
  if (cfg.activeChildId === id) {
    cfg.activeChildId = cfg.children[0]?.id || null;
  }
  await saveCfg();
}

/**
 * Get the active child.
 * @returns {Promise<object|null>}
 */
export async function getActiveChild() {
  const cfg = await getCfg();
  if (!cfg.activeChildId) return null;
  return cfg.children.find(c => c.id === cfg.activeChildId) || null;
}

/**
 * Set the active child.
 * @param {string} id
 */
export async function setActiveChild(id) {
  await patchCfg({ activeChildId: id });
}

// ── Theme ─────────────────────────────────────────────────────────────────────

/**
 * Get current theme.
 * @returns {Promise<'light'|'dark'>}
 */
export async function getTheme() {
  const cfg = await getCfg();
  return cfg.theme || 'light';
}

/**
 * Set theme and apply to document.
 * @param {'light'|'dark'} theme
 */
export async function applyTheme(theme) {
  await patchCfg({ theme });
  const html = document.documentElement;
  if (theme === 'light') {
    html.classList.add('light');
  } else {
    html.classList.remove('light');
  }
}

/**
 * Toggle between light and dark.
 * @returns {Promise<'light'|'dark'>} the new theme
 */
export async function toggleTheme() {
  const current = await getTheme();
  const next = current === 'light' ? 'dark' : 'light';
  await applyTheme(next);
  return next;
}

// ── Onboarding ────────────────────────────────────────────────────────────────

/**
 * Check if user has completed onboarding.
 * @returns {Promise<boolean>}
 */
export async function hasOnboarded() {
  const cfg = await getCfg();
  return !!cfg.onboarded;
}

/**
 * Mark onboarding as complete.
 */
export async function setOnboarded() {
  await patchCfg({ onboarded: true });
}

// ── Family / Firebase ─────────────────────────────────────────────────────────

/**
 * Get or generate a familyId for Firebase sync.
 * @returns {Promise<string>}
 */
export async function getFamilyId() {
  const cfg = await getCfg();
  if (!cfg.familyId) {
    cfg.familyId = uid();
    await saveCfg();
  }
  return cfg.familyId;
}

// ── Gender display ────────────────────────────────────────────────────────────

/**
 * Human-readable gender label.
 * @param {string} key
 * @returns {string}
 */
export function genderLabel(key) {
  return GENDER_MAP[key]?.label || key || '—';
}

/**
 * Gender emoji.
 * @param {string} key
 * @returns {string}
 */
export function genderEmoji(key) {
  return GENDER_MAP[key]?.emoji || '';
}
