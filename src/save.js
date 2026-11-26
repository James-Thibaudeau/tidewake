// localStorage persistence. Every access is guarded: private windows and
// blocked storage simply mean "no save". migrate() brings old saves up to date.
import { SAVE_KEY, SETTINGS_KEY, SAVE_VERSION, isTouch } from './config.js';
import { ENCOUNTERS, CARDS } from './rival-text.js';

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
  d.quests = { active: Array.isArray(q.active) ? q.active : [], done: Array.isArray(q.done) ? q.done : [], boards: q.boards || {}, pinned: q.pinned ?? null,
    reports: q.reports && typeof q.reports === 'object' ? q.reports : {} };
  const st = d.story && typeof d.story === 'object' ? d.story : {};
  d.story = { chapter: st.chapter ?? 0, journals: Array.isArray(st.journals) ? st.journals : [], flags: st.flags || {}, seenCards: Array.isArray(st.seenCards) ? st.seenCards : [] };
  d.ashore = d.ashore && typeof d.ashore === 'object' ? d.ashore : {};
  d.hold = Array.isArray(d.hold) ? d.hold : [];
  const rv = d.rival && typeof d.rival === 'object' ? d.rival : {};
  d.rival = { chapter: rv.chapter ?? 0, wins: rv.wins ?? 0, losses: rv.losses ?? 0, flags: rv.flags || {} };
  d.rival.log = Array.isArray(rv.log) ? rv.log : pastTalk(d.rival.chapter, d.profile?.name || 'Captain');
  // the Sightings log (sea-events.js). Crabs seen before the log was kept go in it.
  const sg = d.sightings && typeof d.sightings === 'object' ? d.sightings : {};
  d.sightings = { seen: sg.seen && typeof sg.seen === 'object' ? sg.seen : {}, miss: sg.miss && typeof sg.miss === 'object' ? sg.miss : {},
    chain: sg.chain && typeof sg.chain === 'object' ? sg.chain : null };
  const crabs = d.quests.reports.archCrabs;
  if (crabs && !d.sightings.seen.archCrabs) d.sightings.seen.archCrabs = { n: 1, day: crabs.day || 1, near: 'at Archway Isle' };
  d.v = SAVE_VERSION;
  return d;
}

/**
 * Sable's log for a save from before it was kept: what was said at each
 * encounter already behind you. The win or lose line wasn't saved, so it's left out.
 */
function pastTalk(chapter, captain) {
  const fill = (s) => s.replace(/\{captain\}/g, captain);
  const log = ENCOUNTERS.slice(0, Math.min(chapter, ENCOUNTERS.length))
    .map((e) => ({ title: e.title, lines: [...e.hail, ...(e.after || e.towing || [])].map(fill) }));
  for (const [ch, deck] of [[6, CARDS.mast], [7, CARDS.letter], [8, CARDS.finale]]) {
    if (chapter >= ch) log.push({ title: deck[0].title, scene: true, lines: deck.map((c) => fill(c.text)) });
  }
  return log;
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
  const def = { quality: isTouch ? 'low' : 'high', sound: true, music: true, musicVol: 1, effects: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch { return def; }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
