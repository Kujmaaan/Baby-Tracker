/* ═══════════════════════════════════════════════════════════
   Baby Tracker — Konstanten & Konfigurations-Defaults
   ═══════════════════════════════════════════════════════════ */

export const CFG_KEY = 'bt-cfg-v3';
export const APP_VERSION = '2.0.0';
export const DEVICE_ID = (() => {
  let id = localStorage.getItem('bt-device-id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('bt-device-id', id); }
  return id;
})();

export const GENDER_MAP = {
  male:      { label:'Junge',       emoji:'👦', color:'#4f46e5' },
  female:    { label:'Mädchen',     emoji:'👧', color:'#db2777' },
  nonbinary: { label:'Nicht-binär', emoji:'🧒', color:'#7c3aed' },
  diverse:   { label:'Divers',      emoji:'👶', color:'#059669' },
  inter:     { label:'Inter',       emoji:'👶', color:'#d97706' },
  none:      { label:'–',           emoji:'👶', color:'#6b7280' },
};

export const DEFAULT_CFG = {
  onboarded: false,
  children:  [],
  activeChildId: null,
  who: '',
  parents: [],
  familyId: null,
  theme: 'light',
  version: APP_VERSION,
};

// ── SVG Icons ─────────────────────────────────────────────────
export const ICONS = {
  MOON: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  SUN:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  TRASH:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  EDIT: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  WAKE: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
};

// ── Preset Meilensteine ────────────────────────────────────────
export const PRESET_MILESTONES = [
  { id:'ms_smile',    label:'Erstes Lächeln',            emoji:'😊', ageM:1 },
  { id:'ms_neck',     label:'Kopf heben (Bauchlage)',    emoji:'💪', ageM:2 },
  { id:'ms_laugh',    label:'Erstes Lachen',             emoji:'😄', ageM:3 },
  { id:'ms_roll',     label:'Umdrehen',                  emoji:'🔄', ageM:4 },
  { id:'ms_sit',      label:'Sitzen mit Unterstützung',  emoji:'🪑', ageM:6 },
  { id:'ms_solids',   label:'Erste Beikost',             emoji:'🥕', ageM:6 },
  { id:'ms_crawl',    label:'Krabbeln',                  emoji:'🐛', ageM:8 },
  { id:'ms_stand',    label:'Freies Stehen',             emoji:'🧍', ageM:9 },
  { id:'ms_words',    label:'Erste Worte',               emoji:'💬', ageM:12 },
  { id:'ms_walk',     label:'Erste Schritte',            emoji:'👣', ageM:12 },
  { id:'ms_run',      label:'Rennen',                    emoji:'🏃', ageM:18 },
  { id:'ms_2words',   label:'Zwei-Wort-Sätze',           emoji:'🗣️',  ageM:24 },
];

// ── WHO Wachstumsdaten ─────────────────────────────────────────
// Quelle: WHO Child Growth Standards (2006)
// Format: [Monat, P3, P15, P50, P85, P97]
export const WHO_DATA = {
  weight: {
    boys:  [
      [0,2.5,2.9,3.3,3.9,4.4],[1,3.4,3.9,4.5,5.1,5.8],[2,4.3,4.9,5.6,6.3,7.1],
      [3,5.0,5.7,6.4,7.2,8.0],[4,5.6,6.2,7.0,7.8,8.7],[5,6.0,6.7,7.5,8.4,9.3],
      [6,6.4,7.1,7.9,8.8,9.8],[7,6.7,7.4,8.3,9.2,10.3],[8,6.9,7.7,8.6,9.6,10.7],
      [9,7.1,7.9,8.9,9.9,11.0],[10,7.4,8.2,9.2,10.2,11.4],[11,7.6,8.4,9.4,10.5,11.7],
      [12,7.7,8.6,9.6,10.8,11.9],[15,8.3,9.2,10.3,11.5,12.8],[18,8.8,9.8,10.9,12.2,13.5],
      [21,9.2,10.3,11.5,12.9,14.2],[24,9.7,10.8,12.0,13.5,14.9],
    ],
    girls: [
      [0,2.4,2.8,3.2,3.7,4.2],[1,3.2,3.6,4.2,4.8,5.5],[2,4.0,4.5,5.1,5.8,6.6],
      [3,4.6,5.2,5.8,6.6,7.5],[4,5.1,5.7,6.4,7.3,8.2],[5,5.5,6.1,6.9,7.8,8.8],
      [6,5.8,6.5,7.3,8.2,9.3],[7,6.1,6.8,7.6,8.6,9.7],[8,6.3,7.0,7.9,9.0,10.2],
      [9,6.5,7.3,8.2,9.3,10.4],[10,6.7,7.5,8.5,9.6,10.9],[11,6.9,7.7,8.7,9.9,11.2],
      [12,7.0,7.9,8.9,10.1,11.5],[15,7.6,8.5,9.6,10.9,12.4],[18,7.8,8.8,10.2,11.6,13.2],
      [21,8.4,9.5,10.9,12.4,14.0],[24,8.7,9.8,11.5,13.2,14.9],
    ],
  },
  height: {
    boys:  [
      [0,46.1,47.9,49.9,51.8,53.7],[1,51.1,53.0,54.7,56.5,58.4],[2,54.7,56.7,58.4,60.1,62.2],
      [3,57.3,59.4,61.4,63.3,65.5],[4,59.7,61.8,63.9,65.9,68.0],[5,61.7,63.8,65.9,68.0,70.1],
      [6,63.3,65.5,67.6,69.8,71.9],[9,68.0,70.2,72.3,74.6,76.9],[12,71.7,73.9,75.7,78.6,81.2],
      [15,74.8,77.1,79.1,81.7,84.2],[18,77.5,79.9,82.3,85.0,87.7],[21,80.1,82.6,85.1,88.1,91.0],
      [24,82.3,85.1,87.8,91.0,93.7],
    ],
    girls: [
      [0,45.4,47.3,49.1,51.0,52.9],[1,49.8,51.7,53.7,55.6,57.6],[2,53.0,55.0,57.1,59.1,61.1],
      [3,55.6,57.7,59.8,61.9,64.0],[4,57.8,60.0,62.1,64.3,66.4],[5,59.6,61.9,64.0,66.2,68.5],
      [6,61.2,63.5,65.7,68.0,70.2],[9,65.6,68.0,70.1,72.6,75.0],[12,69.2,71.7,74.0,76.7,79.2],
      [15,72.8,75.3,77.5,80.7,83.5],[18,75.0,78.4,80.7,83.9,86.4],[21,78.0,81.0,83.7,87.0,89.9],
      [24,80.0,83.2,86.4,89.8,92.9],
    ],
  },
  head: {
    boys:  [
      [0,32.1,33.1,34.5,35.8,36.9],[1,35.1,36.1,37.3,38.4,39.4],[2,37.0,38.0,39.1,40.2,41.2],
      [3,38.6,39.5,40.5,41.5,42.4],[4,39.7,40.6,41.6,42.6,43.5],[6,41.5,42.4,43.3,44.3,45.1],
      [9,43.5,44.4,45.3,46.2,47.1],[12,44.9,45.8,46.8,47.7,48.6],[18,46.5,47.5,48.4,49.3,50.3],
      [24,47.6,48.6,49.5,50.5,51.4],
    ],
    girls: [
      [0,31.7,32.9,33.9,35.1,36.1],[1,34.3,35.4,36.5,37.6,38.7],[2,36.0,37.1,38.3,39.4,40.5],
      [3,37.5,38.5,39.5,40.5,41.5],[4,38.6,39.6,40.6,41.6,42.6],[6,40.2,41.2,42.2,43.2,44.2],
      [9,42.0,43.0,44.0,45.0,46.0],[12,43.5,44.6,45.6,46.7,47.6],[18,45.1,46.2,47.2,48.3,49.3],
      [24,46.1,47.2,48.3,49.4,50.4],
    ],
  },
};
