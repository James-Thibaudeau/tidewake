// The main story, "Grandfather's Journals". A linear chain of chapters that
// sits beside the quest boards: it never takes a side-quest slot, can't be
// abandoned, and everything it finds is saved the moment it's found.
//
// state.story = { chapter, journals: [id], flags: {}, seenCards: [id] }
//   chapter 0   prologue not yet shown
//   chapter 1   visit the wreck → Journal I + the brass spyglass
//   chapter 2-7 find Journals II-VII at grandfather's old camps
//   chapter 8   back to the wreck: the chest under the bunk
//   chapter 9   bring the letters home to Grandma in Port Haven
//   chapter 10  complete (free roam)
import { mulberry32, headingOf, TAU } from './util.js';
import { islandHeight, edgeFactor } from './world.js';
import * as THREE from 'three';
import { propMesh, part, merge, propMaterial, thinOutline } from './props.js';
import { siteBeam } from './quests.js';
import { JOURNALS, STEPS, LINES } from './story-text.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
// Where journals III-VII were left: the hand-placed landmarks
const LANDMARK_FOR = { III: 'grove', IV: 'arch', V: 'ruins', VI: 'volcano', VII: 'frost' };
export const FINAL_CHAPTER = 10;

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

export class Story {
  constructor(game) {
    this.game = game;
    this.camps = this.placeCamps();
    this.anchorSpot = this.placeAnchorSpot();
    this.meshes = new Map(); // journal id -> camp mesh
    game.events.on('dock', (I) => this.onDock(I));
    game.events.on('respawn', (I) => this.onDock(I));
    game.events.on('upgrade', (key, lvl) => { if (key === 'hull' && lvl >= 1) this.startAnchor(); });
    game.events.on('wreck', () => this.onWreck());
  }

  // -------------------------------------------------- grandfather's anchor
  // flags.anchor: undefined → 'quest' (haul it up by the wreck) → 'aboard'
  // (take it to a shipwright) → 'fitted' (you can go ashore).
  get anchor() { return this.S.flags.anchor || null; }
  get canGoAshore() { return this.anchor === 'fitted'; }

  /** On the seabed a little way off the wreck, on whichever side is deeper. */
  placeAnchorSpot() {
    const W = this.wreck;
    if (!W) return null;
    const fx = Math.sin(W.heading), fz = Math.cos(W.heading);
    let best = null;
    for (const s of [1, -1]) {
      const x = W.searchPoint.x + fz * 22 * s + fx * 6, z = W.searchPoint.z - fx * 22 * s + fz * 6;
      const d = this.world.heightAt(x, z);
      if (!this.world.rockHit(x, z, 8) && (!best || d < best.d)) best = { x, z, d };
    }
    return best && { x: best.x, z: best.z };
  }

  async startAnchor() {
    const g = this.game;
    if (this.anchor || (g.state.upgrades.hull || 0) < 1 || !this.anchorSpot) return;
    this.S.flags.anchor = 'quest';
    g.quests.pin('anchor');
    g.saveVoyage();
    await g.ui.showFound({ eyebrow: 'The shipwright', title: 'A proper anchor',
      items: [{ icon: 'anchor', name: "Grandfather's anchor",
        text: "\"A hull this sound can carry a real anchor. Your grandfather's ship had the finest in the harbor, and it'll still be on the bottom beside the wreck.\" Haul it up and bring it to any shipwright. With an anchor you can go ashore." }],
      main: "I'll find it" });
  }

  async onWreck() {
    if (this.anchor !== 'aboard') return;
    this.S.flags.anchor = 'quest';
    this.game.saveVoyage();
    this.game.ui.toast("Grandfather's anchor sank back to the bottom by the wreck.", 'warn');
  }

  haulAnchor() {
    const g = this.game;
    this.S.flags.anchor = 'aboard';
    g.audio.play('treasure');
    g.spawnChestRise?.();
    g.saveVoyage();
    g.ui.showFound({ eyebrow: "Beside grandfather's wreck", title: 'You hauled up his anchor!',
      items: [{ icon: 'anchor', name: "Grandfather's anchor", text: 'Heavy, barnacled and still sound. Bring it to any port and the shipwright will fit it to your bow.' }],
      main: 'Onward' });
  }

