// Contact sheets for the look-dev gallery: named grids of views, each cell a
// full set of gallery parameters. A sheet is drawn into one image, so every
// combination can be checked in one look and compared before and after a
// change. Plain data with no three.js, so tools/check.mjs can read it in Node.
//
// `make(base)` gets the parameters already in the URL, so a sheet can be
// narrowed: `?sheet=tops-back&bottom=skirt&pose=run` is the same grid with a
// skirt on, mid-stride.
import { stylesFor } from '../cosmetics.js';
import { POSES, LIGHTS, VIEWS, WEATHERS } from './presets.js';
import { ASHORE_BIOMES } from '../config.js';
import { paintsOf } from '../paints.js';

const ids = (slot) => stylesFor(slot).map((s) => s.style);
const paintIds = (kind) => paintsOf(kind).map((p) => p.id);

// The ship's paint-yard parameters (subjects.js), and the part of the livery
// each one sets (`hull` and `sail` already name an upgrade tier).
export const PAINT_PARAMS = { hullPaint: 'hull', trim: 'trim', deck: 'deck', cloth: 'sail', emblem: 'emblem', flag: 'flag', pennant: 'pennant', figurehead: 'figurehead' };
const PORTRAIT = [250, 330], LANDSCAPE = [420, 300], SQUARE = [300, 300], SMALL = [200, 200];

// A sheet of another subject keeps only how things are lit, not what was showing.
const LIT = ['light', 'weather', 'sun', 'ink', 'waves', 'sea', 'zone', 'severity', 'rogue', 'from', 'fx'];
function carry(base, fixed) {
  if (!fixed.show || fixed.show === (base.show || 'outfit')) return { ...base, ...fixed };
  return { ...Object.fromEntries(LIT.filter((k) => k in base).map((k) => [k, base[k]])), ...fixed };
}

/** Every value of one parameter against every value of another; the longer list runs across. */
function grid(rowKey, rows, colKey, cols, fixed) {
  if (rows.length > cols.length) return grid(colKey, cols, rowKey, rows, fixed);
  return (base) => ({
    cols: cols.length,
    cells: rows.flatMap((r) => cols.map((c) => ({ label: `${r} · ${c}`, q: { ...carry(base, fixed), [rowKey]: r, [colKey]: c } }))),
  });
}
/** Named rows, each a set of parameters of its own, against every value of one parameter. */
function rows(named, colKey, cols, fixed) {
  return (base) => ({
    cols: cols.length,
    cells: Object.entries(named).flatMap(([name, r]) => cols.map((c) => ({ label: `${name} · ${c}`, q: { ...carry(base, fixed), severity: null, ...r, [colKey]: c } }))),
  });
}
// The sea's places, plain to rough; the three rough zones by name, from inside and from outside.
const ZONES = { coastal: { zone: 'coastal' }, shallows: { zone: 'shallows' }, bank: { zone: 'bank' }, open: { zone: 'open' },
  'outer swell': { zone: 'rough', severity: '1' }, 'cinder rip': { zone: 'rough', severity: '2' }, 'frostspire reach': { zone: 'rough', severity: '3' } };
const ROUGH_VIEWS = { 'outer swell': { zone: 'rough', severity: '1' }, 'cinder rip': { zone: 'rough', severity: '2' }, 'frostspire reach': { zone: 'rough', severity: '3' },
  'swell, from outside': { zone: 'offing', severity: '1' }, 'rip, from outside': { zone: 'offing', severity: '2' }, 'reach, from outside': { zone: 'offing', severity: '3' } };
