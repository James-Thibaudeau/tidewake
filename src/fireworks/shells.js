// Fireworks as data and arithmetic: the shell kinds and the specials, what each one's
// sparks do, a rocket's climb, the grand finale's running order, and what the hold takes.
// No three.js and no DOM, so tools/check.mjs can run it in Node. fireworks/sky.js draws
// the points made here; fireworks.js is the game's side (buying, firing, who notices).
//
// A shell is a list of points, STRIDE numbers each. Positions are metres from the burst
// and times seconds from it:
//   0-2   where it starts            3-5   its velocity, m/s
//   6     when it is thrown           7     its place in a trail (below)
//   8     how long it burns           9     a random number, for twinkling
//   10    drag, 1/s                  11    gravity, m/s²
//   12    size, metres               13    what it is: SPARK, SMOKE, FLASH or GLITTER
//   14-16 colour, linear RGB
// Field 7: 0 is the spark itself; a negative number is a point of its tail, following
// that many seconds behind it; a positive one is an ember shed that many seconds in,
// which stays where it was shed and goes with the wind.
import { FIREWORKS } from '../config.js';
import { mulberry32, TAU } from '../util.js';

export const STRIDE = 17;
// How many points the sky keeps at once (fireworks/sky.js), and how much of each shell is made, by quality.
export const RING = { high: { points: 14000, detail: 1 }, low: { points: 4500, detail: 0.5 } };
export const SPARK = 0, SMOKE = 1, FLASH = 2, GLITTER = 3;

// What a box of rockets holds, and the specials. `wing` is Sable's: it joins the others
// once the crimson cloth is yours (paints.js).
export const KINDS = ['peony', 'willow', 'crossette', 'ring', 'crackle'];
export const SPECIALS = ['heart', 'star', 'owl', 'wing'];
export const SHELL_NAMES = {
  peony: 'a peony', willow: 'a willow', crossette: 'a crossette', ring: 'a ring', crackle: 'a crackle',
  heart: 'a heart', star: 'a star', owl: "an owl's face", wing: "Sable's crimson wing",
};
/** The specials a captain can set off: the wing only with the crimson cloth. */
export const specialsFor = (wing) => SPECIALS.filter((k) => k !== 'wing' || wing);

export const COLORS = {
  red: [1.0, 0.1, 0.06], orange: [1.0, 0.36, 0.05], gold: [1.0, 0.66, 0.2], green: [0.2, 1.0, 0.25], teal: [0.1, 0.9, 0.8],
  blue: [0.2, 0.42, 1.0], violet: [0.62, 0.22, 1.0], pink: [1.0, 0.25, 0.6], silver: [0.85, 0.92, 1.0], crimson: [0.95, 0.03, 0.08],
};
// "Mixed colours": what a rocket from the box may be.
export const ROCKET_COLORS = ['red', 'orange', 'gold', 'green', 'teal', 'blue', 'violet', 'pink', 'silver'];
const WHITE = [1, 1, 1], WARM = [1.0, 0.82, 0.5];
// Sparks are drawn bigger than life, as everything in this sea is: a spark of size 1 is this many metres across.
const SPARK_SIZE = 1.8;

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Where a spark is `t` seconds after it was thrown at `v`: drag slows it and gravity
 * bends it down. fireworks/sky.js does the same sum in its shader, so the two must agree.
 */
export function fly(v, drag, grav, t) {
  const k = (1 - Math.exp(-drag * t)) / drag;
  return [v[0] * k, v[1] * k - (grav / drag) * (t - k), v[2] * k];
}
/** Its velocity then. */
function flying(v, drag, grav, t) {
  const e = Math.exp(-drag * t);
  return [v[0] * e, v[1] * e - (grav / drag) * (1 - e), v[2] * e];
}
/** The speed that carries something `far` in `t` seconds against `drag`. */
const throwFor = (far, drag, t) => (far * drag) / (1 - Math.exp(-drag * t));

