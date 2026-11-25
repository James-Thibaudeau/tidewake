// localStorage persistence. Every access is guarded: private windows and
// blocked storage simply mean "no save".
import { SAVE_KEY, SETTINGS_KEY, SAVE_VERSION, isTouch } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch { return null; }
}

/**
 * Bring a save of any older version up to SAVE_VERSION by filling in the
 * fields later versions added. Every field is optional on load, so a v1 save
 * simply gains empty defaults. Returns the same object (or null).
 */
export function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  d.profile = d.profile && typeof d.profile === 'object' ? d.profile : null;
  d.wardrobe = Array.isArray(d.wardrobe) ? d.wardrobe : [];
  const q = d.quests && typeof d.quests === 'object' ? d.quests : {};
  d.quests = { active: Array.isArray(q.active) ? q.active : [], done: Array.isArray(q.done) ? q.done : [], boards: q.boards || {}, pinned: q.pinned ?? null };
  const st = d.story && typeof d.story === 'object' ? d.story : {};
  d.story = { chapter: st.chapter ?? 0, journals: Array.isArray(st.journals) ? st.journals : [], flags: st.flags || {}, seenCards: Array.isArray(st.seenCards) ? st.seenCards : [] };
  d.ashore = d.ashore && typeof d.ashore === 'object' ? d.ashore : {};
  d.hold = Array.isArray(d.hold) ? d.hold : [];
  const rv = d.rival && typeof d.rival === 'object' ? d.rival : {};
  d.rival = { chapter: rv.chapter ?? 0, wins: rv.wins ?? 0, losses: rv.losses ?? 0, flags: rv.flags || {} };
  d.v = SAVE_VERSION;
  return d;
}

export function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function encodeBytes(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeBytes(str, len) {
  const out = new Uint8Array(len);
  try {
    const s = atob(str || '');
    for (let i = 0; i < Math.min(len, s.length); i++) out[i] = s.charCodeAt(i);
  } catch { /* ignore */ }
  return out;
}

export function loadSettings() {
  const def = { quality: isTouch ? 'low' : 'high', sound: true, music: true, effects: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch { return def; }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