  async fitAnchor() {
    const g = this.game;
    this.S.flags.anchor = 'fitted';
    if (g.quests.Q.pinned === 'anchor') g.quests.pin('story');
    g.syncAnchor();
    g.savePortState();
    g.audio.play('upgrade');
    g.events.emit('story:anchor');
    await g.ui.showFound({ eyebrow: 'The shipwright', title: 'Anchor fitted!',
      items: [{ icon: 'anchor', name: 'You can go ashore',
        text: g.ui.touch ? 'Slow down near an island\'s shore and tap the action button to drop anchor and explore on foot.'
          : 'Slow down near an island\'s shore and press <kbd>E</kbd> to drop anchor and explore on foot.' }],
      main: 'Wonderful!' });
  }

  anchorQuest() {
    const a = this.anchor;
    if (a !== 'quest' && a !== 'aboard') return null;
    return { id: 'anchor', type: 'story', state: 'active', title: "Grandfather's anchor",
      text: a === 'quest' ? "Haul up grandfather's anchor from the seabed beside his wreck." : "Bring the anchor to any port's shipwright to have it fitted.",
      giver: { name: 'Shipwright', role: 'Ship upgrade', label: 'Unlocks going ashore' }, reward: { gold: 0 } };
  }

  get S() {
    const st = this.game.state;
    if (!st.story) st.story = { chapter: 0, journals: [], flags: {}, seenCards: [] };
    const s = st.story;
    s.journals ||= []; s.flags ||= {}; s.seenCards ||= [];
    return s;
  }
  get chapter() { return this.S.chapter || 0; }
  get world() { return this.game.world; }
  get wreck() { return this.world.wreck; }
  has(id) { return this.S.journals.includes(id); }
  vars() { return { captain: this.game.state.profile?.name || 'Captain' }; }

