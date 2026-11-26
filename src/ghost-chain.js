// The ghost ship's side chain (Phase 7): why she can't make port.
//
// state.sightings.chain = null            not begun
//                       | { stage: 1 }    seen three times: next time, follow her all the way
//                       | { stage: 2, island }   she led you to an island; her captain's log is at the top of it
//                       | { stage: 3, island }   you've read it
//
// At stage 1 the ghost ship turns up more often, and instead of leading you to
// a strongbox she makes for an island you can go ashore on (cove(), chosen
// when she appears) and fades off its shore. The log waits at that island's
// vault like any quest item (quests.itemsOn), so it needs the anchor to hold
// there. The words are GHOST_LOG in story-text.js; the event itself is
// ghost-ship.js, run by sea-events.js.
import { openWater, clearPath } from './sightings.js';
import { GHOST_LOG } from './story-text.js';

const LOG_GOLD = 180;     // the crew's pay, tucked in the back of the log
const SEEN_TO_BEGIN = 3;
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GhostChain {
  constructor(game) { this.game = game; }

  get C() { return this.game.state.sightings?.chain || null; }
  get stage() { return this.C?.stage || 0; }
  get island() { return this.C?.island != null ? this.game.world.islands[this.C.island] : null; }
  /** While she has somewhere to lead you, she turns up this much more often. */
  get boost() { return this.stage === 1 ? 3 : 1; }

  /** The ghost ship has been seen `n` times: the third time, the chain begins. */
  onSighting(n) {
    const g = this.game;
    if (this.C || n < SEEN_TO_BEGIN) return;
    g.state.sightings.chain = { stage: 1 };
    setTimeout(() => g.ui.toast(GHOST_LOG.begin, 'gold'), 5200);
  }

  /**
   * Where she leads you at stage 1: a spot just off an island you could go
   * ashore on, 500-1700 m from where she appears, with open water all the way.
   * Returns { x, z, island } or null if there's nowhere suitable from here.
   */
  cove(from) {
    const g = this.game, A = g.ashore, W = g.world;
    if (this.stage !== 1 || !A) return null;
    let best = null, score = Infinity;
    for (const I of W.islands) {
      if (I.port || I.landmark || !A.canLand(I)) continue;
      const d = Math.hypot(I.x - from.x, I.z - from.z);
      if (d < 500 || d > 1700) continue;
      // stand off the shore on the side she comes from
      const k = (I.bound + 75) / d, spot = { x: I.x + (from.x - I.x) * k, z: I.z + (from.z - I.z) * k, island: I.id };
      if (!openWater(W, spot.x, spot.z, 30) || !clearPath(W, from, spot, 45)) continue;
      // nearest first, but an island your anchor already holds at beats one it doesn't
      const s = d + (A.canLandNow(I) ? 0 : 2000);
      if (s < score) { score = s; best = spot; }
    }
    return best;
  }

  /** You followed her all the way: now you know where she was going. */
  arrive(islandId) {
    const g = this.game, I = g.world.islands[islandId];
    if (this.stage !== 1 || !I) return;
    g.state.sightings.chain = { stage: 2, island: islandId };
    g.revealAround(I.x, I.z, I.r + 140);
    g.quests.pin('ghost');
    g.quests.version++;
    g.audio.play('discover');
    g.saveVoyage();
  }

  // ---------------------------------------------------------------- tracking
  /** The chain as a story-track step for the tracker, the journal and the chart (stage 2 only). */
  quests() {
    const I = this.island;
    if (this.stage !== 2 || !I) return [];
    const can = !!this.game.story?.canGoAshore && !!this.game.ashore?.canLandNow(I);
    return [{ id: 'ghost', type: 'story', state: 'active', title: GHOST_LOG.title, text: fill(can ? GHOST_LOG.text : GHOST_LOG.noAnchor, { place: I.name }),
      giver: { name: 'Ghost', role: 'The ghost ship', label: GHOST_LOG.label }, reward: { gold: LOG_GOLD } }];
  }

  target() {
    const I = this.island;
    if (!I) return null;
    return { x: I.x, z: I.z, label: fill(GHOST_LOG.status, { place: I.name }) };
  }

  /** The log, if it waits on this island (shaped like a retrieve quest for ashore.js). */
  itemsOn(islandId) {
    if (this.stage !== 2 || this.C.island !== islandId) return [];
    return [{ id: 'ghostLog', type: 'story', state: 'active', item: GHOST_LOG.item }];
  }

  /** Picked up at the top of the island: the pay goes in the hold, and you read the log there and then. */
  async pickUp() {
    const g = this.game, I = this.island;
    if (this.stage !== 2 || !I) return;
    g.state.sightings.chain = { stage: 3, island: I.id };
    g.state.cargo += LOG_GOLD;
    if (g.quests.Q.pinned === 'ghost') g.quests.pin('story');
    g.quests.version++;
    g.audio.play('treasure');
    g.events.emit('pickup', { id: 'ghostLog' });
    g.saveVoyage();
    const F = GHOST_LOG.found;
    await g.ui.showFound({ eyebrow: fill(F.eyebrow, { place: I.name }), title: F.title,
      items: [{ icon: 'book', name: GHOST_LOG.item, text: F.text }, { icon: 'coin', name: `${LOG_GOLD} gold`, text: F.gold }], main: F.main });
    await sleep(250);
    await this.read();
  }

  /** The log's pages, as story cards (again from the Sightings tab, once you have it). */
  read() { return this.stage === 3 ? this.game.ui.showStoryCards(GHOST_LOG.cards) : null; }

  /** A line for her card in the Sightings tab: { text, read } or null. */
  card() {
    const I = this.island;
    if (this.stage === 1) return { text: GHOST_LOG.cardFollow };
    if (this.stage === 2 && I) return { text: fill(GHOST_LOG.cardIsland, { place: I.name }) };
    if (this.stage === 3) return { text: GHOST_LOG.cardDone, read: GHOST_LOG.read };
    return null;
  }
}