/** Named rows, each its own parameters plus `keys` all set to the column's value, against `cols`. */
function paired(named, keys, cols, fixed) {
  return (base) => ({
    cols: cols.length,
    cells: Object.entries(named).flatMap(([name, r]) => cols.map((c) => ({ label: `${name} · ${c}`, q: { ...carry(base, fixed), ...r, ...Object.fromEntries(keys.map((k) => [k, c])) } }))),
  });
}
const TIER_ROWS = (tiers) => Object.fromEntries(tiers.map((t) => [`tier ${t}`, { tier: t }]));
/** One value after another, `cols` to a row. */
function strip(key, values, fixed, cols = values.length) {
  return (base) => ({ cols, cells: values.map((v) => ({ label: String(v), q: { ...carry(base, fixed), [key]: v } })) });
}

export const SHEETS = {
  // ---- outfits: where clothes meet
  'tops-back': { about: 'Every top with every bag, from behind', tile: PORTRAIT, make: grid('top', ids('top'), 'extra', ids('extra'), { show: 'outfit', view: 'back' }) },
  'tops-side': { about: 'Every top with every bag, from the side', tile: PORTRAIT, make: grid('top', ids('top'), 'extra', ids('extra'), { show: 'outfit', view: 'side' }) },
  'tops-front': { about: 'Every top with every neckwear, from the front', tile: PORTRAIT, make: grid('top', ids('top'), 'neck', ids('neck'), { show: 'outfit', view: 'front' }) },
  'pins': { about: 'Every top with every bag or pin, from the front', tile: PORTRAIT, make: grid('top', ids('top'), 'extra', ids('extra'), { show: 'outfit', view: 'front' }) },
  'scarves': { about: 'Every top with every neckwear, from behind (the scarf tail)', tile: PORTRAIT, make: grid('top', ids('top'), 'neck', ids('neck'), { show: 'outfit', view: 'rear' }) },
  'bottoms': { about: 'Every top over every bottom', tile: PORTRAIT, make: grid('top', ids('top'), 'bottom', ids('bottom'), { show: 'outfit', view: 'quarter' }) },
  'running': { about: 'Every top over every bottom, mid-stride at a run', tile: PORTRAIT, make: grid('top', ids('top'), 'bottom', ids('bottom'), { show: 'outfit', view: 'quarter', pose: 'run', phase: '0.15' }) },
  'hats': { about: 'Every hat on every hair style', tile: SMALL, make: grid('hair', ids('hair'), 'hat', ids('hat'), { show: 'outfit', view: 'face' }) },
  'boots': { about: 'Every pair of boots under every bottom', tile: PORTRAIT, make: grid('bottom', ids('bottom'), 'boots', ids('boots'), { show: 'outfit', view: 'quarter' }) },
  'poses': { about: 'The current outfit in every pose, front, side and back', tile: PORTRAIT, make: grid('view', ['front', 'side', 'back'], 'pose', Object.keys(POSES), { show: 'outfit', phase: '0.15' }) },
  // ---- ships
  'ships': { about: 'Every upgrade tier, from the bow quarter and the side', tile: LANDSCAPE, make: grid('view', ['quarter', 'side'], 'tier', ['0', '1', '2', '3', '4', '5'], { show: 'ship' }) },
  'anchors': { about: 'Every anchor refit, close on the bow', tile: LANDSCAPE, make: strip('anchor', ['0', '1', '2', '3', '4'], { show: 'ship', view: 'bow', canvas: '0' }) },
  // ---- the paint yard (paints.js)
  'paints': { about: 'Every hull paint on hull tiers 0, 2 and 4, from the side', tile: LANDSCAPE, make: grid('tier', ['0', '2', '4'], 'hullPaint', paintIds('paint'), { show: 'ship', view: 'side' }) },
  'paint-parts': { about: 'Every paint on the hull, the trim and the deck of a tier 3 ship, close on the bow', tile: LANDSCAPE, make: (base) => ({ cols: paintIds('paint').length,
    cells: ['hullPaint', 'trim', 'deck'].flatMap((k) => paintIds('paint').map((c) => ({ label: `${k} · ${c}`, q: { ...carry(base, { show: 'ship', view: 'bow', tier: '3', anchor: 'none', canvas: '0' }), [k]: c } }))) }) },
  'cloths': { about: 'Every sail cloth on sail tiers 0, 2, 4 and 5, from the side', tile: LANDSCAPE, make: grid('tier', ['0', '2', '4', '5'], 'cloth', paintIds('cloth'), { show: 'ship', view: 'side' }) },
  'emblems': { about: 'Every sail emblem on tiers 0, 2 and 4, and on a midnight cloth, from the side', tile: LANDSCAPE, make: paired({ ...TIER_ROWS(['0', '2', '4']), 'midnight cloth': { tier: '2', cloth: 'midnight' } }, ['emblem'], paintIds('emblem'), { show: 'ship', view: 'side' }) },
  'flags': { about: 'Every flag at the masthead with the same pennant, on sail tiers 2, 3 and 4', tile: LANDSCAPE, make: paired(TIER_ROWS(['2', '3', '4']), ['flag', 'pennant'], paintIds('flag'), { show: 'ship', view: 'masthead', spyglass: '0' }) },
  'figureheads': { about: 'Every figurehead on every hull with a stem (tiers 2-5), close on the bow', tile: LANDSCAPE, make: grid('tier', ['2', '3', '4', '5'], 'figurehead', paintIds('figurehead'), { show: 'ship', view: 'stem', canvas: '0', anchor: 'none' }) },
  // ---- the living sea
  'sealife': { about: 'Everything the living sea turns up, one of each', tile: LANDSCAPE, make: strip('kind', ['whale', 'dolphin', 'turtle', 'gull', 'fish', 'bottle', 'berg', 'spout', 'ghost'], { show: 'sealife', view: 'quarter' }, 3) },
  // ---- the sea
  'sea': { about: 'The sea in every weather: from the helm, low over the water, from a tall masthead and from a gull', tile: LANDSCAPE, make: grid('view', ['sail', 'horizon', 'aloft', 'high'], 'weather', WEATHERS, { show: 'ship', tier: '2' }) },
  'sea-lights': { about: 'The sea under every light: from the helm, a tall masthead and a gull', tile: LANDSCAPE, make: grid('view', ['sail', 'aloft', 'high'], 'light', Object.keys(LIGHTS), { show: 'ship', tier: '2' }) },
  'sea-features': { about: "The sea's large features one at a time: none, the shallows, gusts, cloud shadows, all", tile: LANDSCAPE, make: grid('view', ['sail', 'high'], 'sea', ['0', 'shallows', 'gusts', 'shade', 'shallows,gusts,shade'], { show: 'ship', tier: '2', weather: 'breezy' }) },
  'sea-zones': { about: 'Every kind of sea under every light, from the helm: the plain coast, home waters and their edge, the open sea, and the three rough zones at their worst', tile: LANDSCAPE, make: rows(ZONES, 'light', Object.keys(LIGHTS), { show: 'ship', tier: '2', view: 'sail' }) },
  'rough': { about: 'Rough water in clear weather, from inside each zone and from 500 m outside it: from the helm, low over the water, a tall masthead and a gull', tile: LANDSCAPE, make: rows(ROUGH_VIEWS, 'view', ['sail', 'horizon', 'aloft', 'high'], { show: 'ship', tier: '2' }) },
  'rogue': { about: 'A rogue wave in the Frostspire Reach, coming in off the starboard bow: 4, 3, 2 and 1 seconds out, on the ship, and a second past; from the helm, low over the water and a tall masthead', tile: LANDSCAPE, make: grid('view', ['sail', 'horizon', 'aloft'], 'rogue', ['4', '3', '2', '1', '0', '-1'], { show: 'ship', tier: '2', zone: 'rough' }) },
  'shallows': { about: 'The clear shallows of home waters under every light: from the helm, low over the water, a tall masthead and a gull', tile: LANDSCAPE, make: grid('view', ['sail', 'horizon', 'aloft', 'high'], 'light', Object.keys(LIGHTS), { show: 'ship', tier: '2', zone: 'shallows' }) },
  // ---- places
  'islands': { about: 'A generated island in every biome you can land on: near home (easy), 2.5 km out (medium), 5 km out (hard) and 7.5 km out. A biome that counts its islands nearer than they are comes out gentler: cold ones are easy, easy, medium and hard', tile: LANDSCAPE, make: grid('biome', [...ASHORE_BIOMES], 'dist', ['900', '2500', '5000', '7500'], { show: 'level' }) },
  'island-places': { about: "A generated island's moat crossing, the start of each climb, the chest's branch and the top, close up: near home, 2.5 km, 5 km and 7.5 km out (biome=tropical and seed=77 unless the page shows a level)", tile: LANDSCAPE, make: (base) => grid('at', ['moat', 'cliff', 'mesa', 'chest', 'top'], 'dist', ['900', '2500', '5000', '7500'], { show: 'level', view: 'spot', biome: base.show === 'level' && base.biome ? base.biome : 'tropical', seed: base.show === 'level' && base.seed ? base.seed : '77' })(base) },
  'temple': { about: 'The Sunken Temple from the sea: its portico, colonnade, steps, the sunken face and the hall, at noon, sunset and night', tile: LANDSCAPE, make: grid('at', ['portico', 'colonnade', 'steps', 'face', 'hall'], 'light', ['noon', 'sunset', 'night'], { show: 'temple', view: 'spot' }) },
  'cold-places': { about: "A cold island's own places, 2.5 km (easy), 5 km (medium) and 7.5 km (hard) out: its frozen pond, and its first gust of wind in the lull, as it stirs and as it blows (near home the gust is across a walk, further out across the hop after a rest)", tile: LANDSCAPE, make: rows({ pond: { at: 'pond' }, 'gust, in the lull': { at: 'gust', gust: 'calm' }, 'gust, stirring': { at: 'gust', gust: 'warn' }, 'gust, blowing': { at: 'gust', gust: 'blow' } }, 'dist', ['2500', '5000', '7500'], { show: 'level', biome: 'cold', view: 'spot' }) },
  'temple-places': { about: "The Sunken Temple's walkable level, place by place: the whole of it, the beach, the causeway, the colonnade, the portico, the hall, the treasury, the gable, the shrine and the breach", tile: LANDSCAPE, make: strip('at', ['overview', 'sea', 'beach', 'causeway', 'colonnade', 'portico', 'hall', 'treasury', 'gable', 'shrine', 'breach', 'lantern'], { show: 'ruins', view: 'spot' }, 3) },
  'temple-night': { about: "The Sunken Temple's walkable level at night: the glowing water, the hall, the treasury", tile: LANDSCAPE, make: strip('at', ['overview', 'causeway', 'colonnade', 'hall', 'treasury', 'lantern'], { show: 'ruins', view: 'spot', light: 'night' }, 3) },
  'archway-story': { about: "Archway Isle's story places, close up", tile: LANDSCAPE, make: strip('at', ['cove', 'keystone', 'lantern', 'stack'], { show: 'archway', view: 'spot' }, 2) },
  // ---- anything: the subject already in the URL
  'views': { about: 'The current subject from every fitted camera', tile: SQUARE, make: strip('view', Object.keys(VIEWS).filter((v) => VIEWS[v].kind === 'fit'), {}, 3) },
  'lights': { about: 'The current subject under every light', tile: LANDSCAPE, make: strip('light', Object.keys(LIGHTS), {}, 2) },
  'distance': { about: 'The current subject up close and from the game cameras', tile: LANDSCAPE, make: strip('view', ['quarter', 'foot', 'sail'], {}) },
};

/** The props sheet needs the prop list, which only exists once three.js has built it. */
export function propSheet(names) {
  return { about: 'Every prop', tile: SQUARE, make: strip('id', names, { show: 'prop', view: 'quarter' }, 6) };
}
