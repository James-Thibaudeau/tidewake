// UI part: the paint yard, a section of the shipwright's tab. Pick a part of
// the ship, then a paint for it: what you own goes straight on (it's free),
// anything else is tried on the side view first, with a Buy button.
// Methods are mixed into UI (see ../ui.js), so `this` is the UI instance.
import { UPGRADES } from '../config.js';
import { LIVERY_PARTS, KINDS, paintsOf, paintInfo, kindOf, isEarned } from '../paints.js';
import { drawMark } from '../boat/marks.js';
import { drawEmblem, BOOM_LEN } from '../boat/parts.js';
import { $, esc, fmt } from './shared.js';
import { ICONS } from './icons.js';

const coin = `<span class="ico">${ICONS.coin}</span>`;
const tierName = (key, i) => UPGRADES.find((u) => u.key === key)?.tiers[i]?.label || `tier ${i}`;

/** A swatch for a paint, cloth or flag: its colours, as CSS. */
function swatchStyle(p) {
  if (!p) return 'background: repeating-linear-gradient(45deg, #b89a6a 0 6px, #8f6e44 6px 12px)'; // as built
  const c = p.color, c2 = p.color2;
  if (p.pattern === 'stripe') return `background: repeating-linear-gradient(90deg, ${c} 0 7px, ${c2} 7px 14px)`;
  if (p.pattern === 'chequer') return `background: conic-gradient(${c} 25%, ${c2} 0 50%, ${c} 0 75%, ${c2} 0) 0 0 / 14px 14px`;
  if (p.pattern === 'band') return `background: linear-gradient(${c} 36%, ${c2} 0 64%, ${c} 0)`;
  return `background: ${c}`;
}

const markCache = {};
/** A little picture of a sail emblem, on cream cloth. */
function markPicture(id) {
  if (markCache[id]) return markCache[id];
  const c = document.createElement('canvas');
  const S = c.width = c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#f3e7c9'; g.fillRect(0, 0, S, S);
  // drawEmblem squashes its rose for the sail's taper; a sail this tall undoes that
  if (id === 'compass') drawEmblem(g, S, BOOM_LEN / (1 - 0.55 * 0.5), { u: 0.5, v: 0.5, R: 1.35 });
  else { g.translate(S / 2, S / 2); g.scale(S * 0.4, S * 0.4); drawMark(g, id, false); }
  return (markCache[id] = c.toDataURL());
}

