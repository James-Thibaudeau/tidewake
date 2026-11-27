// The paint yard's catalog: every paint, sail cloth, emblem, flag and
// figurehead, which part of the ship each one goes on, what it costs or how
// it is earned, and how a saved livery turns into the colours and marks the
// boat draws (liveryFor). Nothing here changes a stat.
//
// A livery is plain JSON (it lives in the save):
//   { hull, trim, deck, sail, emblem, flag, pennant, figurehead }
// Each field is a paint id, or null for the hull tier's own look.
// Pure: no three.js and no DOM, so tools/check.mjs can run it in Node.
import { CRIMSON } from './rival-text.js';

// ------------------------------------------------------------------ parts
// The parts of a ship you can paint, in the order the paint yard lists them,
// and the kind of paint each one takes.
export const LIVERY_PARTS = [
  { id: 'hull', name: 'Hull', kind: 'paint' },
  { id: 'trim', name: 'Trim', kind: 'paint' },
  { id: 'deck', name: 'Deck', kind: 'paint' },
  { id: 'sail', name: 'Sails', kind: 'cloth' },
  { id: 'emblem', name: 'Emblem', kind: 'emblem' },
  { id: 'flag', name: 'Flag', kind: 'flag' },
  { id: 'pennant', name: 'Pennant', kind: 'flag' },
  { id: 'figurehead', name: 'Figurehead', kind: 'figurehead' },
];
export const PART_IDS = LIVERY_PARTS.map((p) => p.id);

// The paint yard's shelves, one per kind.
export const KINDS = {
  paint: { name: 'Paints', about: 'For the hull, the trim and the deck.' },
  cloth: { name: 'Sail cloth', about: 'Every sail on the ship, in one cloth.' },
  emblem: { name: 'Sail emblems', about: 'One mark on the mainsail, in place of its usual pattern.' },
  flag: { name: 'Flags and pennants', about: 'For the masthead flag and the long pennant.' },
  figurehead: { name: 'Figureheads', about: 'Carved for the bow.' },
};

// ------------------------------------------------------------------ catalog
// price: gold at the paint yard (bought once, then free to use on any part
// of its kind). earn: unlocked by playing instead, never sold.
// Colours are CSS hex. Cloth and flags may add a second colour and a pattern
// (`stripe`, `chequer`, `band`); a flag may have a `swallow` (forked) tail.
const P = (kind, id, name, price, look = {}, extra = {}) => ({ kind, id, name, price, ...look, ...extra });
const EARN = (rule, hint) => ({ price: 0, earn: { rule, hint } });

export const PAINTS = [
  // paints for the hull, trim and deck
  P('paint', 'whitewash', 'Whitewash', 200, { color: '#efe8d8' }),
  P('paint', 'driftGrey', 'Driftwood grey', 250, { color: '#9a9286' }),
  P('paint', 'tarBlack', 'Tar black', 300, { color: '#2a2522' }),
  P('paint', 'mustard', 'Mustard', 350, { color: '#d9a52e' }),
  P('paint', 'seaGreen', 'Sea green', 400, { color: '#2f8a6e' }),
  P('paint', 'harborBlue', 'Harbor blue', 450, { color: '#2f5f95' }),
  P('paint', 'cherryRed', 'Cherry red', 500, { color: '#b8322a' }),
  P('paint', 'plum', 'Plum', 600, { color: '#6b3a5e' }),
  P('paint', 'goldLeaf', 'Gold leaf', 0, { color: '#e8b53a' }, EARN('charted', 'Chart every island')),
  P('paint', 'krakenInk', 'Kraken ink', 0, { color: '#2a2140' }, EARN('deep', 'Earned in the Deep')),
  // sail cloth
  P('cloth', 'cream', 'Cream', 400, { color: '#f3e7c9' }),
  P('cloth', 'skyBlue', 'Sky blue', 600, { color: '#a9d2f0' }),
  P('cloth', 'rose', 'Rose', 700, { color: '#efb2b4' }),
  P('cloth', 'sunset', 'Sunset orange', 800, { color: '#ef8a3c' }),
  P('cloth', 'midnight', 'Midnight', 900, { color: '#243653' }),
  P('cloth', 'striped', 'Striped', 1000, { color: '#fbf6ea', color2: '#c8433a', pattern: 'stripe' }),
  P('cloth', 'crimson', 'Crimson', 0, { color: CRIMSON }, EARN('sable', 'A gift from a rival')),
  // sail emblems
  P('emblem', 'star', 'Star', 500),
  P('emblem', 'wave', 'Wave', 600),
  P('emblem', 'compass', 'Compass rose', 700),
  P('emblem', 'anchor', 'Anchor', 800),
  P('emblem', 'crab', 'Crab', 1000),
  P('emblem', 'owl', 'Owl', 0, {}, EARN('grove', 'At the top of the Elder Grove')),
  // flags and pennants
  P('flag', 'red', 'Red', 150, { color: '#d64a3a' }),
  P('flag', 'blue', 'Blue', 150, { color: '#2f6fd0' }),
  P('flag', 'green', 'Green', 150, { color: '#3a9a5a' }),
  P('flag', 'white', 'White', 150, { color: '#f4efe4' }),
  P('flag', 'yellow', 'Yellow', 200, { color: '#f2c14a' }),
  P('flag', 'black', 'Black', 200, { color: '#221e26' }),
  P('flag', 'chequered', 'Chequered', 300, { color: '#221e26', color2: '#f4efe4', pattern: 'chequer' }),
  P('flag', 'swallowtail', 'Swallowtail', 400, { color: '#c8433a', color2: '#f4efe4', pattern: 'band', shape: 'swallow' }),
  // figureheads
  P('figurehead', 'gildedEagle', 'Gilded eagle', 1500),
  P('figurehead', 'dolphin', 'Dolphin', 2000),
  P('figurehead', 'owl', 'Owl', 2500),
  P('figurehead', 'seaSerpent', 'Sea serpent', 2500),
  P('figurehead', 'mermaid', 'Mermaid', 3000),
];

