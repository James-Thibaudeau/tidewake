// Console helpers for testing: `tidewake.debug.help()`.
//
// The game is `window.tidewake`; these sit on `tidewake.debug`. They exist so
// a feature can be reached and exercised in seconds instead of minutes of
// sailing, and so the game can be driven while its tab is hidden (a hidden
// tab gets no animation frames and the game pauses itself).
//
// Nothing here runs unless it is called. start() and anything that saves
// overwrite the save in localStorage, so start() backs the real one up first.
// Always finish with restoreSave(): it puts the save back and reloads, and
// without it the test voyage is saved over the real one when the tab closes.
import { UPGRADES, SAVE_KEY } from './config.js';

const BACKUP_KEY = SAVE_KEY + '.debug-backup';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

const HELP = `tidewake.debug
  state()                  one-line summary of where the game is
  start(profile?)          new voyage from the title, prologue skipped (backs up the save first)
  step(seconds, dt?)       advance the simulation without waiting for frames; returns state()
  frame()                  render one frame (do this before a screenshot when the tab is hidden)
  teleport(where, off?)    where: island id, island name, or { x, z }; puts the boat in open water nearby
  give({ gold, cargo, health, upgrades })   upgrades: 'max' or { sail: 3, hull: 2, … }
  journals(n, { anchor })  story: the first n journals found (0-7); anchor: true fits grandfather's anchor
  rival(chapter)           the rival captain: jump to a chapter (same as tidewake.rival.debug)
  ashore(where?)           go ashore on an island (async); no argument = grandfather's wreck
  weather(type)            clear | breezy | cloudy | rain | storm | fog
  time(t)                  time of day, 0-1 (0.25 dawn, 0.5 noon, 0.75 dusk)
  backupSave()             copy the real save aside (start() does this for you)
  restoreSave()            put it back and reload to the title; always finish with this`;

export function installDebug(game) {
  const g = game;

  const island = (where) => {
    if (where && typeof where === 'object') return where;
    const list = g.world.islands;
    const I = typeof where === 'number' ? list[where] : list.find((x) => x.name?.toLowerCase() === String(where).toLowerCase());
    if (!I) throw new Error(`No island "${where}". Try an id 0-${list.length - 1} or a name such as "${list[1]?.name}".`);
    return I;
  };

  /** "Name (id), 340 m": the closest island to a point. */
  const nearest = (x, z) => {
    let best = null, bd = Infinity;
    for (const I of g.world.islands) {
      const d = Math.hypot(I.x - x, I.z - z) - (I.r || 0);
      if (d < bd) { bd = d; best = I; }
    }
    return best ? `${best.name} (${best.id}), ${Math.max(0, Math.round(bd))} m` : null;
  };

  const api = {
    help() { console.log(HELP); return HELP; },

    state() {
      const s = g.state, b = g.boat;
      return {
        mode: g.mode, paused: !!g.paused,
        x: round(b.pos.x), z: round(b.pos.z), heading: round(b.heading, 2), speed: round(b.speed || 0),
        banked: s.banked, cargo: s.cargo, health: round(s.health),
        upgrades: { ...s.upgrades },
        day: s.day, dayT: round(s.dayT, 2), weather: g.weather.type,
        story: s.story.chapter, journals: s.story.journals.length, anchor: s.story.flags.anchor || null,
        rival: s.rival.chapter, quests: s.quests.active.length,
        near: nearest(b.pos.x, b.pos.z),
      };
    },

    backupSave() {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw != null) localStorage.setItem(BACKUP_KEY, raw);
      return raw != null;
    },
    /**
     * Put the backed-up save back and reload to the title. The game saves the
     * voyage when the tab closes mid-sail, which would write the test state
     * over the save just restored, so this leaves 'sailing' first.
     */
    restoreSave({ reload = true } = {}) {
      const raw = localStorage.getItem(BACKUP_KEY);
      g.mode = 'title';
      if (raw != null) {
        localStorage.setItem(SAVE_KEY, raw);
        localStorage.removeItem(BACKUP_KEY);
      }
      if (reload) setTimeout(() => location.reload(), 0);
      return raw != null;
    },

    start(profile = null) {
      if (localStorage.getItem(BACKUP_KEY) == null) api.backupSave();
      g.startNew(profile);
      g.ui.storyStep?.(Infinity); // skip the prologue cards
      g.setPaused(false);
      return api.state();
    },

    step(seconds = 1, dt = 1 / 60) {
      if (g.paused) g.setPaused(false);
      for (let n = Math.max(1, Math.round(seconds / dt)); n > 0; n--) g.update(dt);
      return api.state();
    },

    frame() {
      g.fx.update(g, g.view);
      g.fx.render(g.view, 1 / 60);
    },

    teleport(where, off = 120) {
      const at = island(where);
      const reach = (at.bound || at.r || 0) + off;
      const to = at.dock || null;
      // prefer the side the dock is on, then sweep round the island for open water
      const a0 = to ? Math.atan2(to.z - at.z, to.x - at.x) : 0;
      for (let k = 0; k < 32; k++) {
        const a = a0 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.2;
        const x = at.x + Math.cos(a) * reach, z = at.z + Math.sin(a) * reach;
        if (g.world.heightAt(x, z) > -2 || g.world.rockHit(x, z, 8)) continue;
        g.boat.place(x, z, Math.atan2(at.x - x, at.z - z));
        g.boat.speed = 0;
        g.streamer.buildAll(x, z);
        if (g.mode === 'title') g.beginSailing();
        return api.state();
      }
      throw new Error('No open water found there; try a larger offset.');
    },

    give({ gold, cargo, health, upgrades } = {}) {
      const s = g.state;
      if (gold != null) s.banked += gold;
      if (cargo != null) s.cargo += cargo;
      if (upgrades) {
        for (const U of UPGRADES) {
          const want = upgrades === 'max' ? U.tiers.length - 1 : upgrades[U.key];
          if (want != null) s.upgrades[U.key] = Math.max(0, Math.min(U.tiers.length - 1, want));
        }
        g.applyUpgrades();
      }
      s.health = health ?? (upgrades ? g.boat.maxHealth : s.health);
      return api.state();
    },

    journals(n = 0, { anchor = false } = {}) {
      const S = g.story.S;
      n = Math.max(0, Math.min(ROMAN.length, n));
      S.journals = ROMAN.slice(0, n);
      S.chapter = n + 1;
      if (n >= 1) { g.state.upgrades.spyglass = Math.max(1, g.state.upgrades.spyglass || 0); g.applyUpgrades(); }
      if (anchor) S.flags.anchor = 'fitted';
      g.syncAnchor();
      g.story.syncCamps();
      return api.state();
    },

    rival(chapter) { return g.rival.debug(chapter); },

    /** Resolves once the level is in; it waits on a real fade, so `await` it. */
    async ashore(where) {
      if (where == null) { api.teleport(g.world.wreck, 60); await g.ashore.enterWreck(); }
      else { const I = island(where); g.story.S.flags.anchor = 'fitted'; api.teleport(I, 40); await g.ashore.enter(I); }
      return api.state();
    },

    weather(type) { g.weather.set(type, true); return g.weather.type; },
    time(t) { g.state.dayT = ((t % 1) + 1) % 1; return g.state.dayT; },
  };

  g.debug = api;
  return api;
}
