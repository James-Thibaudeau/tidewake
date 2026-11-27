// Fireworks in the game: the hold (what a port's Stores have sold you), lighting a
// rocket with F while sailing, the grand finale that runs by itself, and who notices:
// Sable answers with one of their own when the Redwing is in sight, and a port cheers
// one set off beside it at night. Nothing here changes a stat.
//
// What a shell is and the finale's running order are fireworks/shells.js (pure); the
// sparks are drawn by fireworks/sky.js; the sounds are audio/fireworks.js; the Stores
// tab and the button at sea are ui/stores.js.
//
// game.state.fireworks = { rocket, special, finale, cheered }: counts in the hold, and
// the ports that have had their one toast. A wreck doesn't take them.
//
// From code: `game.fireworks.finale({ free: true, from: { x, z, heading } })` runs a
// grand finale that isn't out of the hold, from a fixed place (a town's own show);
// `launch(kind, opts)` lights one rocket.
import * as THREE from 'three';
import { FIREWORKS } from './config.js';
import { clamp, damp } from './util.js';
import { ownsPaint } from './paints.js';
import { FireworkSky } from './fireworks/sky.js';
import { KINDS, makeShell, makeRocket, finaleShow, specialsFor, noRoomFor, stow } from './fireworks/shells.js';
import { FIREWORK } from './rival-text.js';
import { STORES } from './story-text.js';

const LOADS = ['rocket', 'special', 'finale'];
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const _v = new THREE.Vector3(), _light = new THREE.Color();

export class Fireworks {
  constructor(game) {
    this.game = game;
    this.sky = new FireworkSky(game.scene, { low: game.settings.quality === 'low' });
    this.loaded = 'rocket';  // what F sets off: rocket | special | finale
    this.time = 0;
    this.cool = 0;           // seconds until the next rocket can be lit
    this.up = 0;             // the time at which the last shell lit will have burnt out
    this.mine = 0;           // …and the last of your own, which the camera watches
    this.theirs = 0;         // …and of Sable's reply, which it half watches
    this.watch = 0;          // 0-1: how far the sea camera has pulled back to look up (game.js)
    this.bursts = [];        // rockets on their way up: what happens when each one bursts
    this.show = null;        // a grand finale under way: { t, list, i, from }
    this.answer = null;      // Sable's reply on its way: { t }
    this.answerCool = 0;
    this.cheerCool = 0;
    this.bag = [];           // the kinds still to come out of this box of rockets
    this.specialN = 0;
    this.seed = 1 + Math.floor(Math.random() * 1e6);
    game.events.on('ashore:leave', () => this.reset()); // the sea stood still while you were on the island
  }

  get stock() { return this.game.state.fireworks; }
  /** Sable's crimson wing comes with the crimson cloth (paints.js). */
  get wing() { return ownsPaint(this.game.state, 'cloth', 'crimson'); }
  /** Is any firework aboard? */
  get any() { const s = this.stock; return !!s && s.rocket + s.special + s.finale > 0; }

  // ---------------------------------------------------------------- the hold
  /** Buy an item from the Stores with banked gold. Returns true on success. */
  buy(id) {
    const g = this.game, s = g.state, item = FIREWORKS.items[id];
    if (!item) return false;
    const full = noRoomFor(s.fireworks, id);
    if (full) { g.ui.toast(fill(STORES.noRoom[full], { n: FIREWORKS.finales }), 'warn'); return false; }
    if (s.banked < item.price) { g.ui.toast('Not enough gold', 'warn'); return false; }
    s.banked -= item.price;
    stow(s.fireworks, id);
    if (!(s.fireworks[this.loaded] > 0)) this.settle();
    g.audio.play('upgrade');
    g.ui.toast(fill(STORES.stowed, { item: item.name }), 'gold');
    g.savePortState();
    return true;
  }

  /** Load something there is some of: rockets first, the grand finale only if it's all there is. */
  settle() { this.loaded = LOADS.find((k) => this.stock[k] > 0) || 'rocket'; }

  /** G: load the next kind there is any of. */
  cycle() {
    const s = this.stock, i = LOADS.indexOf(this.loaded);
    for (let k = 1; k <= LOADS.length; k++) {
      const next = LOADS[(i + k) % LOADS.length];
      if (s[next] > 0) { if (next !== this.loaded) this.game.audio.play('click'); this.loaded = next; return next; }
    }
    return this.loaded;
  }

  // ------------------------------------------------------------------ firing
  /** F: set off what is loaded. Returns true if something went up. */
  fire() {
    const g = this.game, s = this.stock, kind = this.loaded;
    if (g.mode !== 'sailing') return false;
    if (!(s[kind] > 0)) { this.say(this.any ? STORES.none[kind] : STORES.nothing, this.any ? 'warn' : 'info'); return false; }
    if (kind === 'finale') {
      if (this.show) { this.say(STORES.running, 'info'); return false; }
      if (!this.finale()) return false;
      g.ui.toast(STORES.lit, 'gold');
      g.saveVoyage();
      return true;
    }
    if (this.cool > 0) return false;
    // Low quality: one show at a time
    if (this.sky.low && (this.show || this.time < this.up - 0.4)) { this.say(STORES.wait, 'info'); return false; }
    s[kind]--;
    this.cool = FIREWORKS.gap;
    this.launch(kind === 'special' ? this.nextSpecial() : this.nextKind());
    return true;
  }