// Ids are unique within a kind (there is an owl emblem and an owl figurehead),
// so an item is named `kind:id` wherever kinds mix: in the save's `paints`.
export const keyOf = (p) => `${p.kind}:${p.id}`;
const BY_KEY = new Map(PAINTS.map((p) => [keyOf(p), p]));
/** The catalog entry for a kind and an id, or null. */
export function paintInfo(kind, id) { return BY_KEY.get(`${kind}:${id}`) || null; }
/** The catalog entries of one kind, in shop order. */
export function paintsOf(kind) { return PAINTS.filter((p) => p.kind === kind); }
/** The kind of paint a part takes ('hull' → 'paint'), or null for no such part. */
export function kindOf(part) { return LIVERY_PARTS.find((p) => p.id === part)?.kind || null; }

// ------------------------------------------------------------------ earning
// Each rule reads the saved state; `ctx` carries what the save alone can't
// tell (charted: every island is on the chart).
const RULES = {
  sable: (s) => !!s.rival?.flags?.dye,                               // Sable's reward for the tow out of the Deep
  deep: (s) => (s.rival?.chapter || 0) >= 8,                          // the tow out of the Deep (rival.js FINAL_CHAPTER)
  grove: (s) => (s.wardrobe || []).includes('hat:flowerCrown'),      // the Elder Grove's chest, at the crown
  charted: (s, ctx) => !!ctx?.charted,
};
/** Has this earned item been unlocked? (Bought items are never "earned".) */
export function isEarned(state, p, ctx) { return !!(p?.earn && RULES[p.earn.rule]?.(state || {}, ctx)); }

/** Is this item yours: bought, or earned? */
export function ownsPaint(state, kind, id, ctx) {
  const p = paintInfo(kind, id);
  if (!p) return false;
  return (state?.paints || []).includes(keyOf(p)) || isEarned(state, p, ctx);
}

/** Earned items that are yours but not yet in the save's `paints` (so not yet announced). */
export function newlyEarned(state, ctx) {
  const have = new Set(state?.paints || []);
  return PAINTS.filter((p) => p.earn && !have.has(keyOf(p)) && isEarned(state, p, ctx));
}

// ------------------------------------------------------------------ livery
/** Every part, unpainted: the hull tier's own look. */
export function blankLivery() { return Object.fromEntries(PART_IDS.map((k) => [k, null])); }

/** A livery from a save of any age: unknown parts dropped, unknown or misfiled ids back to the tier's look. */
export function normalizeLivery(l) {
  const out = blankLivery();
  if (!l || typeof l !== 'object') return out;
  for (const part of PART_IDS) {
    const id = l[part];
    if (typeof id === 'string' && paintInfo(kindOf(part), id)) out[part] = id;
  }
  return out;
}

/** The look of one cloth or flag: { color, color2, pattern, shape } (only what it has). */
function lookOf(p) {
  const L = {};
  for (const k of ['color2', 'pattern', 'shape']) if (p[k]) L[k] = p[k];
  return Object.keys(L).length ? L : null;
}

/**
 * The saved livery as the boat draws it (Boat.setLivery):
 *   { hull, trim, deck, sail, flag, pennant }  CSS hex colours
 *   sailLook, flagLook, pennantLook            { color2, pattern, shape } for a patterned one
 *   emblem, figurehead                         ids
 * A part left at the tier's look is left out. Null when every part is.
 */
export function liveryFor(livery) {
  const L = normalizeLivery(livery), out = {};
  for (const part of PART_IDS) {
    const id = L[part];
    if (!id) continue;
    const p = paintInfo(kindOf(part), id);
    if (part === 'emblem' || part === 'figurehead') { out[part] = id; continue; }
    out[part] = p.color;
    const look = lookOf(p);
    if (look) out[part + 'Look'] = look;
  }
  return Object.keys(out).length ? out : null;
}