export class PaintYardUI {
  wirePaintYard() {
    this.yardPart = 'hull';
    this.yardTry = undefined; // an id being tried on the current part (null: as built); undefined: nothing
    this.el.paintYard = $('paintYard');
    this.el.yardPreview = $('yardPreview');
    this.el.paintYard?.addEventListener('click', (e) => {
      const g = this.game, Y = g.paintYard;
      const part = e.target.closest('button[data-part]');
      if (part) { this.click(); this.yardPart = part.dataset.part; this.yardTry = undefined; this.refreshPaintYard(); return; }
      const buy = e.target.closest('button[data-paintbuy]');
      if (buy && !buy.disabled) {
        this.click();
        const kind = kindOf(this.yardPart), id = buy.dataset.paintbuy;
        if (Y?.buy(kind, id)) { Y.wear(this.yardPart, id); this.yardTry = undefined; }
        this.refreshPort();
        return;
      }
      const tile = e.target.closest('[data-try]');
      if (!tile) return;
      this.click();
      const id = tile.dataset.try || null, kind = kindOf(this.yardPart);
      // yours: on it goes. Not yet: try it on the side view.
      if (id == null || Y?.owns(kind, id)) { Y?.wear(this.yardPart, id); this.yardTry = undefined; }
      else this.yardTry = id;
      this.refreshPaintYard();
    });
    this.el.paintYard?.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-try]')) { e.preventDefault(); e.target.click(); }
    });
    for (const b of document.querySelectorAll('#shipwrightNav button[data-jump]')) {
      b.addEventListener('click', () => { this.click(); $(b.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }
  }

  /** Leaving the port (or the tab): drop anything being tried on. */
  endPaintTry() { this.yardTry = undefined; }

  refreshPaintYard() {
    const box = this.el.paintYard, g = this.game, Y = g.paintYard, st = g.state;
    // only while the port is open (refreshPort also runs behind the scenes): the pictures cost a render each
    if (!box || !Y || !st || this.el.portScreen?.classList.contains('hidden')) return;
    const part = this.yardPart, kind = kindOf(part), K = KINDS[kind];
    const worn = st.livery?.[part] ?? null;
    const trying = this.yardTry !== undefined && this.yardTry !== worn ? this.yardTry : undefined;
    const showing = trying !== undefined ? trying : worn;

    const parts = LIVERY_PARTS.map((p) => `<button class="chip${p.id === part ? ' on' : ''}" data-part="${p.id}">${esc(p.name)}</button>`).join('');
    // what this ship can't show yet: no stem for a figurehead, no pennant
    let note = K.about;
    const stem = !!g.boat.figureMounts?.[g.boat.levels.hull];
    if (part === 'figurehead' && !stem) note = `There's no stem for a figurehead until the ${tierName('hull', 2)}.`;
    if (part === 'pennant' && g.boat.levels.sail < 2) note = `The pennant flies from the ${tierName('sail', 2)} up.`;

    const tile = (p) => {
      const id = p ? p.id : '';
      const have = !p || Y.owns(kind, p.id);
      const locked = p?.earn && !have;
      const on = (p ? p.id : null) === worn;
      const tag = on ? 'On the ship' : !p ? 'Free' : have ? 'Yours' : locked ? esc(p.earn.hint) : `${coin} ${fmt(p.price)}`;
      const pic = kind === 'emblem' && p ? `<img class="swPic" alt="" src="${markPicture(p.id)}">`
        : kind === 'figurehead' && p && stem ? `<img class="swPic" alt="" src="${Y.figureThumb(p.id)}">`
          : kind === 'figurehead' ? `<span class="swPic swIcon">${ICONS.hull}</span>`
          : `<span class="swPic${p?.shape === 'swallow' ? ' swallow' : ''}" style="${swatchStyle(p)}"></span>`;
      return `<div class="yardTile${on ? ' on' : ''}${(p ? p.id : null) === trying ? ' trying' : ''}${have ? '' : ' unowned'}${locked ? ' locked' : ''}" data-try="${id}" role="button" tabindex="0">
        ${pic}<span class="swName">${esc(p ? p.name : 'As built')}</span><span class="swTag">${tag}</span></div>`;
    };
    const tiles = [tile(null), ...paintsOf(kind).map(tile)].join('');

    // the bar under the picture: what's being tried, and the way to keep it
    let bar = '';
    const tp = trying ? paintInfo(kind, trying) : null;
    if (tp) {
      const afford = st.banked >= tp.price, earned = isEarned(st, tp, Y.ctx());
      bar = tp.earn && !earned
        ? `<span>${esc(tp.name)} isn't for sale. ${esc(tp.earn.hint)}.</span>`
        : `<span>Trying ${esc(tp.name)}.</span><button class="btn${afford ? ' primary' : ''}" data-paintbuy="${tp.id}" ${afford ? '' : 'disabled'}>Buy ${coin} ${fmt(tp.price)}</button>`;
    }

    box.querySelector('.yardParts').innerHTML = parts;
    box.querySelector('.yardNote').textContent = note;
    box.querySelector('.yardBar').innerHTML = bar;
    box.querySelector('.yardBar').classList.toggle('hidden', !bar);
    box.querySelector('.yardTiles').innerHTML = tiles;
    const livery = { ...st.livery, [part]: showing };
    Y.drawPreview(this.el.yardPreview, livery, { figurehead: 'bow', flag: 'masthead', pennant: 'masthead' }[part] || 'ship');
  }
}