  // ------------------------------------------------------------- the camps
  /**
   * Fixed camp spots for journals II-VII: a patch of beach facing the sea,
   * plus a point offshore where the boat can stop to search it. Deterministic
   * (own RNG) so every voyage in this world has them in the same place.
   */
  placeCamps() {
    const W = this.world, H = W.home, rng = mulberry32(W.seed * 17 + 0xca3e);
    const camps = {};
    // II: "a little green island a short sail west of Port Haven"
    const westish = W.islands.filter((I) => !I.port && !I.landmark && I.r > 55 && I.r < 190 &&
      I.x - H.x < -500 && Math.abs(I.z - H.z) < Math.abs(I.x - H.x) * 0.9 && Math.hypot(I.x - H.x, I.z - H.z) < 2600);
    westish.sort((a, b) => (b.biome === 'temperate') - (a.biome === 'temperate') || Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const II = westish[0] || W.islands.find((I) => !I.port && !I.landmark);
    camps.II = this.campOn(II, H, rng);
    for (const [id, lm] of Object.entries(LANDMARK_FOR)) {
      const I = W.islands.find((x) => x.landmark === lm);
      if (I) camps[id] = this.campOn(I, H, rng);
    }
    return camps;
  }

  campOn(I, H, rng) {
    // face Port Haven where the coast allows, away from the dock and treasure
    const toHome = Math.atan2(H.z - I.z, H.x - I.x);
    const angOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    // sea stacks offshore would hide the camp and block the approach
    const stacks = I.rocks.filter((R) => R.type !== 'hidden').map((R) => Math.atan2(R.z - I.z, R.x - I.x));
    const bad = (a) => [I.dockAngle, I.treasureAngle].some((b) => b != null && angOff(a, b) < 0.6) || stacks.some((b) => angOff(a, b) < 0.45);
    let a = toHome;
    for (let k = 0; k < 24 && bad(a); k++) a = toHome + (k % 2 ? 1 : -1) * (0.3 * Math.ceil((k + 1) / 2)) + (rng() - 0.5) * 0.1;
    const dir = [Math.cos(a), Math.sin(a)];
    const at = (d) => ({ x: I.x + dir[0] * d, z: I.z + dir[1] * d, h: islandHeight(I, I.x + dir[0] * d, I.z + dir[1] * d) });
    // tent: just above the waterline; search spot: the first water deep enough to float in
    let d = I.r * edgeFactor(I, a);
    while (d > 4 && at(d).h < 1.6) d -= 2;
    while (at(d).h > 4 && d < I.r * 1.6) d += 1.5; // not halfway up a cliff
    const tent = at(d);
    let sd = d;
    while (at(sd).h > -3 && sd < I.bound * 2.2) sd += 2;
    const sp = at(sd + 8);
    // the chart's search circle contains the camp but isn't centred on it
    const r = I.landmark ? 520 : 380;
    const oa = rng() * TAU, off = rng() * r * 0.45;
    return { island: I.id, x: tent.x, z: tent.z, y: Math.max(0.4, tent.h), heading: headingOf(dir[0], dir[1]), // tent door faces the sea
      search: { x: sp.x, z: sp.z }, hint: { x: tent.x + Math.cos(oa) * off, z: tent.z + Math.sin(oa) * off, r } };
  }

  // --------------------------------------------------------------- the quest
  /** The main story as a quest-like object for the tracker, journal and maps. */
  /** All story-track steps that are live right now. */
  quests() { return [this.quest(), this.anchorQuest()].filter(Boolean); }

  quest() {
    const ch = this.chapter;
    if (ch < 1 || ch >= FINAL_CHAPTER) return null;
    let step;
    if (ch === 1) step = STEPS.visitWreck;
    else if (ch <= 7) step = { title: `Grandfather's Journal ${ROMAN[ch - 1]}`, text: fill(STEPS.journal.text, { n: ROMAN[ch - 1] }) };
    else if (ch === 8) step = STEPS.searchChest;
    else step = STEPS.letterHome;
    return { id: 'story', type: 'story', state: 'active', title: step.title, text: step.text,
      giver: { name: 'Grandma', role: 'Main story' }, reward: { gold: 0 }, chapter: ch };
  }

  /** Where the story points now: { x, z, r?, label }. */
  target(id = 'story') {
    if (id === 'anchor') {
      if (this.anchor === 'quest') return { x: this.anchorSpot.x, z: this.anchorSpot.z, label: "Haul up grandfather's anchor" };
      const b = this.game.boat.pos;
      let best = this.world.home, bd = Infinity;
      for (const P of this.world.ports) {
        if (!this.game.state.discovered.has(P.id)) continue;
        const d = Math.hypot(P.dock.x - b.x, P.dock.z - b.z);
        if (d < bd) { bd = d; best = P; }
      }
      return { x: best.dock.x, z: best.dock.z, label: `Take it to the shipwright: ${best.name}` };
    }
    const ch = this.chapter, W = this.wreck;
    if ((ch === 1 || ch === 8) && W) return { x: W.searchPoint.x, z: W.searchPoint.z, label: ch === 1 ? "Climb aboard grandfather's wreck" : 'Open the chest under his bunk' };
    if (ch >= 2 && ch <= 7) {
      const c = this.camps[ROMAN[ch - 1]];
      if (!c) return null;
      const b = this.game.boat.pos;
      // the search circle until you're inside it; then the camp itself
      if (Math.hypot(c.hint.x - b.x, c.hint.z - b.z) > c.hint.r) return { x: c.hint.x, z: c.hint.z, r: c.hint.r, label: `Search near ${this.world.islands[c.island].name}` };
      return { x: c.search.x, z: c.search.z, label: "Look for grandfather's camp" };
    }
    if (ch === 9) { const D = this.world.home.dock; return { x: D.x, z: D.z, label: 'Bring the letters to Grandma' }; }
    return null;
  }

  /** Contextual action while sailing (board the wreck, or search a camp). */
  interaction(x, z, speed) {
    const ch = this.chapter, W = this.wreck;
    const A = this.anchorSpot;
    if (this.anchor === 'quest' && A && Math.hypot(A.x - x, A.z - z) < 18) {
      if (Math.abs(speed) >= 7) return { prompt: 'Slow down to haul up the anchor' };
      return { prompt: "Haul up grandfather's anchor", action: () => this.haulAnchor() };
    }
    if (ch >= 2 && ch <= 7) {
      const id = ROMAN[ch - 1], c = this.camps[id];
      if (c && Math.hypot(c.search.x - x, c.search.z - z) < 26) {
        if (Math.abs(speed) >= 7) return { prompt: 'Slow down to search' };
        return { prompt: "Search grandfather's camp", action: () => this.findJournal(id) };
      }
    }
    // the wreck can be walked any time: it needs no anchor, you tie up alongside
    if (W && ch >= 1 && Math.hypot(W.searchPoint.x - x, W.searchPoint.z - z) < 26) {
      if (Math.abs(speed) >= 7) return { prompt: 'Slow down to climb aboard' };
      return { prompt: "Climb aboard grandfather's wreck", action: () => this.game.ashore?.enterWreck() };
    }
    return null;
  }

  // ---------------------------------------------------------------- progress
  async showPrologue() {
    const S = this.S;
    if (S.chapter > 0) return;
    S.chapter = 1;
    S.seenCards.push('prologue');
    this.game.saveVoyage();
    await this.game.ui.showStoryCards('prologue');
  }

  async findJournal(id) {
    const g = this.game, S = this.S, st = g.state;
    if (this.has(id)) return;
    const n = ROMAN.indexOf(id) + 1;
    S.journals.push(id);
    S.chapter = n + 1;
    let spyglass = false;
    if (id === 'I' && (st.upgrades.spyglass || 0) < 1) {
      spyglass = true;
      st.upgrades.spyglass = 1;
      g.applyUpgrades();
      // upgrades normally save only when banked at a port; a story find is kept at once
      g.saveData.upgrades = { ...(g.saveData.upgrades || st.upgrades), spyglass: Math.max(1, g.saveData.upgrades?.spyglass || 0) };
    }
    g.events.emit('story:journal', id);
    g.saveVoyage();
    this.syncCamps();
    g.audio.play('treasure');

    const j = JOURNALS.find((x) => x.id === id);
    const items = [{ icon: 'book', name: `Journal ${id}: ${j.title}`,
      text: id === 'I' ? 'His very first journal, still in the chart table drawer.'
        : id === 'VII' ? 'The last of his journals. All seven are yours.'
        : `${n} of 7 journals found. His clue points the way to the next.` }];
    if (spyglass) {
      items.push({ icon: 'spyglass', name: 'Brass Spyglass',
        text: g.ui.touch ? 'Tap the spyglass button to look far out to sea. Islands you spot are charted from afar.'
          : 'Hold <kbd>Z</kbd> or <kbd>Shift</kbd> to look through it. Islands you spot are charted from afar.' });
    }
    const where = id === 'I' ? "Grandfather's wreck" : `${this.world.islands[this.camps[id].island].name} · grandfather's camp`;
    const choice = await g.ui.showFound({ eyebrow: where, title: spyglass ? 'You found his journal and spyglass!' : 'You found his journal!',
      items, main: 'Read the journal', later: 'Later' });
    if (choice === 'main') g.ui.openJournal('story', id);
    else g.ui.toast('Read it any time in your journal (J)', 'info');
  }

  async openChest() {
    const g = this.game, S = this.S;
    S.chapter = 9;
    S.flags.letters = true;
    g.events.emit('story:chest');
    g.saveVoyage();
    g.audio.play('treasure');
    const choice = await g.ui.showFound({ eyebrow: 'The chest under the bunk', title: 'Letters never sent',
      items: [{ icon: 'letters', name: 'A bundle of letters', text: 'Tied with sailcloth string, with something soft folded at the bottom. Bring them home to Grandma.' }],
      main: 'Read the letters', later: 'Later' });
    if (choice === 'main') g.ui.openJournal('story', 'letters');
  }

  async onDock(port) {
    const g = this.game, S = this.S;
    // older saves that already own a sound hull get the anchor quest here
    if (!this.anchor && (g.state.upgrades.hull || 0) >= 1) { await null; await this.startAnchor(); }
    if (this.anchor === 'aboard') { await null; await this.fitAnchor(); }
    if (this.chapter !== 9 || port !== this.world.home) return;
    S.chapter = FINAL_CHAPTER;
    S.flags.title = 'Wayfarer';
    g.unlockCosmetic('neck:grandScarf', 'story');
    g.unlockCosmetic('hat:grandPith', 'story');
    // she puts them on you
    const p = g.state.profile;
    p.neck = { ...p.neck, style: 'grandScarf' };
    p.hat = { ...p.hat, style: 'grandPith' };
    g.applyProfile();
    g.savePortState();
    g.events.emit('story:complete');
    await null; // let the dock finish opening the port sheet, then hide it for the epilogue
    g.ui.closePort();
    await g.ui.showStoryCards('epilogue');
    await g.ui.showFound({ eyebrow: LINES.storyComplete, title: "Grandpa's gifts",
      items: [
        { icon: 'scarf', name: "Grandpa's scarf", text: "You're wearing it. Find it in the Tailor's wardrobe any time." },
        { icon: 'helmet', name: "Grandpa's helmet", text: 'Weathered, a little dented, and now yours.' },
        { icon: 'star', name: 'Title: Wayfarer', text: 'For bringing the old captain home.' },
      ], main: 'Onward' });
    g.ui.openPort(port);
  }

  // ------------------------------------------------------------------ visuals
  /** Camps appear once the story reaches them and stay afterwards. */
  syncCamps() {
    const ch = this.chapter;
    for (let n = 2; n <= 7; n++) {
      const id = ROMAN[n - 1], c = this.camps[id];
      const want = c && ch >= n;
      if (want && !this.meshes.has(id)) {
        const m = propMesh('camp');
        m.position.set(c.x, c.y - 0.1, c.z);
        m.rotation.y = c.heading;
        m.scale.setScalar(1.3);
        this.game.scene.add(m);
        this.meshes.set(id, m);
      } else if (!want && this.meshes.has(id)) {
        this.game.scene.remove(this.meshes.get(id));
        this.meshes.delete(id);
      }
    }
  }

  update(dt = 0, elapsed = 0) {
    if (this.syncedState !== this.game.state || this.syncedChapter !== this.chapter || this.syncedAnchor !== this.anchor) {
      this.syncedState = this.game.state;
      this.syncedChapter = this.chapter;
      this.syncedAnchor = this.anchor;
      this.syncCamps();
      this.syncAnchorBuoy();
    }
    if (this.buoy) this.buoy.position.y = Math.sin(elapsed * 1.6) * 0.15;
  }

  /** A red-and-white buoy with a beam marks where the anchor lies. */
  syncAnchorBuoy() {
    const want = this.anchor === 'quest' && this.anchorSpot;
    if (want && !this.buoyGroup) {
      const g = new THREE.Group();
      g.position.set(this.anchorSpot.x, 0, this.anchorSpot.z);
      const geo = merge([
        part(new THREE.CylinderGeometry(0.55, 0.7, 0.8, 10), '#d8342c', { y: 0.2 }),
        part(new THREE.CylinderGeometry(0.42, 0.55, 0.5, 10), '#f4efe4', { y: 0.85 }),
        part(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5), '#3b2614', { y: 1.7 }),
        part(new THREE.BoxGeometry(0.04, 0.4, 0.6), '#d8342c', { y: 2.2, z: 0.3 }),
      ]);
      const buoy = new THREE.Group();
      buoy.add(new THREE.Mesh(geo, propMaterial), new THREE.Mesh(geo, thinOutline));
      g.add(buoy, siteBeam());
      this.game.scene.add(g);
      this.buoyGroup = g; this.buoy = buoy; this.buoyGeo = geo;
    } else if (!want && this.buoyGroup) {
      this.game.scene.remove(this.buoyGroup);
      this.buoyGeo.dispose();
      this.buoyGroup = this.buoy = this.buoyGeo = null;
    }
  }
}

export { ROMAN };
