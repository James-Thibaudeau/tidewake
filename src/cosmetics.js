// The wardrobe: colour palettes, every wearable style, where each one comes
// from, and the appearance profile that ties them together.
//
// A profile is plain JSON (it lives in the save):
//   { name, skin, head, eyes: { color, shape }, hair: { style, color },
//     face: { blush, freckles },
//     hat:    { style, color },
//     top:    { style, color, shirt },
//     bottom: { style, color },
//     boots:  { style, color },
//     neck:   { style, color },
//     extra:  { style, color } }
// Colour fields hold palette ids. Body features (skin, eyes, hair, face) are
// always free; clothing styles may need unlocking. Clothing colours are free.

// ------------------------------------------------------------------ palettes
// Every colour has a base and a darker partner for trims, soles, shading.
const pal = (id, name, base, dark, extra = {}) => ({ id, name, base, dark, ...extra });

export const SKIN_TONES = [
  pal('s1', 'Porcelain', '#ffe6d2', '#f7c9ab'),
  pal('s2', 'Peach', '#ffd8b4', '#f4b994'),
  pal('s3', 'Sand', '#f2c497', '#e0a678'),
  pal('s4', 'Honey', '#e0a774', '#c98a58'),
  pal('s5', 'Caramel', '#c68652', '#ab6d3d'),
  pal('s6', 'Bronze', '#a86b3f', '#8d552e'),
  pal('s7', 'Cocoa', '#7f4a2a', '#683a20'),
  pal('s8', 'Ebony', '#5c3420', '#4a2918'),
];

export const HAIR_COLORS = [
  pal('chestnut', 'Chestnut', '#6e3318', '#8f4a22'),
  pal('black', 'Raven', '#1f1a1e', '#3a3038'),
  pal('darkBrown', 'Dark brown', '#3f2416', '#5a3522'),
  pal('auburn', 'Auburn', '#8a2f1c', '#a8432a'),
  pal('ginger', 'Ginger', '#d4642a', '#e8823e'),
  pal('blonde', 'Blonde', '#e8c06a', '#f4d68c'),
  pal('platinum', 'Platinum', '#efe6cf', '#fff8e6'),
  pal('silver', 'Silver', '#a9adb8', '#c9ccd4'),
  pal('seaTeal', 'Sea teal', '#2a9d94', '#45bdb2'),
  pal('coral', 'Coral pink', '#f07c8a', '#ff9eaa'),
  pal('lavender', 'Lavender', '#9a7fd0', '#b79ce6'),
  pal('midnight', 'Midnight', '#25356e', '#3a4d94'),
];

// Iris gradient: top (dark), middle, bottom (bright)
export const EYE_COLORS = [
  pal('amber', 'Amber', '#7a3d16', '#3b1f0e', { light: '#d48a3a' }),
  pal('brown', 'Brown', '#5a3018', '#2a160b', { light: '#9a6030' }),
  pal('hazel', 'Hazel', '#6d5a22', '#33280c', { light: '#b5a04a' }),
  pal('green', 'Green', '#3f7a2e', '#1a3a12', { light: '#8ad06a' }),
  pal('blue', 'Blue', '#2f62b0', '#14285a', { light: '#7ab6f0' }),
  pal('grey', 'Storm grey', '#5f6b78', '#262c33', { light: '#a8b4c0' }),
  pal('violet', 'Violet', '#6a3fa8', '#2c1452', { light: '#b48ae8' }),
  pal('teal', 'Teal', '#1f8a86', '#0c3a38', { light: '#6ad8cf' }),
  pal('gold', 'Gold', '#b08a1a', '#4a3608', { light: '#f2d25a' }),
  pal('rose', 'Rose', '#a83a5a', '#4a1426', { light: '#f08aa8' }),
];

export const HEAD_SHAPES = [
  { id: 'oval', name: 'Oval' },
  { id: 'heart', name: 'Heart' },
  { id: 'square', name: 'Square' },
  { id: 'long', name: 'Long' },
  { id: 'soft', name: 'Soft' },
  { id: 'round', name: 'Round' },
];

export const EYE_SHAPES = [
  { id: 'round', name: 'Round' },
  { id: 'sharp', name: 'Sharp' },
  { id: 'sleepy', name: 'Sleepy' },
];

export const CLOTH_COLORS = [
  pal('moss', 'Moss', '#4f7d3a', '#3c6430'),
  pal('forest', 'Forest', '#2f5a3a', '#22442b'),
  pal('navy', 'Navy', '#2b3f72', '#1e2d55'),
  pal('sky', 'Sky', '#5ea6dc', '#4486bb'),
  pal('teal', 'Teal', '#2a8f8a', '#1f6d69'),
  pal('crimson', 'Crimson', '#e8413a', '#c22f2a'),
  pal('coral', 'Coral', '#f27a5e', '#d65d44'),
  pal('mustard', 'Mustard', '#e0a62a', '#b8841b'),
  pal('plum', 'Plum', '#7a3f78', '#5e2d5c'),
  pal('charcoal', 'Charcoal', '#3c3a42', '#2a2930'),
  pal('cream', 'Cream', '#f7f0dd', '#e2d6b8'),
  pal('white', 'White', '#ffffff', '#dfe4ea'),
  pal('khaki', 'Khaki', '#c79f63', '#a8834c'),
  pal('sand', 'Sand', '#e6cf92', '#7a4a24'),
  pal('tan', 'Tan leather', '#a9743c', '#7f5428'),
  pal('leather', 'Dark leather', '#6e4224', '#35200f'),
];