/** The points of one shell or rocket, as they are made. */
class Points {
  constructor(rng, detail) { this.a = []; this.rng = rng; this.detail = detail; }
  add(o, v, t0, trail, life, drag, grav, size, what, c) {
    if (what === SPARK || what === GLITTER) size *= SPARK_SIZE;
    this.a.push(o[0], o[1], o[2], v[0], v[1], v[2], t0, trail, life, this.rng(), drag, grav, size, what, c[0], c[1], c[2]);
  }
  /** A star: the spark, and a tail of `n` points up to `lag` seconds behind it, each dimmer and smaller. */
  star(o, v, t0, life, drag, grav, size, c, n = 4, lag = 0.16) {
    this.add(o, v, t0, 0, life, drag, grav, size, SPARK, c);
    n = Math.max(1, Math.round(n * this.detail));
    for (let j = 1; j <= n; j++) {
      const f = j / n, dim = (1 - f * 0.85) ** 1.6;
      this.add(o, v, t0, -lag * f, life, drag, grav, size * (1 - f * 0.45), SPARK, scale(c, dim * 0.8));
    }
  }
  /** A few puffs of smoke where a shell burst. */
  smoke(c, n = 7, size = 10) {
    const r = this.rng;
    for (let i = Math.max(2, Math.round(n * this.detail)); i > 0; i--) {
      const o = [(r() - 0.5) * 10, (r() - 0.5) * 8, (r() - 0.5) * 10], v = scale(o, 0.7);
      this.add(o, v, 0.05, 0, 4.5 + r() * 1.5, 1.5, -0.5, size * (0.8 + r() * 0.6), SMOKE, c);
    }
  }
  flash(o, t0, c, size = 18, life = 0.28) { this.add(o, [0, 0, 0], t0, 0, life, 1, 0, size, FLASH, mix(c, WHITE, 0.5)); }
  get count() { return this.a.length / STRIDE; }
}

/** `n` directions spread evenly over a sphere, each nudged a little. */
function sphere(n, rng) {
  const out = [], turn = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996323 + turn;
    out.push(unit([Math.cos(a) * r + (rng() - 0.5) * 0.12, y + (rng() - 0.5) * 0.12, Math.sin(a) * r + (rng() - 0.5) * 0.12]));
  }
  return out;
}

/** `n` points spaced evenly along a line through `pts` ([u, v] pairs), closed or open. */
function along(pts, n, closed = false) {
  if (pts.length === 1) return [pts[0]];
  const P = closed ? [...pts, pts[0]] : pts, len = [0];
  for (let i = 1; i < P.length; i++) len.push(len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = len[len.length - 1], out = [];
  for (let k = 0, i = 1; k < n; k++) {
    const d = (closed ? k / n : n === 1 ? 0.5 : k / (n - 1)) * total;
    while (i < P.length - 1 && len[i] < d) i++;
    const f = (d - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
    out.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]);
  }
  return out;
}
const circle = (x, y, r, n = 24) => Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * TAU) * r, y + Math.sin((i / n) * TAU) * r]);

// The specials' outlines, drawn in a box from -1 to 1 (u to the right, v up) as the
// viewer sees them: [points, how many sparks, colour, closed?] a stroke.
const HEART = Array.from({ length: 48 }, (_, i) => {
  const t = (i / 48) * TAU;
  return [(16 * Math.sin(t) ** 3) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) / 17];
});
const STAR = Array.from({ length: 10 }, (_, k) => {
  const a = Math.PI / 2 + (k * Math.PI) / 5, L = k % 2 ? 0.42 : 1;
  return [Math.cos(a) * L, Math.sin(a) * L];
});
// a wing spread up and to the right: the leading edge out to the tip, then back along six feathers
const WING = [[-1, -0.1], [-0.6, 0.35], [-0.15, 0.62], [0.45, 0.74], [1, 0.72], [0.62, 0.5], [0.92, 0.36], [0.5, 0.26], [0.74, 0.02],
  [0.32, 0.04], [0.48, -0.28], [0.1, -0.12], [0.14, -0.5], [-0.2, -0.3], [-0.3, -0.62], [-0.55, -0.36]];
const OUTLINES = {
  heart: () => [[HEART, 76, COLORS.red, true], [HEART.map(([u, v]) => [u * 0.55, v * 0.55 + 0.04]), 30, COLORS.pink, true]],
  star: () => [[STAR, 80, COLORS.gold, true], [circle(0, 0, 0.2, 10), 10, COLORS.silver, true]],
  owl: () => [
    [circle(0, -0.05, 0.92, 36).map(([u, v]) => [u, v * 0.95]), 46, [1.0, 0.8, 0.55], true],           // the face
    [[[-0.78, 0.5], [-0.72, 1.02], [-0.36, 0.8]], 9, [1.0, 0.8, 0.55], false],                       // ear tufts
    [[[0.78, 0.5], [0.72, 1.02], [0.36, 0.8]], 9, [1.0, 0.8, 0.55], false],
    [circle(-0.38, 0.14, 0.3, 16), 16, COLORS.gold, true], [circle(0.38, 0.14, 0.3, 16), 16, COLORS.gold, true], // eyes
    [[[-0.38, 0.14]], 1, COLORS.silver, false], [[[0.38, 0.14]], 1, COLORS.silver, false],            // and their shine
    [[[-0.13, -0.2], [0, -0.48], [0.13, -0.2]], 7, COLORS.orange, false],                            // the beak
  ],
  wing: () => [[WING, 96, COLORS.crimson, true], [WING.slice(0, 5).map(([u, v]) => [u * 0.9 - 0.02, v * 0.9 - 0.1]), 16, COLORS.gold, false]],
};

