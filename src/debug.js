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
import { UPGRADES, SAVE_KEY, REFITS, ASHORE_BIOMES, ROUGH } from './config.js';
import { SEA_ZONES, bandAt, seaAt, swellAt, roughWear } from './sea-zones.js';
import { SEAS } from './story-text.js';
import { crossing, openSides } from './debug-pilot.js';
import { CUES } from './music/themes.js';
import { cueFor } from './music-cues.js';
import { PAINTS, keyOf } from './paints.js';

const BACKUP_KEY = SAVE_KEY + '.debug-backup';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

const HELP = `tidewake.debug
  state()                  one-line summary of where the game is
  start(profile?)          new voyage from the title, prologue skipped (backs up the save first)
  step(seconds, dt?)       advance the simulation without waiting for frames; returns state()
  frame()                  render one frame (do this before a screenshot when the tab is hidden)
  teleport(where, off?)    where: island id, island name, or { x, z }; puts the boat in open water nearby.
                           A rough zone's id (reach | rip | swell) puts it in the worst of that zone, bow to the island
  zone()                   the sea where the boat is: band (home | coastal | open), zone, what it does to the waves,
                           and in rough water its name, severity, swell and what it costs the hull a kilometre and a second
  give({ gold, cargo, health, upgrades, paints })   upgrades: 'max' or { sail: 3, hull: 2, … };
                           paints: 'all' or ['paint:harborBlue', 'figurehead:owl', …] for the paint yard
  journals(n, { anchor })  story: the first n journals found (0-7); anchor: true fits grandfather's anchor
  refit(tier, { open })    grandfather's anchor at refit tier 0-4 (fits the anchor too); open: biomes to
                           treat as having levels, e.g. ['rocky'], so their refit is offered (until reload)
  rival(chapter)           the rival captain: jump to a chapter (same as tidewake.rival.debug)
  rogue(from?, { severity })  send a rogue wave at the boat now, anywhere: from = degrees off the bow it comes
                           from (negative = port; none = picked), severity 1-3 = how big. rogue('state') =
                           the wave out there, the clock, what the last one cost, growlers in sight
  cross({ zone, from, badly, seed, waves })   a test pilot sails one crossing of a rough zone (reach | rip) and says
                           what it cost: the share of the hull, and how much of it was waves, battering, bow slams
                           and ice. badly: full sail and side-on to the waves (else reefed and bow-on); from: the
                           side to come in from, in degrees (cross({ zone, sides: true }) lists the open ones); waves: false = none
  sea(kind?, { at })       the living sea: bring on whale | dolphins | turtles | bottle | bloom | iceberg |
                           waterspout | ghostShip now (the bloom and the ghost ship make it night first);
                           no argument = what's out there, the next roll, bounties, the log, the ghost's chain.
                           at: { ahead, side } puts it that many metres ahead and to the right instead
  music(cue?, intensity?)  the score: no argument = what's playing (cue, intensity, layers, key, bar); a cue's name
                           (music('?') lists them) plays it whatever the game wants, at intensity 0-3 if given;
                           music(null) = silence; music('game') hands it back. Changes come on the next bar line
  ashore(where?)           go ashore on an island (async); no argument = grandfather's wreck
  weather(type)            clear | breezy | cloudy | rain | storm | fog
  time(t)                  time of day, 0-1 (0.25 dawn, 0.5 noon, 0.75 dusk)
  profile()                draw one frame and count it: draw calls, triangles, lights, and what is in view by kind
  bench(frames?)           time drawing the current view: ms a frame, with the graphics card's work included
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
      // a rough zone: the middle of its worst water, on the side nearest Port Haven
      const Z = typeof where === 'string' ? SEA_ZONES.find((r) => r.severity && r.id === where) : null;
      if (Z) {
        const mid = (Z.inner + Z.outer) / 2;
        const c = Z.edge ? { x: 300, z: Z.inner + 150 } : { x: Z.x - (Z.x / Math.hypot(Z.x, Z.z)) * mid, z: Z.z - (Z.z / Math.hypot(Z.x, Z.z)) * mid };
        api.teleport(c, 0);
        g.boat.heading = Z.edge ? 0 : Math.atan2(Z.x - c.x, Z.z - c.z);
        return api.state();
      }
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

    /** The sea zones' reading at the boat (sea-zones.js), and the weather it has to work with. */
    zone() {
      const b = g.boat.pos, s = seaAt(b.x, b.z);
      return {
        band: bandAt(b.x, b.z), zone: s.zone, fromPortHaven: Math.round(Math.hypot(b.x, b.z)),
        shallow: round(s.shallow, 2), open: round(s.open, 2),
        rough: round(s.rough, 2), severity: s.severity, roughZone: s.roughZone, name: s.roughZone ? SEAS[s.roughZone] : null,
        wave: round(s.wave, 2), swell: round(s.swell, 2), swellFloor: round(s.floor, 2),
        swellNow: round(swellAt(s, g.weather.p.swell), 2), // what the bow slams and the camera feel
        // what the sea takes here with this sail up: hull points a kilometre, and a second at this speed
        hullPerKm: round(roughWear(s, g.boat.sailLevel, g.upv.keel) * 1000 * g.boat.maxHealth, 1),
        hullPerSecond: round(roughWear(s, g.boat.sailLevel, g.upv.keel) * Math.max(Math.abs(g.boat.speed), ROUGH.drift) * g.boat.maxHealth, 3),
        weather: g.weather.type, weatherFor: Math.round(g.weather.timer),
      };
    },

    give({ gold, cargo, health, upgrades, paints } = {}) {
      const s = g.state;
      if (paints) for (const k of paints === 'all' ? PAINTS.map(keyOf) : paints) if (!s.paints.includes(k)) s.paints.push(k);
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

    refit(tier = 0, { open = [] } = {}) {
      for (const b of open) ASHORE_BIOMES.add(b);
      g.story.S.flags.anchor = 'fitted';
      g.story.S.flags.refit = null;
      g.state.upgrades.anchor = Math.max(0, Math.min(REFITS.length - 1, tier));
      g.syncAnchor();
      g.quests.version++;
      return { tier: g.refits.tier, landable: [...ASHORE_BIOMES], next: g.refits.next?.label || null, blocker: g.refits.blocker() };
    },

    rival(chapter) { return g.rival.debug(chapter); },

    /** A rogue wave now (rough-water.js). It needs open water all the way in. */
    rogue(from = null, { severity = 3 } = {}) {
      const R = g.rough;
      if (from === 'state') return R.debugState();
      R.clear();
      if (!R.launch(severity, from == null ? null : (from * Math.PI) / 180)) throw new Error('No room for a rogue wave here: land in the way.');
      api.step(1 / 60);
      return R.debugState();
    },

    /** The test pilot (debug-pilot.js): one crossing of a rough zone, and what it cost the hull. */
    cross(opts = {}) {
      if (opts === 'sides') opts = { sides: true };
      const Z = SEA_ZONES.find((r) => r.id === (opts.zone || 'reach'));
      if (opts.sides) return openSides(g, Z).map((a) => Math.round((a * 180) / Math.PI));
      return crossing(g, { ...opts, from: opts.from == null ? undefined : (opts.from * Math.PI) / 180, zone: Z?.id });
    },

    sea(kind, { at = null } = {}) {
      const se = g.seaEvents;
      if (kind == null) return se.debugState();
      if ((kind === 'ghostShip' || kind === 'bloom') && g.env.night < 0.6) { api.time(0); api.step(0.1); }
      if (!se.spawn(kind, { say: false })) throw new Error(`No "${kind}" here: unknown kind, or no open water off the bow.`);
      if (at) {
        const b = g.boat, a = se.live.actor, f = at.ahead ?? 120, r = at.side ?? 0;
        const dx = b.pos.x + Math.sin(b.heading) * f - Math.cos(b.heading) * r - a.pos.x, dz = b.pos.z + Math.cos(b.heading) * f + Math.sin(b.heading) * r - a.pos.z;
        a.pos.x += dx; a.pos.z += dz;
        for (const t of a.line || []) { t.x += dx; t.z += dz; } // the turtles are placed one by one
      }
      return se.debugState();
    },

    /** Resolves once the level is in; it waits on a real fade, so `await` it. */
    async ashore(where) {
      if (where == null) { api.teleport(g.world.wreck, 60); await g.ashore.enterWreck(); }
      else { const I = island(where); g.story.S.flags.anchor = 'fitted'; api.teleport(I, 40); await g.ashore.enter(I); }
      return api.state();
    },

    weather(type) { g.weather.set(type, true); return g.weather.type; },
    music(cue, intensity) {
      const A = g.audio;
      if (!A.ctx) return 'No sound yet: click or press a key in the game first.';
      if (cue === '?') return Object.keys(CUES);
      if (cue === 'game') A.forceMusic();
      else if (cue !== undefined) {
        if (cue !== null && !CUES[cue]) return `No cue called "${cue}". Choose from: ${Object.keys(CUES).join(', ')}, null (silence), 'game'.`;
        A.forceMusic(cue, intensity);
      }
      return { ...A.musicState(), wants: cueFor(g.musicNow()) };
    },
    time(t) { g.state.dayT = ((t % 1) + 1) % 1; return g.state.dayT; },

    /**
     * How long a frame takes to draw, in ms: draws `frames` of the current view
     * back to back, then waits for the graphics card to finish them (reading one
     * pixel back does that). Works in a hidden tab. Compare like with like: the
     * same view, window size and quality, before and after a change.
     */
    bench(frames = 40) {
      const gl = g.renderer.getContext(), px = new Uint8Array(4);
      const wait = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      api.frame(); wait(); // shaders compiled and buffers sent before the clock starts
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) api.frame();
      wait();
      const c = g.renderer.domElement;
      return { ms: round((performance.now() - t0) / frames, 2), frames, size: `${c.width}×${c.height}`, quality: g.settings.quality, effects: g.fx.enabled !== false };
    },

    /**
     * Where a frame goes. Draws one frame of the current view (the sea, or the
     * island you are on) and counts it: draw calls and triangles as the
     * renderer reports them (every pass: shadows and effects too), what it
     * holds in memory, how many lights the scene's materials pay for, and what
     * is in the view by kind, biggest first. Ink outlines (the same mesh drawn
     * again, inside out) are counted apart from what they outline.
     */
    profile() {
      const info = g.renderer.info, auto = info.autoReset;
      if (g.fx.csm) g.fx.scan(g.view.scene); // new meshes cast shadows from here on (fx.js looks every 20 frames)
      info.autoReset = false;
      info.reset();
      api.frame();
      const out = { view: g.view.scene === g.scene ? 'sea' : 'ashore', calls: info.render.calls, triangles: info.render.triangles,
        geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs.length, lights: 0, kinds: {} };
      info.autoReset = auto;
      const named = (o) => { for (let p = o; p; p = p.parent) if (p.name) return p.name.split(':')[0]; return o.material?.type || o.type; };
      g.view.scene.traverseVisible((o) => {
        if (o.isPointLight || o.isSpotLight || o.isDirectionalLight) out.lights++;
        const geo = o.geometry;
        if (!geo || !(o.isMesh || o.isLine || o.isPoints)) return;
        const n = Math.min(geo.drawRange.count, geo.index ? geo.index.count : geo.attributes.position?.count || 0);
        const ink = o.material?.isMeshBasicMaterial && o.material.side === 1; // back faces only: an inverted-hull outline
        const k = (out.kinds[named(o) + (ink ? ' (ink)' : '')] ||= { draws: 0, triangles: 0 });
        k.draws++;
        k.triangles += Math.round((n / 3) * (o.isInstancedMesh ? o.count : 1));
      });
      out.kinds = Object.fromEntries(Object.entries(out.kinds).sort((a, b) => b[1].triangles - a[1].triangles));
      return out;
    },
  };

  g.debug = api;
  return api;
}
