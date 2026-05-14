// ─── growth.js — WHO Growth Chart Rendering + Percentile Calculation ──────────
import { WHO_DATA } from './constants.js';

// ── Unit conversion ───────────────────────────────────────────────────────────

function toWHOUnits(type, value) {
  return type === 'weight' ? value / 1000 : value; // grams → kg; cm stays cm
}

// ── Age calculation ───────────────────────────────────────────────────────────

/**
 * Age in decimal months at a given timestamp.
 * @param {string} birthday — ISO date string "YYYY-MM-DD"
 * @param {number} ts       — Unix ms
 * @returns {number|null}
 */
export function calcAgeMonthsAt(birthday, ts) {
  if (!birthday) return null;
  const birth = new Date(birthday).getTime();
  if (ts < birth) return null;
  return (ts - birth) / (365.25 / 12 * 86_400_000);
}

// ── WHO data interpolation ────────────────────────────────────────────────────

/**
 * Interpolate [P3, P15, P50, P85, P97] at a given age in months.
 * @param {Array} dataset
 * @param {number} ageMo
 * @returns {number[]|null}
 */
function interpolateWHO(dataset, ageMo) {
  if (!dataset?.length) return null;
  const first = dataset[0];
  const last  = dataset[dataset.length - 1];
  if (ageMo <= first[0]) return first.slice(1);
  if (ageMo >= last[0])  return last.slice(1);
  for (let i = 0; i < dataset.length - 1; i++) {
    if (dataset[i][0] <= ageMo && dataset[i + 1][0] >= ageMo) {
      const t = (ageMo - dataset[i][0]) / (dataset[i + 1][0] - dataset[i][0]);
      return dataset[i].slice(1).map((v, k) => v + t * (dataset[i + 1][k + 1] - v));
    }
  }
  return last.slice(1);
}

/**
 * Estimate the percentile label for a measurement value at a given age.
 * @param {Array}  dataset
 * @param {number} ageMo
 * @param {number} value   — already in WHO units (kg or cm)
 * @returns {string|null}  e.g. "P42", "< P3", "> P97"
 */
export function calcPercentile(dataset, ageMo, value) {
  const pVals = interpolateWHO(dataset, ageMo);
  if (!pVals) return null;
  const bands = [3, 15, 50, 85, 97];
  if (value <= pVals[0]) return '< P3';
  if (value >= pVals[4]) return '> P97';
  for (let i = 0; i < 4; i++) {
    if (value >= pVals[i] && value <= pVals[i + 1]) {
      const frac = (value - pVals[i]) / (pVals[i + 1] - pVals[i]);
      return `P${Math.round(bands[i] + frac * (bands[i + 1] - bands[i]))}`;
    }
  }
  return 'P50';
}

// ── SVG chart rendering ───────────────────────────────────────────────────────

/**
 * Render WHO percentile bands + child measurement points into an SVG element.
 * @param {SVGElement} svgEl
 * @param {string}     type      — 'weight' | 'height' | 'head'
 * @param {object[]}   entries   — health IDB entries
 * @param {string}     birthday  — ISO date "YYYY-MM-DD"
 * @param {string}     gender
 * @returns {string|null}        — percentile label of last measurement, or null
 */
