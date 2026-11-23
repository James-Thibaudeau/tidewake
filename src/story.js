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
import { propMesh } from './props.js';
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
    this.meshes = new Map(); // journal id -> camp mesh
    game.events.on('dock', (I) => this.onDock(I));
    game.events.on('respawn', (I) => this.onDock(I));
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
  target() {
    const ch = this.chapter, W = this.wreck;
    if ((ch === 1 || ch === 8) && W) return { x: W.searchPoint.x, z: W.searchPoint.z, label: ch === 1 ? "Search grandfather's wreck" : 'Open the chest under the bunk' };
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

  /** Contextual action while sailing (search the wreck or a camp). */
  interaction(x, z, speed) {
    const ch = this.chapter, W = this.wreck;
    let spot = null, label = '', act = null;
    if ((ch === 1 || ch === 8) && W) {
      spot = W.searchPoint;
      label = ch === 1 ? "Search grandfather's wreck" : 'Open the chest under the bunk';
      act = () => (ch === 1 ? this.findJournal('I') : this.openChest());
    } else if (ch >= 2 && ch <= 7) {
      const id = ROMAN[ch - 1], c = this.camps[id];
      if (c) { spot = c.search; label = "Search grandfather's camp"; act = () => this.findJournal(id); }
    }
    if (!spot || Math.hypot(spot.x - x, spot.z - z) > 26) return null;
    if (Math.abs(speed) >= 7) return { prompt: 'Slow down to search' };
    return { prompt: label, action: act };
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

  findJournal(id) {
    const g = this.game, S = this.S, st = g.state;
    if (this.has(id)) return;
    S.journals.push(id);
    S.chapter = ROMAN.indexOf(id) + 2;
    g.audio.play('treasure');
    g.ui.banner(JOURNALS.find((j) => j.id === id).title, fill(LINES.journalFound, { n: id }));
    if (id === 'I' && (st.upgrades.spyglass || 0) < 1) {
      st.upgrades.spyglass = 1;
      g.applyUpgrades();
      // upgrades normally save only when banked at a port; a story find is kept at once
      g.saveData.upgrades = { ...(g.saveData.upgrades || st.upgrades), spyglass: Math.max(1, g.saveData.upgrades?.spyglass || 0) };
      g.ui.toast(LINES.spyglassFound, 'gold');
    }
    g.events.emit('story:journal', id);
    g.saveVoyage();
    this.syncCamps();
    g.ui.openJournal('story', id);
  }

  openChest() {
    const g = this.game, S = this.S;
    S.chapter = 9;
    S.flags.letters = true;
    g.audio.play('treasure');
    g.ui.toast(LINES.chestFound, 'gold');
    g.events.emit('story:chest');
    g.saveVoyage();
    g.ui.openJournal('story', 'letters');
  }

  async onDock(port) {
    if (this.chapter !== 9 || port !== this.world.home) return;
    const g = this.game, S = this.S;
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
    g.ui.banner('Wayfarer', LINES.storyComplete);
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

  update() {
    if (this.syncedState !== this.game.state || this.syncedChapter !== this.chapter) {
      this.syncedState = this.game.state;
      this.syncedChapter = this.chapter;
      this.syncCamps();
    }
  }
}

export { ROMAN };