  /** A toast, but not the same one over and over while F is held down. */
  say(text, kind) {
    if (this.said === text && this.time - this.saidAt < 3) return;
    this.said = text; this.saidAt = this.time;
    this.game.ui.toast(text, kind);
  }

  /** The next rocket out of the box: every kind once, in a new order each time round. */
  nextKind() {
    if (!this.bag.length) this.bag = [...KINDS].sort(() => Math.random() - 0.5);
    return this.bag.pop();
  }
  nextSpecial() {
    const list = specialsFor(this.wing);
    return list[this.specialN++ % list.length];
  }

  /**
   * Light one rocket. By default it leaves your ship's stern and bursts over where she
   * will be by then. Options:
   *   from    { x, y, z }: where it leaves from instead
   *   over    { x, z }: the point on the sea it bursts above
   *   side    metres to starboard of `over` (negative: to port), for a ship on `heading` (default: yours)
   *   height  how high, as a share of the usual height
   *   color   a name from shells.js COLORS (else the shell picks)
   *   mine    false: not yours, so the camera doesn't look up for it and nobody answers it
   */
  launch(kind, { from = null, over = null, side = 0, heading = null, height = 1, color = null, seed = this.seed++, mine = true } = {}) {
    const g = this.game, boat = g.boat, T = FIREWORKS.rise, k = boat.sizeScale;
    const h = heading ?? boat.heading;
    if (!from) { boat.group.localToWorld(_v.set(0, 1.3 * k, -3.3 * k)); from = { x: _v.x, y: _v.y, z: _v.z }; }
    // the ship sails on while it climbs: aim for where she will be a moment after it bursts
    if (!over) { const lead = boat.speed * (T + 0.8); over = { x: boat.pos.x + Math.sin(h) * lead, z: boat.pos.z + Math.cos(h) * lead }; }
    const tx = over.x - Math.cos(h) * side, tz = over.z + Math.sin(h) * side;
    const detail = this.sky.detail;
    const rocket = makeRocket({ seed, height: FIREWORKS.height * height - from.y, rise: T, dx: tx - from.x, dz: tz - from.z, detail });
    const at = { x: from.x + rocket.apex[0], y: from.y + rocket.apex[1], z: from.z + rocket.apex[2] };
    const cam = g.camera.position;
    const shell = makeShell(kind, { seed, color, detail, face: Math.atan2(cam.x - at.x, cam.z - at.z) });
    this.sky.add(rocket, from, 0);
    this.sky.add(shell, at, T);
    this.sky.light(at, shell.light, T);
    g.audio.play('rocket', { volume: this.heard(from) });
    this.bursts.push({ t: this.time + T, at, shell, mine });
    this.up = Math.max(this.up, this.time + T + shell.life);
    if (mine) this.mine = Math.max(this.mine, this.time + T + Math.min(shell.life, 2.4));
    return shell;
  }

  /** How loud something at `p` is from where the camera is: 1 close by, fading over a kilometre. */
  heard(p) {
    const c = this.game.camera.position;
    return clamp(1.15 - Math.hypot(p.x - c.x, p.z - c.z) / 1100, 0.2, 1);
  }

  /**
   * The grand finale: forty shells over half a minute, by itself. `free`: not out of the
   * hold. `from`: { x, z, y?, heading? }, a fixed place to set it off from instead of the
   * ship (the camera then doesn't look up for it; whoever runs the scene points it).
   * Returns false if one is already going, or there is none to light.
   */
  finale({ free = false, from = null } = {}) {
    if (this.show) return false;
    if (!free) {
      if (!(this.stock.finale > 0)) return false;
      this.stock.finale--;
    }
    this.show = { t: 0, i: 0, from, list: finaleShow(this.seed++, { wing: this.wing }) };
    return true;
  }

  // -------------------------------------------------------------- each frame
  /** Every frame at sea. `acts`: this frame's key presses (input.js). */
  update(dt, acts = {}) {
    const g = this.game;
    if (this.synced !== g.state) { this.synced = g.state; this.reset(); this.settle(); }
    this.time += dt;
    this.cool -= dt; this.answerCool -= dt; this.cheerCool -= dt;
    if (acts.fireworkNext) this.cycle();
    if (acts.firework) this.fire();

    // the grand finale lights its own rockets
    const S = this.show;
    if (S) {
      S.t += dt;
      // (side by side they need a wide picture: closer together on a screen taller than it is wide)
      const spread = 30 * clamp(g.camera.aspect, 0.55, 1);
      while (S.i < S.list.length && S.list[S.i].t <= S.t) {
        const r = S.list[S.i++], F = S.from;
        this.launch(r.kind, F
          ? { from: { x: F.x, y: F.y ?? 2, z: F.z }, over: { x: F.x, z: F.z }, heading: F.heading ?? 0, side: r.side * spread, height: r.height, color: r.color, seed: r.seed, mine: false }
          : { side: r.side * spread, height: r.height, color: r.color, seed: r.seed });
      }
      if (S.i >= S.list.length) this.show = null;
    }

    // rockets that have got to the top
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      if (b.t > this.time) continue;
      this.bursts.splice(i, 1);
      this.burst(b);
    }