// How long after the burst each kind looks its best (the gallery holds it there).
const PEAK = { peony: 0.85, willow: 1.9, crossette: 1.25, ring: 0.8, crackle: 1.25, heart: 0.95, star: 0.95, owl: 0.95, wing: 0.95 };

/**
 * One shell. `color` is a name from COLORS (the specials and the willow bring their
 * own), `detail` 1 on High and less on Low (fewer sparks, shorter tails), `face` the
 * heading from the burst towards whoever is watching, so a special's picture faces them.
 * Returns { kind, color, data, count, life, peak, light, cracks }: `light` is the colour
 * it throws on the sea, `cracks` the seconds after the burst at which it pops again.
 */
export function makeShell(kind, { seed = 1, color = null, detail = 1, face = 0 } = {}) {
  if (!PEAK[kind]) kind = 'peony';
  const rng = mulberry32(Math.imul(seed | 0, 2654435761) + kind.length * 97);
  const P = new Points(rng, detail), O = [0, 0, 0], cracks = [];
  const name = COLORS[color] ? color : ROCKET_COLORS[Math.floor(rng() * ROCKET_COLORS.length)];
  let c = COLORS[name], shown = name, life = 3, power = 1;
  // the viewer's right, up, and the way to them
  const right = [Math.cos(face), 0, -Math.sin(face)], up = [0, 1, 0], fwd = [Math.sin(face), 0, Math.cos(face)];
  const n = (count) => Math.max(6, Math.round(count * detail));

  if (kind === 'peony') {
    // a round burst, sometimes with a heart of another colour
    P.smoke(c);
    for (const d of sphere(n(110), rng)) P.star(O, scale(d, 40 * (0.92 + rng() * 0.16)), 0, 2.1 + rng() * 0.5, 1.7, 5, 1.0, c);
    if (rng() < 0.5) {
      const c2 = COLORS[ROCKET_COLORS[Math.floor(rng() * ROCKET_COLORS.length)]];
      for (const d of sphere(n(34), rng)) P.star(O, scale(d, 19 * (0.9 + rng() * 0.2)), 0, 1.8 + rng() * 0.4, 1.7, 5, 0.9, c2, 3);
    }
    life = 2.8;
  } else if (kind === 'willow') {
    // gold, slow and heavy: long tails that droop, shedding embers as they fall
    c = COLORS.gold; shown = 'gold'; power = 0.8;
    P.smoke(c, 5);
    for (const d of sphere(n(72), rng)) {
      const v = scale(d, 27 * (0.85 + rng() * 0.3)), burn = 3.6 + rng() * 0.8;
      P.star(O, v, 0, burn, 1.05, 8.5, 0.85, mix(c, COLORS.orange, rng() * 0.35), 10, 1.0);
      for (let j = Math.max(1, Math.round(3 * detail)); j > 0; j--) P.add(O, v, 0, burn * (0.3 + rng() * 0.6), 0.7, 1.05, 8.5, 0.6, GLITTER, c);
    }
    life = 4.6;
  } else if (kind === 'crossette') {
    // a few stars fly out, then each splits in four with a crack
    const split = 0.75, stars = Math.max(5, Math.round(8 * Math.sqrt(detail)));
    P.smoke(c, 4);
    for (const d of sphere(stars, rng)) {
      const v = scale(d, 38);
      P.star(O, v, 0, split, 1.5, 4, 1.2, c, 5, 0.2);
      const at = fly(v, 1.5, 4, split), on = scale(flying(v, 1.5, 4, split), 0.25);
      // the cross lies flat on to whoever is watching, turned a little so no two look alike
      const turn = rng() * TAU, a = add(scale(right, Math.cos(turn)), scale(up, Math.sin(turn))), b = add(scale(right, -Math.sin(turn)), scale(up, Math.cos(turn)));
      for (const s of [a, scale(a, -1), b, scale(b, -1)]) P.star(at, add(on, scale(s, 13)), split, 1.3 + rng() * 0.3, 2.2, 3, 1.05, mix(c, WHITE, 0.15), 7, 0.5);
      P.flash(at, split, c, 5, 0.15);
    }
    cracks.push(split);
    life = 2.4;
  } else if (kind === 'ring') {
    // a ring, tipped so it shows as one, round a small heart of another colour
    const roll = rng() * TAU, tilt = 0.45 + rng() * 0.5;
    const u = add(scale(right, Math.cos(roll)), scale(up, Math.sin(roll)));
    const w = add(scale(add(scale(right, -Math.sin(roll)), scale(up, Math.cos(roll))), Math.cos(tilt)), scale(fwd, Math.sin(tilt)));
    P.smoke(c, 4);
    const m = n(72);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU;
      P.star(O, scale(add(scale(u, Math.cos(a)), scale(w, Math.sin(a))), 36), 0, 2.0 + rng() * 0.2, 1.7, 4, 1.0, c, 3);
    }
    const c2 = COLORS[name === 'gold' ? 'silver' : 'gold'];
    for (const d of sphere(n(26), rng)) P.star(O, scale(d, 12 * (0.8 + rng() * 0.4)), 0, 1.6 + rng() * 0.3, 1.7, 4, 0.85, c2, 2);
    life = 2.4;
  } else if (kind === 'crackle') {
    // a dim ball of sparks that each pop into glitter, a few at a time
    shown = name === 'silver' ? 'silver' : 'gold'; c = COLORS[shown]; power = 0.7;
    P.smoke(c, 5);
    for (const d of sphere(n(84), rng)) {
      const v = scale(d, 32 * (0.5 + rng() * 0.55)), pop = 0.75 + rng() * 0.95, at = fly(v, 2.0, 5, pop);
      P.star(O, v, 0, pop, 2.0, 5, 0.75, scale(c, 0.4), 2, 0.1);
      P.flash(at, pop, c, 3.4, 0.1);
      for (let j = 0; j < 2; j++) P.add(O, add(v, [(rng() - 0.5) * 5, (rng() - 0.5) * 5, (rng() - 0.5) * 5]), 0, pop, 0.45 + rng() * 0.3, 2.0, 5, 0.75, GLITTER, mix(c, WHITE, 0.4));
      if (cracks.length < 14) cracks.push(pop);
    }
    cracks.sort((x, y) => x - y);
    life = 2.6;
  } else {
    // a special: a picture, thrown flat on to whoever is watching so it holds its shape
    const strokes = OUTLINES[kind]();
    c = strokes[0][2]; shown = kind === 'heart' ? 'red' : kind === 'wing' ? 'crimson' : 'gold';
    P.smoke(c, 5);
    for (const [pts, count, col, closed] of strokes) {
      for (const [u, v] of along(pts, Math.max(pts.length === 1 ? 1 : 4, Math.round(count * Math.max(detail, 0.7))), closed)) {
        const dir = add(add(scale(right, u), scale(up, v)), scale(fwd, (rng() - 0.5) * 0.05));
        P.star(O, scale(dir, 30), 0, 2.6 + rng() * 0.3, 2.1, 2.2, pts.length === 1 ? 1.6 : 1.0, col, 3, 0.12);
      }
    }
    life = 3.0;
  }
  P.flash(O, 0, c);
  return { kind, color: shown, data: new Float32Array(P.a), count: P.count, life, peak: PEAK[kind], light: scale(c, power), cracks };
}

