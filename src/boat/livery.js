// Boat part: colours and livery. The hull tier's own paint, cloth and flags,
// or a livery's where it names one (the paint yard's, through paints.js
// liveryFor, or Sable's Redwing): paint, sail cloth and emblem, flags and
// pennants with their patterns, and which figurehead stands on the stem.
// Methods are mixed into Boat (see ../boat.js), so `this` is the boat.
import { SAIL_BASE, HULL_STYLE, GOLD, sailTexture } from './parts.js';
import { flagTexture } from './marks.js';
import { buildFigure } from './figureheads.js';

/** Colour a flag, or give it a patterned cloth (look: { color2, pattern, shape }). */
function paintFlag(mat, color, look) {
  const map = look ? flagTexture({ color, ...look }) : null;
  const cut = look?.shape === 'swallow' ? 0.5 : 0;
  if (mat.map !== map || mat.alphaTest !== cut) {
    mat.map = map;
    mat.alphaTest = cut;
    mat.needsUpdate = true;
  }
  mat.color.set(map ? '#ffffff' : color);
}

export class BoatLivery {
  /** Hull paint, sail cloth and flags: the tier's own colours, or the livery's where it names one. */
  applyColors() {
    const lv = this.levels, Lv = this.livery || {};
    const hs = HULL_STYLE[lv.hull];
    this.hullMat.color.set(Lv.hull || hs.hull);
    this.trimMat.color.set(Lv.trim || hs.trim);
    this.deckMat.color.set(Lv.deck || hs.deck);
    this.stripeMat.color.set(Lv.trim || '#3f7fd0');
    const cloth = Lv.sail || null, look = Lv.sailLook || null;
    const mark = Lv.emblem || null;
    this.sailMat.map = sailTexture(lv.sail, false, cloth, mark, look);
    this.sailMat.needsUpdate = true;
    this.jibMat.map = sailTexture(lv.sail, true, cloth, mark, look);
    this.jibMat.needsUpdate = true;
    this.topMat.map = sailTexture(lv.sail, true, cloth, mark, look);
    this.topMat.needsUpdate = true;
    paintFlag(this.flagMat, Lv.flag || (lv.sail >= 3 ? GOLD : '#d64a3a'), Lv.flag ? Lv.flagLook : null);
    paintFlag(this.pennant.mat, Lv.pennant || (lv.sail === 4 ? '#9c2f27' : lv.sail >= 3 ? GOLD : '#2f6fd0'), Lv.pennant ? Lv.pennantLook : null);
    for (const p of this.extraPennants || []) paintFlag(p.mat, Lv.pennant || (lv.sail === 4 ? '#9c2f27' : GOLD), Lv.pennant ? Lv.pennantLook : null);
    this.wreckClothMat?.color.set(cloth || SAIL_BASE[lv.sail]);
    this.applyFigurehead();
  }

  /**
   * The figurehead on this hull's stem: the tier's own carving, or the
   * livery's. A hull with no mount (below tier 2) carries none.
   */
  applyFigurehead() {
    const want = this.livery?.figurehead || null;
    this.figures ||= {};
    const mount = this.figureMounts?.[this.levels.hull] || null;
    for (const m of this.figureMounts || []) if (m) m.base.visible = m !== mount || !want;
    for (const [id, fig] of Object.entries(this.figures)) fig.visible = id === want && !!mount;
    if (!want || !mount) return;
    const fig = this.figures[want] || buildFigure(want);
    if (!fig) { mount.base.visible = true; return; }
    this.figures[want] = fig;
    fig.visible = true;
    if (fig.parent !== mount.mount) mount.mount.add(fig);
  }

  /**
   * Repaint the boat. livery: { hull, trim, deck, sail, flag, pennant } (CSS
   * hex, each optional; `sail` dyes every sail), `sailLook` / `flagLook` /
   * `pennantLook` for a patterned cloth, `emblem` and `figurehead` ids; or
   * null for the tier's look.
   */
  setLivery(livery) {
    this.livery = livery || null;
    this.applyColors();
  }
}
