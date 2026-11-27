// UI part: the Stores, a tab of its own at port (fireworks: a box of rockets, a
// festival crate, a grand finale), and the firework button on the sailing HUD: press
// it (or F) to set off what is loaded, and its label (or G) to change that.
// Methods are mixed into UI (see ../ui.js), so `this` is the UI instance.
import { FIREWORKS } from '../config.js';
import { shellsIn, noRoomFor } from '../fireworks/shells.js';
import { STORES } from '../story-text.js';
import { $, esc, fmt } from './shared.js';
import { ICONS } from './icons.js';

const coin = `<span class="ico">${ICONS.coin}</span>`;
const put = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const count = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export class StoresUI {
  wireStores() {
    this.el.storesGrid = $('storesGrid');
    this.el.storesHold = $('storesHold');
    this.el.storesIntro = $('storesIntro');
    this.el.fwPanel = $('fwPanel');
    this.el.fwLabel = $('fwLabel');
    this.el.fwCount = $('fwCount');
    this.el.storesGrid?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-store]');
      if (!b || b.disabled) return;
      this.click();
      this.game.fireworks?.buy(b.dataset.store);
      this.refreshPort();
    });
    this.lastFw = '';
  }

  refreshStores() {
    const g = this.game, st = g.state, F = g.fireworks, grid = this.el.storesGrid;
    if (!grid || !F || !st?.fireworks) return;
    const s = st.fireworks;
    if (this.el.storesIntro) this.el.storesIntro.textContent = this.touch ? STORES.introTouch : STORES.intro;
    grid.innerHTML = Object.entries(FIREWORKS.items).map(([id, item]) => {
      const full = noRoomFor(s, id), afford = st.banked >= item.price;
      const btn = full ? `<button class="btn" disabled>${esc(put(STORES.noRoom[full], { n: count(FIREWORKS.finales, 'grand finale') }))}</button>`
        : `<button class="btn${afford ? ' primary' : ''}" data-store="${id}" ${afford ? '' : 'disabled'}>Buy ${coin} ${fmt(item.price)}</button>`;
      const gets = [item.rocket && count(item.rocket, 'rocket'), item.special && count(item.special, 'special'), item.finale && '40 shells'].filter(Boolean).join(' · ');
      return `<div class="card">
        <div class="cardHead"><div class="cardIcon">${ICONS.rocket}</div>
          <div><div class="cardName">${esc(item.name)}</div><div class="cardStat">${esc(gets)}</div></div></div>
        <div class="cardCur">${esc(STORES.about[id])}</div>
        ${btn}</div>`;
    }).join('');
    // what's aboard, and how much more will fit
    const have = [s.rocket && count(s.rocket, 'rocket'), s.special && count(s.special, 'special'), s.finale && count(s.finale, 'grand finale')].filter(Boolean);
    const room = FIREWORKS.hold - shellsIn(s);
    const lines = [
      have.length ? put(STORES.hold, { list: have.join(', ') }) : STORES.holdEmpty,
      `${room > 0 ? put(STORES.room, { n: room }) : STORES.roomFull} ${STORES.keep}`,
      `${STORES.specials} ${F.wing ? STORES.wingEarned : STORES.wingLocked}`,
    ];
    if (this.el.storesHold) this.el.storesHold.innerHTML = lines.map((l) => `<p>${esc(l)}</p>`).join('');
  }

  /** The firework button at sea: there while anything is aboard, showing what is loaded and how many. */
  updateStoresHud() {
    const g = this.game, F = g.fireworks, panel = this.el.fwPanel;
    if (!panel || !F) return;
    const s = g.state.fireworks, show = !!s && F.any && g.mode === 'sailing';
    const key = show ? `${F.loaded}:${s[F.loaded]}` : '';
    if (key === this.lastFw) return;
    this.lastFw = key;
    panel.classList.toggle('hidden', !show);
    if (!show) return;
    this.el.fwLabel.textContent = STORES.loads[F.loaded];
    this.el.fwCount.textContent = s[F.loaded];
    panel.classList.toggle('empty', !(s[F.loaded] > 0));
  }
}