export const PALETTES = { skin: SKIN_TONES, hair: HAIR_COLORS, eyes: EYE_COLORS, cloth: CLOTH_COLORS };

/** Look up a palette entry by id, falling back to the first entry. */
export function color(palette, id) {
  return palette.find((c) => c.id === id) || palette[0];
}

// ------------------------------------------------------------------- styles
// source: 'starter' (owned from the start), 'tailor' (buy at a port for `price`),
// 'found:<biome|landmark>' (island chests, Phase 3+), 'story' / 'quest:<id>' (rewards).
// `hint` is shown on locked items.
const S = (slot, style, name, source = 'starter', o = {}) => ({ id: `${slot}:${style}`, slot, style, name, source, ...o });

export const STYLES = [
  // hair (always free)
  S('hair', 'spiky', 'Spiky'),
  S('hair', 'bob', 'Bob'),
  S('hair', 'ponytail', 'Ponytail'),
  S('hair', 'buns', 'Twin buns'),
  S('hair', 'buzz', 'Buzz cut'),
  S('hair', 'curly', 'Curly'),

  // hats
  S('hat', 'none', 'No hat'),
  S('hat', 'pith', 'Pith helmet'),
  S('hat', 'bandana', 'Bandana'),
  S('hat', 'straw', 'Straw hat', 'tailor', { price: 60 }),
  S('hat', 'tricorn', 'Tricorn', 'tailor', { price: 150 }),
  S('hat', 'captain', "Captain's cap", 'tailor', { price: 250 }),
  S('hat', 'furHood', 'Fur hood', 'found:cold', { hint: 'Found in the frozen north' }),
  S('hat', 'flowerCrown', 'Flower crown', 'found:grove', { hint: 'At the top of the Elder Grove' }),
  S('hat', 'circlet', 'Gold circlet', 'found:ruins', { hint: 'Hidden in the Sunken Temple' }),
  S('hat', 'grandPith', "Grandpa's helmet", 'story', { hint: "Your grandfather's last gift" }),
  S('hat', 'rivalTricorn', "Sable's tricorn", 'story', { hint: 'A gift from a rival captain' }),

  // tops (`color` is the outer layer, `shirt` the undershirt / trim)
  S('top', 'vest', 'Explorer vest'),
  S('top', 'sailor', 'Sailor shirt'),
  S('top', 'tank', 'Tank top'),
  S('top', 'poncho', 'Poncho', 'tailor', { price: 120 }),
  S('top', 'coat', 'Long coat', 'tailor', { price: 200 }),

  // bottoms
  S('bottom', 'shorts', 'Shorts'),
  S('bottom', 'trousers', 'Trousers'),
  S('bottom', 'skirt', 'Skirt'),
  S('bottom', 'cargo', 'Cargo pants', 'tailor', { price: 80 }),

  // boots
  S('boots', 'chunky', 'Chunky boots'),
  S('boots', 'sandals', 'Sandals', 'tailor', { price: 40 }),
  S('boots', 'tall', 'Tall boots', 'tailor', { price: 120 }),

  // neckwear (the scarf has the fluttering tail)
  S('neck', 'scarf', 'Scarf'),
  S('neck', 'neckerchief', 'Neckerchief'),
  S('neck', 'none', 'Nothing'),
  S('neck', 'shells', 'Shell necklace', 'found:tropical', { hint: 'Found on a tropical isle' }),
  S('neck', 'grandScarf', "Grandpa's scarf", 'story', { hint: "Your grandfather's last gift" }),

  // extras
  S('extra', 'satchel', 'Satchel'),
  S('extra', 'none', 'Nothing'),
  S('extra', 'backpack', 'Backpack', 'tailor', { price: 150 }),
];

export const SLOTS = ['hair', 'hat', 'top', 'bottom', 'boots', 'neck', 'extra'];
// Styles whose look is fixed (colour pickers are hidden for these)
export const FIXED_COLOR = new Set(['hat:none', 'hat:furHood', 'hat:flowerCrown', 'hat:circlet', 'hat:grandPith', 'hat:rivalTricorn',
  'neck:none', 'neck:shells', 'neck:grandScarf', 'extra:none']);

export function stylesFor(slot) { return STYLES.filter((s) => s.slot === slot); }
export function styleInfo(slot, style) { return STYLES.find((s) => s.slot === slot && s.style === style) || null; }