/**
 * A rocket's climb: from where it is lit to `rise` seconds later, when it is `dx`, `dz`
 * along and `height` up, slowing all the way. Times are from the moment it is lit.
 * Returns { data, count, apex, rise }: `apex` is where it gets to, from where it started.
 */
export function makeRocket({ seed = 1, height = FIREWORKS.height, rise = FIREWORKS.rise, dx = 0, dz = 0, detail = 1 } = {}) {
  const rng = mulberry32(Math.imul(seed | 0, 40503) + 7), P = new Points(rng, detail), O = [0, 0, 0], drag = 1.2;
  const k = throwFor(1, drag, rise), v = [dx * k, height * k, dz * k];
  P.star(O, v, 0, rise, drag, 0, 0.9, WARM, 8, 0.22);
  for (let i = 0, m = Math.max(4, Math.round(12 * detail)); i < m; i++) P.add(O, v, 0, (rise * (i + 0.5)) / m, 0.5, drag, 0, 0.55, GLITTER, COLORS.gold);
  for (let i = 0, m = Math.max(2, Math.round(4 * detail)); i < m; i++) P.add(O, v, 0, (rise * (i + 0.6)) / m, 2.6, drag, 0, 2.4, SMOKE, WHITE);
  return { data: new Float32Array(P.a), count: P.count, apex: fly(v, drag, 0, rise), rise };
}

