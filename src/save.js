// localStorage persistence. Every access is guarded: private windows and
// blocked storage simply mean "no save".
import { SAVE_KEY, SETTINGS_KEY, isTouch } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
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
  const def = { quality: isTouch ? 'low' : 'high', sound: true, music: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch { return def; }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