/** Does the player own this style? `wardrobe` is the save's list of unlocked style ids. */
export function owns(wardrobe, slot, style) {
  const s = styleInfo(slot, style);
  if (!s) return false;
  return s.source === 'starter' || (wardrobe || []).includes(s.id);
}

/** Short text for a locked style: price or where to find it. */
export function lockText(s) {
  if (s.source === 'tailor') return `${s.price} gold at a port tailor`;
  return s.hint || 'Not yet found';
}

// ------------------------------------------------------------------ profile
// The default is the original explorer, with an oval face rather than the
// first version's perfectly round head ('round' is still offered).
export const DEFAULT_PROFILE = Object.freeze({
  name: 'Captain',
  skin: 's2',
  head: 'oval',
  eyes: { color: 'amber', shape: 'round' },
  hair: { style: 'spiky', color: 'chestnut' },
  face: { blush: true, freckles: false },
  hat: { style: 'pith', color: 'sand' },
  top: { style: 'vest', color: 'moss', shirt: 'cream' },
  bottom: { style: 'shorts', color: 'khaki' },
  boots: { style: 'chunky', color: 'leather' },
  neck: { style: 'scarf', color: 'crimson' },
  extra: { style: 'satchel', color: 'tan' },
});

const clone = (o) => JSON.parse(JSON.stringify(o));
const hasId = (palette, id) => palette.some((c) => c.id === id);

/**
 * Fill gaps and replace unknown ids so a profile from any save (or none) is
 * safe to build. Never throws. Returns a new object.
 */
export function normalizeProfile(p) {
  const d = clone(DEFAULT_PROFILE);
  if (!p || typeof p !== 'object') return d;
  const out = clone(d);
  if (typeof p.name === 'string' && p.name.trim()) out.name = p.name.trim().slice(0, 18);
  if (hasId(SKIN_TONES, p.skin)) out.skin = p.skin;
  if (HEAD_SHAPES.some((h) => h.id === p.head)) out.head = p.head;
  if (p.eyes) {
    if (hasId(EYE_COLORS, p.eyes.color)) out.eyes.color = p.eyes.color;
    if (EYE_SHAPES.some((e) => e.id === p.eyes.shape)) out.eyes.shape = p.eyes.shape;
  }
  if (p.face) { out.face.blush = p.face.blush !== false; out.face.freckles = !!p.face.freckles; }
  if (p.hair) {
    if (styleInfo('hair', p.hair.style)) out.hair.style = p.hair.style;
    if (hasId(HAIR_COLORS, p.hair.color)) out.hair.color = p.hair.color;
  }
  for (const slot of ['hat', 'top', 'bottom', 'boots', 'neck', 'extra']) {
    const v = p[slot];
    if (!v) continue;
    if (styleInfo(slot, v.style)) out[slot].style = v.style;
    if (hasId(CLOTH_COLORS, v.color)) out[slot].color = v.color;
    if (slot === 'top' && hasId(CLOTH_COLORS, v.shirt)) out.top.shirt = v.shirt;
  }
  return out;
}

/** A random, coherent look using only owned styles. */
export function randomProfile(wardrobe, keepName = 'Captain', rnd = Math.random) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ownedStyle = (slot) => pick(stylesFor(slot).filter((s) => owns(wardrobe, slot, s.style))).style;
  // Keep outfits readable: the outer layer and undershirt shouldn't match
  const cloth = CLOTH_COLORS.map((c) => c.id);
  const top = pick(cloth);
  let shirt = pick(['cream', 'white', 'sky', 'khaki', 'sand']);
  if (shirt === top) shirt = 'cream';
  const hairColor = rnd() < 0.8 ? pick(HAIR_COLORS.slice(0, 8)).id : pick(HAIR_COLORS.slice(8)).id;
  return normalizeProfile({
    name: keepName,
    skin: pick(SKIN_TONES).id,
    head: pick(HEAD_SHAPES).id,
    eyes: { color: pick(EYE_COLORS).id, shape: pick(EYE_SHAPES).id },
    hair: { style: ownedStyle('hair'), color: hairColor },
    face: { blush: rnd() < 0.7, freckles: rnd() < 0.3 },
    hat: { style: rnd() < 0.25 ? 'none' : ownedStyle('hat'), color: pick(cloth) },
    top: { style: ownedStyle('top'), color: top, shirt },
    bottom: { style: ownedStyle('bottom'), color: pick(['khaki', 'navy', 'charcoal', 'sand', 'forest', 'tan', 'plum']) },
    boots: { style: ownedStyle('boots'), color: pick(['leather', 'tan', 'charcoal', 'khaki']) },
    neck: { style: ownedStyle('neck'), color: pick(cloth) },
    extra: { style: ownedStyle('extra'), color: pick(['tan', 'leather', 'khaki', 'forest']) },
  });
}
