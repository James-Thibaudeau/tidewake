// UI part: story and encounter overlays: the ashore panel, the "Found!"
// pop-up, story cards, the quest tracker on the HUD, and the race panel,
// countdown and hails for the rival. Methods are mixed into UI (see ../ui.js),
// so `this` is the UI instance.
import { fmtDist } from '../quests.js';
import { PROLOGUE, EPILOGUE, REFIT } from '../story-text.js';
import { bearingDeg } from '../util.js';
import { $, PX_PER_DEG, fillVars, clampN, esc, fmt } from './shared.js';
import { ICONS, STORY_ART } from './icons.js';

export class StoryUI {
  // ------------------------------------------------------------ ashore
  /** Island panel while ashore (name = null hides it). */
  setAshore(name, gold = 0, left = {}) {
    const el = this.el.ashorePanel;
    if (!el) return;
    el.classList.toggle('hidden', !name);
    if (!name) return;
    this.el.apName.textContent = name;
    this.el.apGold.textContent = fmt(gold);
    const bits = [];
    bits.push(left.coins ? `${left.coins} coin${left.coins === 1 ? '' : 's'} left` : 'All coins found');
    if (left.chest) bits.push('a chest is hidden here');
    this.el.apLeft.textContent = bits.join(' · ');
  }

