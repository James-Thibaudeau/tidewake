// Contact sheets for the look-dev gallery: named grids of views, each cell a
// full set of gallery parameters. A sheet is drawn into one image, so every
// combination can be checked in one look and compared before and after a
// change. Plain data with no three.js, so tools/check.mjs can read it in Node.
//
// `make(base)` gets the parameters already in the URL, so a sheet can be
// narrowed: `?sheet=tops-back&bottom=skirt&pose=run` is the same grid with a
// skirt on, mid-stride.
import { stylesFor } from '../cosmetics.js';
import { POSES, LIGHTS, VIEWS } from './presets.js';

const ids = (slot) => stylesFor(slot).map((s) => s.style);
const PORTRAIT = [250, 330], LANDSCAPE = [420, 300], SQUARE = [300, 300], SMALL = [200, 200];

// A sheet of another subject keeps only how things are lit, not what was showing.
const LIT = ['light', 'sun', 'ink', 'waves', 'fx'];
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
/** One value after another, `cols` to a row. */
function strip(key, values, fixed, cols = values.length) {
  return (base) => ({ cols, cells: values.map((v) => ({ label: String(v), q: { ...carry(base, fixed), [key]: v } })) });
}

export const SHEETS = {
  // ---- outfits: where clothes meet
  'tops-back': { about: 'Every top with every bag, from behind', tile: PORTRAIT, make: grid('top', ids('top'), 'extra', ids('extra'), { show: 'outfit', view: 'back' }) },
  'tops-side': { about: 'Every top with every bag, from the side', tile: PORTRAIT, make: grid('top', ids('top'), 'extra', ids('extra'), { show: 'outfit', view: 'side' }) },
  'tops-front': { about: 'Every top with every neckwear, from the front', tile: PORTRAIT, make: grid('top', ids('top'), 'neck', ids('neck'), { show: 'outfit', view: 'front' }) },
  'scarves': { about: 'Every top with every neckwear, from behind (the scarf tail)', tile: PORTRAIT, make: grid('top', ids('top'), 'neck', ids('neck'), { show: 'outfit', view: 'rear' }) },
  'bottoms': { about: 'Every top over every bottom', tile: PORTRAIT, make: grid('top', ids('top'), 'bottom', ids('bottom'), { show: 'outfit', view: 'quarter' }) },
  'running': { about: 'Every top over every bottom, mid-stride at a run', tile: PORTRAIT, make: grid('top', ids('top'), 'bottom', ids('bottom'), { show: 'outfit', view: 'quarter', pose: 'run', phase: '0.15' }) },
  'hats': { about: 'Every hat on every hair style', tile: SMALL, make: grid('hair', ids('hair'), 'hat', ids('hat'), { show: 'outfit', view: 'face' }) },
  'boots': { about: 'Every pair of boots under every bottom', tile: PORTRAIT, make: grid('bottom', ids('bottom'), 'boots', ids('boots'), { show: 'outfit', view: 'quarter' }) },
  'poses': { about: 'The current outfit in every pose, front, side and back', tile: PORTRAIT, make: grid('view', ['front', 'side', 'back'], 'pose', Object.keys(POSES), { show: 'outfit', phase: '0.15' }) },
  // ---- ships
  'ships': { about: 'Every upgrade tier, from the bow quarter and the side', tile: LANDSCAPE, make: grid('view', ['quarter', 'side'], 'tier', ['0', '1', '2', '3', '4', '5'], { show: 'ship' }) },
  'anchors': { about: 'Every anchor refit, close on the bow', tile: LANDSCAPE, make: strip('anchor', ['0', '1', '2', '3', '4'], { show: 'ship', view: 'bow', canvas: '0' }) },
  // ---- anything: the subject already in the URL
  'views': { about: 'The current subject from every fitted camera', tile: SQUARE, make: strip('view', Object.keys(VIEWS).filter((v) => VIEWS[v].kind === 'fit'), {}, 3) },
  'lights': { about: 'The current subject under every light', tile: LANDSCAPE, make: strip('light', Object.keys(LIGHTS), {}, 2) },
  'distance': { about: 'The current subject up close and from the game cameras', tile: LANDSCAPE, make: strip('view', ['quarter', 'foot', 'sail'], {}) },
};

/** The props sheet needs the prop list, which only exists once three.js has built it. */
export function propSheet(names) {
  return { about: 'Every prop', tile: SQUARE, make: strip('id', names, { show: 'prop', view: 'quarter' }, 6) };
}