    // Sable's reply (on Low it waits for the sky to clear)
    const A = this.answer;
    if (A && (A.t -= dt) <= 0 && !(this.sky.low && (this.show || this.time < this.up))) {
      this.answer = null;
      this.reply();
    }

    // the camera looks up while one of yours is in the air, and part of the way for Sable's
    const looking = g.mode !== 'sailing' ? 0 : this.time < this.mine ? 1 : this.time < this.theirs ? 0.4 : 0;
    this.watch = damp(this.watch, looking, looking > this.watch ? 2.6 : 1.3, dt);
    if (this.watch < 0.002) this.watch = 0;

    const w = g.weather.wind; // a Vector2: which way it blows, times how hard
    const L = _light.copy(g.env.oceanAmbient).add(g.env.oceanLight);
    L.r = Math.min(L.r, 1.1); L.g = Math.min(L.g, 1.1); L.b = Math.min(L.b, 1.1);
    this.sky.update(dt, { night: g.env.night, wind: { x: w.x * 6, z: w.y * 6 }, light: L });
  }

  /** A shell has burst: the boom, late by the distance; then whoever was watching. */
  burst(b) {
    const g = this.game, c = g.camera.position;
    const far = Math.hypot(b.at.x - c.x, b.at.y - c.y, b.at.z - c.z), delay = far / FIREWORKS.sound, volume = this.heard(b.at);
    g.audio.play('boom', { delay, volume, soft: b.shell.kind === 'willow' || b.shell.kind === 'crackle' });
    if (b.shell.cracks.length) g.audio.play('crackle', { delay, volume, pops: b.shell.cracks });
    if (b.mine) this.noticed(b);
  }

  /** One of yours went off: a port may cheer it, and Sable may answer it. */
  noticed(b) {
    const g = this.game, s = this.stock, boat = g.boat.pos;
    if (g.env.night > 0.5 && this.cheerCool <= 0) {
      const port = g.world.ports.find((I) => Math.hypot(I.dock.x - b.at.x, I.dock.z - b.at.z) < FIREWORKS.cheer);
      if (port) {
        this.cheerCool = 5;
        const d = Math.hypot(port.dock.x - boat.x, port.dock.z - boat.z);
        g.audio.play('cheer', { delay: 0.5 + d / FIREWORKS.sound, volume: clamp(1.15 - d / 500, 0.35, 1) });
        if (!s.cheered.includes(port.id)) {
          s.cheered.push(port.id);
          g.ui.toast(fill(STORES.cheer, { port: port.name }), 'gold');
          g.saveVoyage();
        }
      }
    }
    const R = FIREWORKS.answer, from = g.rival?.fireworkFrom();
    if (from && !this.answer && this.answerCool <= 0 && Math.hypot(from.x - boat.x, from.z - boat.z) < R.within) {
      this.answerCool = R.rest; // one roll in a while, whichever way it falls
      if (Math.random() < R.chance) this.answer = { t: R.wait };
    }
  }

  /** Sable's own goes up from the Redwing: crimson, and the wing once you are friends. */
  reply() {
    const g = this.game, from = g.rival?.fireworkFrom();
    if (!from) return false;
    const s = from.ship, k = s.sizeScale, lead = s.speed * (FIREWORKS.rise + 0.8);
    s.group.localToWorld(_v.set(0, 1.3 * k, -3.3 * k));
    this.launch(from.friend ? 'wing' : 'peony', {
      from: { x: _v.x, y: _v.y, z: _v.z }, over: { x: s.pos.x + Math.sin(s.heading) * lead, z: s.pos.z + Math.cos(s.heading) * lead },
      heading: s.heading, color: 'crimson', mine: false,
    });
    this.theirs = this.time + FIREWORKS.rise + 2.4;
    const lines = from.friend ? FIREWORK.friend : FIREWORK.rival;
    g.rival.say(FIREWORK.title, [lines[Math.floor(Math.random() * lines.length)]]);
    return true;
  }

  /** Put everything out and forget what was on its way (a new voyage, or coming back aboard). */
  reset() {
    this.sky.clear();
    this.bursts.length = 0;
    this.show = null; this.answer = null;
    this.up = this.mine = this.theirs = this.time;
    this.watch = 0;
  }

  /** For the console (debug.js): what is aboard, loaded and in the air. */
  debugState() {
    const s = this.stock;
    return { rocket: s.rocket, special: s.special, finale: s.finale, cheered: [...s.cheered], loaded: this.loaded, wing: this.wing,
      inTheAir: this.bursts.length, alight: this.sky.busy, show: this.show ? `${this.show.i}/${this.show.list.length}` : null,
      answer: this.answer ? Math.round(this.answer.t * 10) / 10 : null, watch: Math.round(this.watch * 100) / 100, low: this.sky.low };
  }
}