  /** The storm countdown while the anchor drags (seconds left; null hides it). */
  setAnchorDrag(left) {
    const el = this.el.apDrag;
    if (!el) return;
    el.classList.toggle('hidden', left == null);
    if (left == null) return;
    const s = Math.ceil(left);
    el.textContent = fillVars(REFIT.dragging, { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
  }

  // ------------------------------------------------------------ found!
  get isFoundOpen() { return !!this.foundOpen; }

  /**
   * A celebratory pop-up for things the player finds.
   * opts: { eyebrow, title, items: [{ icon, name, text (may contain <kbd>) }], main, later }
   * Resolves 'main' or 'later' (Esc, the Later button).
   */
  showFound({ eyebrow = '', title = 'You found something!', items = [], main = 'Wonderful!', later = null }) {
    this.foundOpen = true;
    this.setPrompt(null);
    this.el.foundEyebrow.textContent = eyebrow;
    this.el.foundTitle.textContent = title;
    this.el.foundItems.innerHTML = items.map((it) => `<div class="foundItem">
      <div class="foundIcon">${ICONS[it.icon] || ICONS.star}</div>
      <div><div class="foundName">${esc(it.name)}</div><div class="foundText">${it.text || ''}</div></div></div>`).join('');
    this.el.foundMain.textContent = main;
    this.el.foundLater.textContent = later || '';
    this.el.foundLater.classList.toggle('hidden', !later);
    this.el.foundScreen.classList.remove('hidden');
    return new Promise((resolve) => { this.foundResolve = resolve; });
  }

  closeFound(choice) {
    if (!this.foundOpen) return;
    this.foundOpen = false;
    this.el.foundScreen.classList.add('hidden');
    this.game.input?.consumeActions(); // the key that closed it shouldn't also act in the game
    const r = this.foundResolve; this.foundResolve = null;
    r?.(choice);
  }

  // ------------------------------------------------------------ story cards
  get isStoryOpen() { return !!this.storyCardsOpen; }

  /** Show the prologue or epilogue. Resolves when the player has read (or skipped) them. */
  showStoryCards(kind) {
    // 'prologue' | 'epilogue', or a deck of cards (the rival captain's scenes)
    const cards = Array.isArray(kind) ? kind : kind === 'epilogue' ? EPILOGUE : PROLOGUE;
    this.storyDeck = cards;
    this.storyIndex = 0;
    this.storyCardsOpen = true;
    this.setPrompt(null);
    this.el.storyCards.classList.remove('hidden');
    this.renderStoryCard();
    return new Promise((resolve) => { this.storyResolve = resolve; });
  }

  storyStep(n) {
    if (!this.storyCardsOpen) return;
    this.storyIndex += n;
    if (this.storyIndex >= this.storyDeck.length) {
      this.storyCardsOpen = false;
      this.el.storyCards.classList.add('hidden');
      this.game.input?.consumeActions(); // the key that closed the cards shouldn't also dock or search
      const r = this.storyResolve; this.storyResolve = null;
      r?.();
      return;
    }
    this.renderStoryCard();
  }

  renderStoryCard() {
    const c = this.storyDeck[this.storyIndex], vars = { captain: this.game.state.profile?.name || 'Captain' };
    this.el.storyArt.innerHTML = `<svg viewBox="0 0 320 170" aria-hidden="true">${(STORY_ART[c.art] || STORY_ART.boat)()}</svg>`;
    this.el.storyTitle.textContent = c.title ? fillVars(c.title, vars) : '';
    this.el.storyText.textContent = fillVars(c.text, vars);
    this.el.storyDots.innerHTML = this.storyDeck.map((_, i) => `<i class="${i === this.storyIndex ? 'on' : ''}"></i>`).join('');
    const last = this.storyIndex === this.storyDeck.length - 1;
    this.el.storyNext.textContent = last ? (this.storyDeck === PROLOGUE ? 'Set sail' : 'Onward') : 'Next';
    this.el.storySkip.classList.toggle('hidden', last);
  }

  // ------------------------------------------------------------ tracker
  updateQuestTracker() {
    const g = this.game, Qs = g.quests, b = g.boat;
    // a sea race has its own panel (and in fog the arrow would give the buoys away)
    const q = Qs && !g.rival?.racing && (g.mode === 'sailing' || g.mode === 'docked' || g.mode === 'docking') ? Qs.pinned : null;
    const tr = this.el.questTracker, cq = this.el.compassQuest;
    if (!q) {
      if (this.last.qt !== null) { tr?.classList.add('hidden'); cq?.classList.add('hidden'); this.last.qt = null; }
      return;
    }
    const t = Qs.target(q);
    const dx = t.x - b.pos.x, dz = t.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    const inside = t.r && d < t.r;
    const key = `${q.id}|${t.label}`;
    if (this.last.qt !== key) {
      this.last.qt = key;
      tr.classList.remove('hidden');
      this.el.qtTitle.textContent = q.title;
      this.el.qtLabel.textContent = t.label;
    }
    const distTxt = inside ? 'In the area' : fmtDist(t.r ? d - t.r : d);
    if (this.el.qtDist.textContent !== distTxt) this.el.qtDist.textContent = distTxt;
    // arrow relative to the ship's heading; the compass pin by bearing
    const brg = bearingDeg(Math.atan2(dx, dz)), head = bearingDeg(b.heading);
    let rel = ((brg - head) % 360 + 540) % 360 - 180;
    this.el.qtArrow.style.transform = `rotate(${rel.toFixed(1)}deg)`;
    this.el.qtArrow.style.opacity = inside ? 0.35 : 1;
    if (cq) {
      if (!this.compassW) this.compassW = this.el.compass?.clientWidth || 0; // measured while hidden at boot
      const w = this.compassW || 300, half = w / 2 - 10;
      const x = clampN(rel * PX_PER_DEG, -half, half);
      cq.classList.remove('hidden');
      cq.classList.toggle('edge', Math.abs(rel * PX_PER_DEG) > half);
      cq.style.left = `${w / 2 + x}px`;
    }
  }

  // ------------------------------------------------------------ the rival
  /** The race panel on the HUD: { title, line }, or null to hide it. */
  setRace(info) {
    const el = this.el.racePanel;
    if (!el) return;
    el.classList.toggle('hidden', !info);
    if (!info) return;
    this.el.rpTitle.textContent = info.title || 'Race';
    this.el.rpLine.textContent = info.line || '';
  }

  /** Big centred "3", "2", "1", "Go!" (null clears it). */
  countdown(text) {
    const el = this.el.countdown;
    if (!el) return;
    el.classList.remove('show');
    if (!text) { el.textContent = ''; return; }
    el.textContent = text;
    void el.offsetWidth;
    el.classList.add('show');
  }

  /**
   * Somebody calls across the water: a speech banner that plays the lines
   * one after another without stopping the game. Resolves when they're done
   * (or when another hail replaces them).
   */
  hail(speaker, lines) {
    const el = this.el.hail;
    if (!el || !lines?.length) return Promise.resolve();
    const token = this.hailToken = (this.hailToken || 0) + 1;
    clearTimeout(this.hailTimer);
    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (token !== this.hailToken) { resolve(); return; }
        if (i >= lines.length) { el.classList.remove('show'); resolve(); return; }
        const text = lines[i++];
        this.el.hailName.textContent = speaker;
        this.el.hailText.textContent = text;
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        this.hailTimer = setTimeout(next, Math.max(3400, 1500 + text.length * 55));
      };
      next();
    });
  }
}