export function renderGrowthSVG(svgEl, type, entries, birthday, gender) {
  if (!svgEl) return null;

  const genderKey = gender?.startsWith('m') ? 'boys' : 'girls';
  const dataset   = WHO_DATA[type]?.[genderKey] || [];
  if (!dataset.length) { svgEl.innerHTML = ''; return null; }

  const W = 300, H = 160, padL = 30, padB = 22, padT = 8, padR = 18;
  const maxX = dataset[dataset.length - 1][0];
  const vals = dataset.flatMap(r => r.slice(1));
  const minY = Math.min(...vals) * 0.97;
  const maxY = Math.max(...vals) * 1.02;

  const tx = m => padL + (Math.min(m, maxX) / maxX) * (W - padL - padR);
  const ty = v => H - padB - ((v - minY) / (maxY - minY)) * (H - padT - padB);

  const pColors = ['#e9d5ff', '#c4b5fd', '#8b5cf6', '#c4b5fd', '#e9d5ff'];
  const pWidths = [0.7, 0.7, 1.5, 0.7, 0.7];
  const pLabels = ['P3', 'P15', 'P50', 'P85', 'P97'];

  let out = '';

  // WHO percentile lines
  for (let pi = 0; pi < 5; pi++) {
    const pts  = dataset.map(r => `${tx(r[0]).toFixed(1)},${ty(r[pi + 1]).toFixed(1)}`).join(' ');
    const last = dataset[dataset.length - 1];
    out += `<polyline points="${pts}" fill="none" stroke="${pColors[pi]}" stroke-width="${pWidths[pi]}"/>`;
    out += `<text x="${(tx(last[0]) + 2).toFixed(1)}" y="${ty(last[pi + 1]).toFixed(1)}" font-size="5.5" fill="${pColors[pi]}" dominant-baseline="middle">${pLabels[pi]}</text>`;
  }

  // Axes
  out += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="var(--border,#e2e8f0)" stroke-width="0.5"/>`;
  out += `<line x1="${padL}" y1="${padT}"     x2="${padL}"     y2="${H - padB}" stroke="var(--border,#e2e8f0)" stroke-width="0.5"/>`;

  // X-axis tick labels
  [0, 6, 12, 18, 24].filter(m => m <= maxX).forEach(m => {
    out += `<text x="${tx(m).toFixed(1)}" y="${H - padB + 8}" font-size="6" fill="var(--text-muted,#94a3b8)" text-anchor="middle">${m}M</text>`;
  });

  // Y-axis unit label
  const unit = type === 'weight' ? 'kg' : 'cm';
  out += `<text x="6" y="${(H / 2).toFixed(1)}" font-size="6" fill="var(--text-muted,#94a3b8)" text-anchor="middle" transform="rotate(-90 6 ${(H / 2).toFixed(1)})">${unit}</text>`;

  // Child data points
  const childPts = entries
    .filter(e => e.type === type)
    .map(e => {
      const ageMo  = calcAgeMonthsAt(birthday, e.ts);
      if (ageMo === null) return null;
      return { ageMo, whoVal: toWHOUnits(type, e.value), id: e.id };
    })
    .filter(Boolean)
    .sort((a, b) => a.ageMo - b.ageMo);

  let lastPercentile = null;

  if (childPts.length > 0) {
    const linePts = childPts.map(p => `${tx(p.ageMo).toFixed(1)},${ty(p.whoVal).toFixed(1)}`).join(' ');
    out += `<polyline points="${linePts}" fill="none" stroke="#f97316" stroke-width="1.5" stroke-linejoin="round"/>`;
    childPts.forEach(p => {
      out += `<circle cx="${tx(p.ageMo).toFixed(1)}" cy="${ty(p.whoVal).toFixed(1)}" r="3" fill="#f97316" stroke="#fff" stroke-width="1"/>`;
    });
    const last = childPts[childPts.length - 1];
    lastPercentile = calcPercentile(dataset, last.ageMo, last.whoVal);
  }

  svgEl.innerHTML = out;
  return lastPercentile;
}

// ── Measurement list HTML ─────────────────────────────────────────────────────

const TYPE_META = {
  weight: { emoji: '⚖️', label: 'Gewicht',     fmt: v => `${(v / 1000).toFixed(2).replace('.', ',')} kg` },
  height: { emoji: '📏', label: 'Größe',        fmt: v => `${v} cm` },
  head:   { emoji: '📐', label: 'Kopfumfang',   fmt: v => `${v} cm` },
};

/**
 * Build the HTML list of measurements for the given type.
 * @param {object[]} entries
 * @param {string}   type
 * @param {string}   birthday
 * @returns {string}
 */
export function buildGrowthList(entries, type, birthday) {
  const meta = TYPE_META[type] || TYPE_META.weight;
  const typed = entries
    .filter(e => e.type === type && !e._deleted)
    .sort((a, b) => b.ts - a.ts);

  if (!typed.length) {
    return `<p class="empty-state">Noch kein ${meta.label} eingetragen.</p>`;
  }

  return typed.map(e => {
    const ageMo  = calcAgeMonthsAt(birthday, e.ts);
    const ageStr = ageMo !== null ? `${Math.floor(ageMo)} M` : '';
    const valStr = meta.fmt(e.value);
    const date   = new Date(e.ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="log-item">
      <span>${meta.emoji}</span>
      <div style="flex:1;min-width:0">
        <strong>${valStr}</strong>
        <br><small>${date}${ageStr ? ' · ' + ageStr : ''}</small>
      </div>
      <button class="icon-btn danger" onclick="deleteHealthEntry(${JSON.stringify(e.id)})">🗑️</button>
    </div>`;
  }).join('');
}