/**
 * The grand finale's running order: when each rocket is lit (seconds from the start),
 * what it is, how far to one side of the ship it bursts (-1 to 1) and how high (1 = the
 * usual height). It opens one at a time, goes on in pairs, shows the specials, and ends
 * on four volleys. `wing`: Sable's crimson wing is among the specials.
 */
export function finaleShow(seed = 1, { wing = false } = {}) {
  const rng = mulberry32(Math.imul(seed | 0, 9973) + 3), out = [];
  const pick = () => ROCKET_COLORS[Math.floor(rng() * ROCKET_COLORS.length)];
  const lit = (t, kind, side, high = 1, color = pick()) => out.push({ t, kind, color, side, height: high, seed: 1 + Math.floor(rng() * 1e6) });
  // one at a time, left and right of the mast
  ['peony', 'ring', 'peony', 'crossette', 'willow', 'peony', 'ring', 'crackle'].forEach((k, i) => lit(i * 1.0, k, (i % 2 ? 0.45 : -0.45) * (0.6 + rng() * 0.6), 0.9 + rng() * 0.25));
  // in pairs, matched
  ['peony', 'crossette', 'ring', 'willow', 'peony'].forEach((k, i) => {
    const c = pick(), t = 8.4 + i * 1.55;
    lit(t, k, -0.75, 1, c); lit(t + 0.12, k, 0.75, 1, c);
  });
  // the specials, each with something either side of it
  const sp = specialsFor(wing), flank = ['crackle', 'crossette', 'ring'];
  for (let i = 0; i < 3; i++) {
    const t = 16.4 + i * 2.35, k = i === 2 && wing ? 'wing' : sp[i];
    lit(t, k, 0, 1.12);
    lit(t + 1.1, flank[i], -0.9, 0.85); lit(t + 1.22, flank[i], 0.9, 0.85);
  }
  lit(23.2, 'willow', 0, 1.2);
  // and four volleys of three to finish, the last all gold
  [['peony', 'peony', 'peony'], ['ring', 'peony', 'ring'], ['crackle', 'crossette', 'crackle'], ['willow', 'willow', 'willow']].forEach((row, i) => {
    const c = i === 3 ? 'gold' : pick();
    row.forEach((k, j) => lit(24.4 + i * 1.3 + j * 0.1, k, (j - 1) * 0.85, j === 1 ? 1.2 : 0.95, c));
  });
  return out.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ the hold
/** An empty hold: rockets, specials and grand finales, and the ports that have cheered one. */
export const blankStock = () => ({ rocket: 0, special: 0, finale: 0, cheered: [] });

/** A saved hold made safe: whole numbers within what the hold takes. */
export function normalizeStock(s) {
  const n = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));
  const out = blankStock();
  if (!s || typeof s !== 'object') return out;
  out.rocket = n(s.rocket, FIREWORKS.hold);
  out.special = n(s.special, FIREWORKS.hold - out.rocket);
  out.finale = n(s.finale, FIREWORKS.finales);
  if (Array.isArray(s.cheered)) out.cheered = [...new Set(s.cheered.filter((id) => Number.isInteger(id) && id >= 0))];
  return out;
}

/** Shells in the hold: rockets and specials together (a grand finale is crated apart). */
export const shellsIn = (stock) => (stock?.rocket || 0) + (stock?.special || 0);

/** Why an item from the Stores won't fit ('hold' | 'finales'), or null if it will. */
export function noRoomFor(stock, id) {
  const item = FIREWORKS.items[id];
  if (!item) return 'hold';
  if (shellsIn(stock) + (item.rocket || 0) + (item.special || 0) > FIREWORKS.hold) return 'hold';
  if ((stock?.finale || 0) + (item.finale || 0) > FIREWORKS.finales) return 'finales';
  return null;
}

/** Put an item's shells in the hold. */
export function stow(stock, id) {
  const item = FIREWORKS.items[id];
  for (const k of ['rocket', 'special', 'finale']) stock[k] = (stock[k] || 0) + (item[k] || 0);
  return stock;
}
