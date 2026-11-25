// Grandfather's anchor, refitted a piece at a time (Phase 6). Each tier opens
// one more biome to going ashore: the shipwright offers the next refit once
// you own the upgrade it needs, its fitting waits in the vault of the nearest
// island of the biome you can already land on, and any shipwright fits it
// for gold. This module owns that quest, the landing gate per biome, the
// perks (landing range and speed) and the Anchor card at the shipwright.
//
// state.upgrades.anchor   0-4, the tier fitted (banked at ports, like upgrades)
// state.story.flags.refit { tier, state: 'quest' | 'aboard', island, hint }
//   quest   the fitting waits at the island's vault (a story item: always
//           tracked, takes no side-quest slot)
//   aboard  carried; never lost in a wreck; fitted at the next port that you
//           can pay at
// The tiers themselves (what each needs and costs) are REFITS in config.js.
import { REFITS, UPGRADES, ASHORE_BIOMES, LAND_RANGE, LAND_SPEED, refitFor, refitPerk } from './config.js';
import { REFIT } from './story-text.js';
import { mulberry32, TAU, clamp } from './util.js';

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Refits {
  constructor(game) {
    this.game = game;
    game.events.on('dock', (I) => this.onDock(I));
    game.events.on('respawn', (I) => this.onDock(I));
    game.events.on('upgrade', (key) => { if (key !== 'anchor') this.offer(); });
  }

  get world() { return this.game.world; }
  /** The tier fitted to grandfather's anchor (0 as found). */
  get tier() { return this.game.state.upgrades.anchor || 0; }
  get R() { return this.game.story.S.flags.refit || null; }
  /** The refit after the one fitted, or null when he has been everywhere. */
  get next() { return REFITS[this.tier + 1] || null; }

  // ------------------------------------------------------------ landing
  /** Can the anchor you have hold at this island? (Ignores whether its biome has levels yet.) */
  holds(I) { const need = refitFor(I.biome); return need >= 0 && this.tier >= need; }
  /** How far from the shore you can drop anchor. */
  get landRange() { return refitPerk(this.tier, 'range', LAND_RANGE); }
  /** The fastest you can be going and still drop anchor (m/s). */
  get landSpeed() { return refitPerk(this.tier, 'speed', LAND_SPEED); }
  /** What a shore you can't land on says (null if the anchor holds there). */
  cantLand(I) {
    if (!ASHORE_BIOMES.has(I.biome)) return `${I.name} is too treacherous to land on (yet)`;
    return this.holds(I) ? null : (REFIT.cantLand[I.biome] || `${I.name} is too treacherous to land on (yet)`);
  }

  // -------------------------------------------------------------- offer
  /** Is the next refit one the shipwright can offer now? Returns why not, or null. */
  blocker() {
    const g = this.game, N = this.next;
    if (!g.story.canGoAshore) return 'anchor';
    if (!N) return 'maxed';
    if (!ASHORE_BIOMES.has(N.biome)) return 'notYet';
    if ((g.state.upgrades[N.needs.key] || 0) < N.needs.lvl) return 'needs';
    return null;
  }

  /** Start the next refit quest if it's due (after an upgrade, a dock or a refit). */
  async offer() {
    const g = this.game;
    if (this.R || this.blocker()) return;
    const tier = this.tier + 1, N = REFITS[tier];
    const I = this.fittingIsland(N.from);
    if (!I) return;
    // a search circle for an island you haven't charted, as for retrieve quests
    const rng = mulberry32(I.id * 977 + tier);
    const r = clamp(I.r + 240, 320, 560), a = rng() * TAU, off = rng() * (r - I.r) * 0.6;
    g.story.S.flags.refit = { tier, state: 'quest', island: I.id, hint: { x: I.x + Math.cos(a) * off, z: I.z + Math.sin(a) * off, r } };
    g.quests.pin('refit');
    g.quests.version++;
    g.saveVoyage();
    await this.afterDialogs();
    await g.ui.showFound({ eyebrow: 'The shipwright', title: `Refit: ${N.label}`,
      items: [{ icon: 'anchor', name: REFIT.tiers[tier].item, text: fill(REFIT.tiers[tier].offer, { place: I.name }) }],
      main: "I'll fetch it" });
  }

  /**
   * Where the fitting waits: the island of biome `from` nearest the boat that
   * you can land on, with a vault, that isn't a landmark (they keep their own
   * story) or already holding a quest item.
   */
  fittingIsland(from) {
    const g = this.game, b = g.boat.pos, A = g.ashore;
    const busy = new Set(g.quests.active.filter((q) => q.type === 'retrieve').map((q) => q.target));
    let best = null, bd = Infinity;
    for (const I of this.world.islands) {
      if (I.biome !== from || I.landmark || busy.has(I.id) || !A.canLand(I) || !this.holds(I)) continue;
      const d = Math.hypot(I.x - b.x, I.z - b.z);
      if (d < bd) { bd = d; best = I; }
    }
    return best;
  }

  // ------------------------------------------------------------ fitting
  /** The fitting, if it waits on this island right now (shaped like a retrieve quest for ashore.js). */
  itemsOn(islandId) {
    const R = this.R;
    if (!R || R.state !== 'quest' || R.island !== islandId) return [];
    return [{ id: 'refit', type: 'story', state: 'active', item: REFIT.tiers[R.tier].item, art: 'fitting' }];
  }

  /** Picked up at the vault: aboard until a shipwright fits it. */
  pickUp() {
    const g = this.game, R = this.R;
    if (!R) return;
    R.state = 'aboard';
    g.quests.version++;
    g.audio.play('treasure');
    g.ui.banner(REFIT.tiers[R.tier].item, 'Found it!');
    g.ui.toast('Bring it to any shipwright', 'info');
    g.events.emit('pickup', { id: 'refit' });
    g.saveVoyage();
  }

  async onDock() {
    await null; // after the story's own dock pop-ups have started
    const R = this.R, g = this.game;
    if (R?.state === 'aboard') {
      if (g.state.banked >= REFITS[R.tier].cost) await this.fit();
      else {
        await this.afterDialogs();
        g.ui.toast(fill(REFIT.needGold, { gold: REFITS[R.tier].cost, label: REFITS[R.tier].label.toLowerCase() }), 'warn');
      }
      return;
    }
    await this.offer();
  }

  /** The shipwright fits the refit (from the dock, or the Anchor card). */
  async fit() {
    const g = this.game, s = g.state, R = this.R;
    if (!R || R.state !== 'aboard' || s.banked < REFITS[R.tier].cost) return false;
    const tier = R.tier, N = REFITS[tier];
    s.banked -= N.cost;
    s.upgrades.anchor = tier;
    g.story.S.flags.refit = null;
    if (g.quests.Q.pinned === 'refit') g.quests.pin('story');
    g.quests.version++;
    g.syncAnchor();
    g.savePortState();
    g.audio.play('upgrade');
    g.events.emit('upgrade', 'anchor', tier);
    g.ui.refreshPort?.();
    await this.afterDialogs();
    await g.ui.showFound({ eyebrow: 'The shipwright', title: `${N.label} fitted!`,
      items: [{ icon: 'anchor', name: N.label, text: REFIT.tiers[tier].fitted }], main: 'Wonderful!' });
    await this.offer(); // the next one may already be due
    return true;
  }

  /** Let other pop-ups (the story's, the rival's) close first. */
  async afterDialogs() {
    const ui = this.game.ui;
    await sleep(60);
    while (ui.isStoryOpen || ui.isFoundOpen) await sleep(200);
  }

  // ------------------------------------------------------------ tracking
  /** The refit as a story-track step for the tracker and journal. */
  quests() {
    const R = this.R;
    if (!R) return [];
    const N = REFITS[R.tier], item = REFIT.tiers[R.tier].item, place = this.world.islands[R.island]?.name;
    const vars = { place, item: item.toLowerCase(), label: N.label.toLowerCase() };
    return [{ id: 'refit', type: 'story', state: 'active', title: fill(REFIT.questTitle, { label: N.label }),
      text: fill(R.state === 'quest' ? REFIT.questFetch : REFIT.questBring, vars),
      giver: { name: 'Shipwright', role: 'Anchor refit', label: fill(REFIT.questGiver, { biome: N.biome }) }, reward: { gold: 0 } }];
  }

  /** Where the refit points: the search circle, the island, or the nearest port. */
  target() {
    const R = this.R, g = this.game, b = g.boat.pos;
    if (!R) return null;
    const I = this.world.islands[R.island];
    if (R.state === 'quest') {
      const h = R.hint;
      if (h && !g.state.discovered.has(I.id) && Math.hypot(h.x - b.x, h.z - b.z) > h.r) return { x: h.x, z: h.z, r: h.r, label: `Search near ${I.name}` };
      return { x: I.x, z: I.z, label: `Go ashore and climb ${I.name}` };
    }
    let best = this.world.home, bd = Infinity;
    for (const P of this.world.ports) {
      if (!g.state.discovered.has(P.id)) continue;
      const d = Math.hypot(P.dock.x - b.x, P.dock.z - b.z);
      if (d < bd) { bd = d; best = P; }
    }
    return { x: best.dock.x, z: best.dock.z, label: `Take it to the shipwright: ${best.name}` };
  }

  // ---------------------------------------------------------- shipwright
  /** The Anchor card in the shipwright's grid: { cur, next, note, button: { label, enabled } } or null before the anchor. */
  card() {
    const g = this.game;
    if (!g.story.canGoAshore) return null;
    const N = this.next, R = this.R, why = this.blocker();
    const out = { tier: this.tier, tiers: REFITS.length, cur: REFITS[this.tier].label, next: N?.label || null, note: null, button: null };
    if (why === 'maxed') out.note = REFIT.maxed;
    else if (why === 'notYet') { out.note = REFIT.notYet; out.next = null; }
    else if (why === 'needs') {
      const U = UPGRADES.find((u) => u.key === N.needs.key);
      out.button = { label: `Needs the ${U.tiers[N.needs.lvl].label}`, enabled: false };
    } else if (R?.state === 'aboard') out.button = { label: 'Refit', cost: N.cost, enabled: g.state.banked >= N.cost };
    else out.button = { label: `Needs the ${REFIT.tiers[this.tier + 1].item.toLowerCase()}`, enabled: false };
    return out;
  }
}
