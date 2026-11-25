// Report quests: you see something out at sea, and somebody ashore wants to
// hear about it. The crabs that live upside down under the great arch at
// Archway Isle are found here, by sailing through the arch, and a naturalist
// wants them written down. The living sea's whales, dolphins and ghost ship
// (sea-events.js) each have somebody who cares too: a cartographer, a
// merchant, an old salt.
//
// state.quests.reports = { [kind]: { state: 'active' | 'done', port, day } }
// A report takes no side-quest slot, like a story step: it is listed and
// marked on the chart with them, and handed in by docking at its port, the
// one nearest to where the thing was seen. Each kind is reported once. News
// of the living sea goes stale after a few days: the report is dropped, and
// the next sighting of that kind starts a new one. The crabs never go stale.
// The words are REPORTS in story-text.js.
import { REPORTS } from './story-text.js';
import { giversFor } from './quests.js';
import { ARCH } from './sea-arch.js';
import { damp } from './util.js';

// What each kind of sighting pays when it's reported, who hears it (a giver
// role from quests.js), and how many days the news keeps.
const KINDS = {
  archCrabs: { gold: 120, cosmetic: 'extra:crabPin', role: 'report' },
  whale: { gold: 90, role: 'chart', stale: 3 },
  dolphins: { gold: 60, role: 'deliver', stale: 3 },
  ghostShip: { gold: 150, role: 'salvage', stale: 3 },
};
const questId = (kind) => `report:${kind}`;
// the clear water between the arch's legs (their collision rocks are 6 wide, in arch units)
const CHANNEL = (ARCH.legX - 6) * ARCH.scale - 1;
const LOOK_UP = -0.42; // the chase camera's pitch while it looks up at the underside

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Reports {
  constructor(game) {
    this.game = game;
    this.side = 0;   // which side of the arch the boat was on a moment ago (0: not in the channel)
    this.lookT = 0;  // seconds left of looking up at the crabs
    game.events.on('dock', (I) => this.onDock(I));
    game.events.on('respawn', (I) => this.onDock(I));
  }

  get R() { return this.game.quests.Q.reports; }
  get world() { return this.game.world; }
  /** Archway Isle, once the world has placed its arch. */
  get archIsle() { return (this._arch ||= this.world.islands.find((I) => I.landmark === 'arch' && I.archPos) || null); }

  /** Who hears a report: the port nearest to where the thing was seen. */
  portNear(x, z) {
    let best = this.world.home, bd = Infinity;
    for (const P of this.world.ports) {
      const d = Math.hypot(P.dock.x - x, P.dock.z - z);
      if (d < bd) { bd = d; best = P; }
    }
    return best;
  }

  // ------------------------------------------------------------- sightings
  update(dt) {
    const g = this.game;
    if (g.mode !== 'sailing') { this.side = 0; return; }
    this.dropStale();
    if (this.lookT > 0) {
      // tip the view up at the underside for a moment, then let it settle
      this.lookT -= dt;
      g.cam.pitch = damp(g.cam.pitch, LOOK_UP, 3.5, dt);
      g.cam.lastLook = g.elapsed - 1.2;
    }
    const I = this.archIsle;
    if (!I || this.R.archCrabs) return;
    // Sailing through the arch: crossing the line between its legs, inside the
    // channel, either way. In arch space x runs across the mouth, z along it.
    const P = I.archPos, b = g.boat.pos, dx = b.x - P.x, dz = b.z - P.z;
    const c = Math.cos(P.rot), s = Math.sin(P.rot);
    const across = dx * c - dz * s, along = dx * s + dz * c;
    const side = Math.abs(across) < CHANNEL && Math.abs(along) < 40 ? Math.sign(along) : 0;
    // (not in the middle of a race or a rescue: sail through again afterwards)
    if (side && this.side && side !== this.side && !g.rival?.exclusive) this.sight('archCrabs', P);
    this.side = side;
  }

  /**
   * News worth telling, seen at (x, z): it becomes a report to make, unless
   * this kind is already on its way to a port or has been told before.
   * Returns true if a report started.
   */
  start(kind, at) {
    const g = this.game, T = REPORTS[kind];
    if (!T || !KINDS[kind] || this.R[kind]) return false;
    const port = this.portNear(at.x, at.z);
    this.R[kind] = { state: 'active', port: port.id, day: g.state.day || 1 };
    g.quests.version++;
    setTimeout(() => g.ui.toast(fill(T.added, { port: port.name }), 'info'), 2400);
    return true;
  }

  /** The crabs, seen for the first time: look up at them, and start the report. */
  sight(kind, at) {
    const g = this.game;
    if (!this.start(kind, at)) return;
    this.lookT = 2.4;
    g.audio.play('click');
    g.ui.toast(REPORTS[kind].sighting, 'gold');
    g.events.emit('sighting', { kind, x: at.x, z: at.z, day: g.state.day || 1 });
    g.saveVoyage();
  }

  /** Days left before a report's news is too old to tell (null: it keeps). */
  daysLeft(kind) {
    const r = this.R[kind], K = KINDS[kind];
    if (!r || !K?.stale) return null;
    return K.stale - ((this.game.state.day || 1) - r.day);
  }

  /** Old news is dropped; the next sighting of that kind starts a fresh report. */
  dropStale() {
    const g = this.game;
    for (const [kind, r] of Object.entries(this.R)) {
      if (r.state !== 'active' || !(this.daysLeft(kind) < 0)) continue;
      delete this.R[kind];
      if (g.quests.Q.pinned === questId(kind)) g.quests.pin('story');
      g.quests.version++;
      if (REPORTS[kind]?.stale) g.ui.toast(REPORTS[kind].stale, 'info');
      g.saveVoyage();
    }
  }

  // -------------------------------------------------------------- tracking
  /** Reports still to make, as story-track steps for the tracker, the journal and the chart. */
  quests() {
    const out = [];
    for (const [kind, r] of Object.entries(this.R)) {
      const T = REPORTS[kind], port = this.world.islands[r.port];
      if (r.state !== 'active' || !T || !port || !KINDS[kind]) continue;
      const who = giversFor(port)[KINDS[kind].role];
      out.push({ id: questId(kind), type: 'story', state: 'active', kind, title: T.title, text: fill(T.text, { port: port.name }),
        giver: { name: who.name, role: who.role, label: T.label }, reward: { gold: KINDS[kind].gold } });
    }
    return out;
  }

  /** Where a report points: its port. */
  target(q) {
    const r = this.R[q.kind], port = r && this.world.islands[r.port];
    if (!port) return null;
    const left = this.daysLeft(q.kind);
    const fresh = left == null ? '' : left > 0 ? ` · ${left} day${left === 1 ? '' : 's'} before the news is stale` : ' · the news is stale tomorrow';
    return { x: port.dock.x, z: port.dock.z, label: fill(REPORTS[q.kind].status, { port: port.name }) + fresh };
  }

  // --------------------------------------------------------------- hand-in
  async onDock(port) {
    for (const [kind, r] of Object.entries(this.R)) {
      if (r.state === 'active' && r.port === port.id && REPORTS[kind] && KINDS[kind]) await this.handIn(kind, port);
    }
  }

  /** Somebody hears the news: gold, a keepsake if there is one, and what they made of it. */
  async handIn(kind, port) {
    const g = this.game, s = g.state, T = REPORTS[kind], K = KINDS[kind];
    this.R[kind].state = 'done';
    s.banked += K.gold;
    const keepsake = !!K.cosmetic && g.unlockCosmetic(K.cosmetic, 'quest');
    s.stats.quests = (s.stats.quests || 0) + 1;
    if (g.quests.Q.pinned === questId(kind)) g.quests.pin('story');
    g.quests.version++;
    g.savePortState();
    g.audio.play('treasure');
    g.events.emit('quest:complete', { id: questId(kind), type: 'report', kind, title: T.title, reward: { gold: K.gold } }, port);
    g.ui.refreshPort?.();
    // let the story's and the shipwright's pop-ups close first
    await sleep(60);
    while (g.ui.isStoryOpen || g.ui.isFoundOpen) await sleep(200);
    const vars = { port: port.name, captain: s.profile?.name || 'Captain' };
    const items = [{ icon: 'book', name: T.pageName, text: fill(T.page, vars) }];
    if (keepsake) items.push({ icon: 'needle', name: T.pinName, text: T.pin });
    items.push({ icon: 'coin', name: `${K.gold} gold`, text: T.gold });
    await g.ui.showFound({ eyebrow: fill(T.eyebrow, vars), title: fill(T.done, vars), items, main: T.main || 'Wonderful!' });
  }
}
