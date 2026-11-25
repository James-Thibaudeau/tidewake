// Small helpers shared by the UI modules.
export const $ = (id) => document.getElementById(id);
export const TAU = Math.PI * 2;
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export const fillVars = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
export const PX_PER_DEG = 2.6; // compass strip and tracker: pixels per degree of bearing
export const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.floor(n || 0).toLocaleString();
