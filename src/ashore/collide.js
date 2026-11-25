// Capsule collision for walking around ashore. Pure JS (no three.js, no
// config) so it can be tested in Node.
//
// The player is a vertical capsule: feet at p = {x, y, z}, radius r, total
// height h. Its core segment runs from y + r to y + h - r.
//
// Shapes come from shapes.js: box (AABB), obox (rotated about y, using the
// three.js rotation.y convention), cyl (vertical cylinder), plus the terrain
// heightfield level.groundAt(x, z) (-Infinity = no ground, open water).
//
// Resolution rules (what makes it feel solid but forgiving):
//   - Walkable contacts (normal.y >= cos(slopeMax)) are resolved *vertically*
//     only. Floors built from many adjacent boxes never snag on their seams.
//   - Walls are resolved along their normal; ceilings push down.
//   - Deep penetration (the core segment inside a shape) pushes out along the
//     shallowest axis.
//   - Movement is substepped to at most r * 0.45 per step, so nothing
//     tunnels even at maxFall speed.

const EPS = 1e-6;
const CELL = 4; // broadphase grid cell (m)

// ------------------------------------------------------------------ index
/** Build (once per level) a uniform xz grid of collider references. */
export function buildIndex(level) {
  const cells = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  level.colliders.forEach((c, i) => {
    const [x0, z0, x1, z1] = xzBounds(c);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = key(cx, cz);
        let list = cells.get(k);
        if (!list) cells.set(k, (list = []));
        list.push(i);
      }
    }
  });
  const index = { cells, key, count: level.colliders.length, stamp: 0, seen: new Uint32Array(level.colliders.length) };
  level._index = index;
  return index;
}

function indexOf(level) {
  const ix = level._index;
  if (!ix || ix.count !== level.colliders.length) return buildIndex(level);
  return ix;
}

function xzBounds(c) {
  if (c.type === 'box') return [c.min[0], c.min[2], c.max[0], c.max[2]];
  if (c.type === 'cyl') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
  // obox: radius of the rotated rectangle
  const rr = Math.hypot(c.h[0], c.h[2]);
  return [c.c[0] - rr, c.c[2] - rr, c.c[0] + rr, c.c[2] + rr];
}

/** Colliders whose xz bounds may overlap the rectangle [x0..x1] × [z0..z1]. */
export function query(level, x0, z0, x1, z1, out = []) {
  const ix = indexOf(level);
  out.length = 0;
  ix.stamp = (ix.stamp + 1) >>> 0;
  if (ix.stamp === 0) { ix.seen.fill(0); ix.stamp = 1; }
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const list = ix.cells.get(ix.key(cx, cz));
      if (!list) continue;
      for (const i of list) {
        if (ix.seen[i] === ix.stamp) continue;
        ix.seen[i] = ix.stamp;
        out.push(level.colliders[i]);
      }
    }
  }
  return out;
}

// --------------------------------------------------------- single contact
// Each test fills `ct` = { depth, nx, ny, nz, deep } for a capsule (core
// segment sy0..sy1 at x, z, radius r) and returns true on overlap.
// The normal points from the shape toward the capsule.

/** Vertical relation between the capsule core [sy0, sy1] and a range [y0, y1]. */
function vgap(sy0, sy1, y0, y1) {
  if (sy0 > y1) return sy0 - y1;   // capsule above
  if (sy1 < y0) return sy1 - y0;   // capsule below (negative)
  return 0;                        // overlapping
}

function boxContact(x, z, sy0, sy1, r, bx0, by0, bz0, bx1, by1, bz1, ct) {
  const cx = x < bx0 ? bx0 : x > bx1 ? bx1 : x;
  const cz = z < bz0 ? bz0 : z > bz1 ? bz1 : z;
  const hx = x - cx, hz = z - cz;
  const dy = vgap(sy0, sy1, by0, by1);
  const d2 = hx * hx + dy * dy + hz * hz;
  if (d2 >= r * r) return false;
  if (d2 > EPS) {
    const d = Math.sqrt(d2);
    ct.depth = r - d; ct.nx = hx / d; ct.ny = dy / d; ct.nz = hz / d; ct.deep = false;
    return true;
  }
  // core segment inside the box: shallowest exit (including the radius)
  const feet = sy0 - r, head = sy1 + r;
  const opts = [
    [bx1 - x + r, 1, 0, 0], [x - bx0 + r, -1, 0, 0],
    [bz1 - z + r, 0, 0, 1], [z - bz0 + r, 0, 0, -1],
    [by1 - feet, 0, 1, 0], [head - by0, 0, -1, 0],
  ];
  let best = opts[0];
  for (const o of opts) if (o[0] < best[0]) best = o;
  ct.depth = best[0]; ct.nx = best[1]; ct.ny = best[2]; ct.nz = best[3]; ct.deep = true;
  return true;
}

function oboxContact(x, z, sy0, sy1, r, c, ct) {
  // into the box's local frame (inverse of three.js rotation.y)
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  const dx = x - c.c[0], dz = z - c.c[2];
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  if (!boxContact(lx, lz, sy0, sy1, r, -c.h[0], c.c[1] - c.h[1], -c.h[2], c.h[0], c.c[1] + c.h[1], c.h[2], ct)) return false;
  // normal back to world
  const nx = ct.nx * cs + ct.nz * sn, nz = -ct.nx * sn + ct.nz * cs;
  ct.nx = nx; ct.nz = nz;
  return true;
}

function cylContact(x, z, sy0, sy1, r, c, ct) {
  const dx = x - c.x, dz = z - c.z;
  const dh = Math.hypot(dx, dz);
  // closest point on the cylinder in xz
  let hx = 0, hz = 0;
  if (dh > c.r) { hx = dx - (dx / dh) * c.r; hz = dz - (dz / dh) * c.r; }
  const dy = vgap(sy0, sy1, c.y0, c.y1);
  const d2 = hx * hx + dy * dy + hz * hz;
  if (d2 >= r * r) return false;
  if (d2 > EPS) {
    const d = Math.sqrt(d2);
    ct.depth = r - d; ct.nx = hx / d; ct.ny = dy / d; ct.nz = hz / d; ct.deep = false;
    return true;
  }
  // inside: out the side, or over the top / under the bottom
  const feet = sy0 - r, head = sy1 + r;
  const side = c.r - dh + r, up = c.y1 - feet, down = head - c.y0;
  if (side <= up && side <= down) {
    const ux = dh > EPS ? dx / dh : 1, uz = dh > EPS ? dz / dh : 0;
    ct.depth = side; ct.nx = ux; ct.ny = 0; ct.nz = uz;
  } else if (up <= down) { ct.depth = up; ct.nx = 0; ct.ny = 1; ct.nz = 0; } else { ct.depth = down; ct.nx = 0; ct.ny = -1; ct.nz = 0; }
  ct.deep = true;
  return true;
}

/**
 * Terrain normal from finite differences (y-up, normalised). Each axis takes
 * the flatter of its forward and backward slopes, so at a crest (flat ground
 * meeting the top of a rock face) the flat side counts: a central difference
 * there reaches onto the face, calls the ground steep, and pushes you back
 * onto the rim. On an even slope both sides agree and nothing changes.
 */
export function terrainNormal(level, x, z, out = {}) {
  const e = 0.25, g = level.groundAt(x, z);
  const flatter = (a, b) => (Math.abs(a) < Math.abs(b) ? a : b);
  const hx = flatter(level.groundAt(x + e, z) - g, g - level.groundAt(x - e, z));
  const hz = flatter(level.groundAt(x, z + e) - g, g - level.groundAt(x, z - e));
  if (!Number.isFinite(hx) || !Number.isFinite(hz)) { out.x = 0; out.y = 1; out.z = 0; return out; }
  const nx = -hx / e, nz = -hz / e;
  const l = Math.hypot(nx, 1, nz);
  out.x = nx / l; out.y = 1 / l; out.z = nz / l;
  return out;
}

// ----------------------------------------------------------- resolution
const _ct = { depth: 0, nx: 0, ny: 0, nz: 0, deep: false };
const _cand = [];
const _tn = {};

/**
 * Push the capsule at `p` (mutated) out of everything it overlaps.
 * Returns { grounded, groundY, normalY, tag, onCollider, walls: [{nx, nz}], ceiling }.
 */
export function resolve(level, p, r, h, cosSlope, res) {
  res.grounded = false; res.normalY = 0; res.groundY = -Infinity; res.tag = null; res.onCollider = null;
  res.ceiling = false; res.walls.length = 0; res.steep = false; res.steepN = null;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    query(level, p.x - r, p.z - r, p.x + r, p.z + r, _cand);
    for (const c of _cand) {
      const sy0n = p.y + r, sy1n = p.y + h - r;
      const ct = _ct;
      let hit;
      if (c.type === 'box') hit = boxContact(p.x, p.z, sy0n, sy1n, r, c.min[0], c.min[1], c.min[2], c.max[0], c.max[1], c.max[2], ct);
      else if (c.type === 'obox') hit = oboxContact(p.x, p.z, sy0n, sy1n, r, c, ct);
      else hit = cylContact(p.x, p.z, sy0n, sy1n, r, c, ct);
      if (!hit) continue;
      applyContact(p, r, ct, cosSlope, res, c.tag, c);
      moved = true;
    }
    // terrain heightfield: the capsule's lowest point should rest on it
    const g = level.groundAt(p.x, p.z);
    if (Number.isFinite(g) && p.y < g) {
      const n = terrainNormal(level, p.x, p.z, _tn);
      if (n.y >= cosSlope) {
        p.y = g;
        markGround(res, n.y, g, level.groundTag ? level.groundTag(p.x, p.z) : 'grass', null);
      } else {
        // too steep to stand on: push out along the slope normal (slides down)
        const depth = (g - p.y) * n.y;
        p.x += n.x * depth; p.y += n.y * depth; p.z += n.z * depth;
        res.steep = true;
        res.steepN = { x: n.x, y: n.y, z: n.z };
      }
      moved = true;
    }
    if (!moved) break;
  }
  return res;
}

function markGround(res, ny, gy, tag, collider) {
  if (!res.grounded || ny > res.normalY) {
    res.grounded = true; res.normalY = ny; res.groundY = gy; res.tag = tag; res.onCollider = collider;
  }
}

function applyContact(p, r, ct, cosSlope, res, tag, c) {
  if (!ct.deep && ct.ny >= cosSlope) {
    // walkable: lift straight up just enough (no sideways nudge, so seams don't snag)
    const hx = ct.nx * (r - ct.depth), hz = ct.nz * (r - ct.depth);
    const h2 = hx * hx + hz * hz;
    const dyNeed = Math.sqrt(Math.max(0, r * r - h2));
    const dyNow = ct.ny * (r - ct.depth);
    p.y += dyNeed - dyNow + 1e-5;
    markGround(res, ct.ny, p.y, tag, c);
    return;
  }
  p.x += ct.nx * ct.depth; p.y += ct.ny * ct.depth; p.z += ct.nz * ct.depth;
  if (ct.ny >= cosSlope) markGround(res, ct.ny, p.y, tag, c);
  else if (ct.ny < -0.35) res.ceiling = true;
  else {
    const l = Math.hypot(ct.nx, ct.nz);
    if (l > EPS) res.walls.push({ nx: ct.nx / l, nz: ct.nz / l });
    if (ct.ny > 0.05) res.steep = true;
  }
}

/**
 * Move the capsule by `delta` with substeps and collision. Mutates `p`.
 * opts: { r, h, cosSlope }. Returns the merged contact info of the last
 * substep plus all walls touched and whether any ceiling was hit.
 */
export function moveCapsule(level, p, delta, opts, out = makeResult()) {
  const { r, h, cosSlope } = opts;
  const len = Math.hypot(delta.x, delta.y, delta.z);
  const n = Math.max(1, Math.ceil(len / (r * 0.45)));
  const sx = delta.x / n, sy = delta.y / n, sz = delta.z / n;
  const walls = [];
  let ceiling = false, steep = false, steepN = null;
  for (let i = 0; i < n; i++) {
    p.x += sx; p.y += sy; p.z += sz;
    resolve(level, p, r, h, cosSlope, out);
    for (const w of out.walls) walls.push(w);
    ceiling ||= out.ceiling;
    steep ||= out.steep;
    if (out.steepN) steepN = out.steepN;
  }
  out.walls = walls; out.ceiling = ceiling; out.steep = steep; out.steepN = steepN;
  return out;
}

export function makeResult() {
  return { grounded: false, groundY: -Infinity, normalY: 0, tag: null, onCollider: null, walls: [], ceiling: false, steep: false, steepN: null };
}

/** Does a capsule at p overlap anything (ignoring the terrain)? */
export function overlaps(level, p, r, h) {
  const sy0 = p.y + r, sy1 = p.y + h - r;
  query(level, p.x - r, p.z - r, p.x + r, p.z + r, _cand);
  for (const c of _cand) {
    let hit;
    if (c.type === 'box') hit = boxContact(p.x, p.z, sy0, sy1, r - 0.01, c.min[0], c.min[1], c.min[2], c.max[0], c.max[1], c.max[2], _ct);
    else if (c.type === 'obox') hit = oboxContact(p.x, p.z, sy0, sy1, r - 0.01, c, _ct);
    else hit = cylContact(p.x, p.z, sy0, sy1, r - 0.01, c, _ct);
    if (hit && _ct.depth > 0.005) return true;
  }
  const g = level.groundAt(p.x, p.z);
  return Number.isFinite(g) && p.y < g - 0.02;
}

// ------------------------------------------------------------------- rays
/**
 * Ray against all colliders and the terrain. dir need not be normalised.
 * Returns { hit, dist, point: {x, y, z} }.
 */
export function raycast(level, o, dir, maxDist) {
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const dx = dir.x / dl, dy = dir.y / dl, dz = dir.z / dl;
  let best = maxDist;
  const ex = o.x + dx * maxDist, ez = o.z + dz * maxDist;
  query(level, Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez), _cand);
  for (const c of _cand) {
    let t;
    if (c.type === 'box') t = rayBox(o.x, o.y, o.z, dx, dy, dz, c.min[0], c.min[1], c.min[2], c.max[0], c.max[1], c.max[2]);
    else if (c.type === 'obox') {
      const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      const rx = o.x - c.c[0], rz = o.z - c.c[2];
      const lx = rx * cs - rz * sn, lz = rx * sn + rz * cs;
      const ldx = dx * cs - dz * sn, ldz = dx * sn + dz * cs;
      t = rayBox(lx, o.y, lz, ldx, dy, ldz, -c.h[0], c.c[1] - c.h[1], -c.h[2], c.h[0], c.c[1] + c.h[1], c.h[2]);
    } else t = rayCyl(o, dx, dy, dz, c);
    if (t >= 0 && t < best) best = t;
  }
  // terrain: march, then refine
  const step = 0.4;
  let prev = 0;
  for (let t = step; t <= best + step; t += step) {
    const tt = Math.min(t, best);
    const g = level.groundAt(o.x + dx * tt, o.z + dz * tt);
    if (Number.isFinite(g) && o.y + dy * tt < g) {
      let a = prev, b = tt;
      for (let k = 0; k < 8; k++) {
        const m = (a + b) / 2, gm = level.groundAt(o.x + dx * m, o.z + dz * m);
        if (Number.isFinite(gm) && o.y + dy * m < gm) b = m; else a = m;
      }
      best = Math.min(best, a);
      break;
    }
    prev = tt;
    if (tt >= best) break;
  }
  const hit = best < maxDist;
  return { hit, dist: best, point: { x: o.x + dx * best, y: o.y + dy * best, z: o.z + dz * best } };
}

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  for (const [o, d, a, b] of [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]]) {
    if (Math.abs(d) < EPS) { if (o < a || o > b) return -1; continue; }
    let t0 = (a - o) / d, t1 = (b - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0; // starting inside counts as an immediate hit
}

function rayCyl(o, dx, dy, dz, c) {
  // side: |(o + t d)_xz - c| = r
  const ox = o.x - c.x, oz = o.z - c.z;
  const a = dx * dx + dz * dz, b = 2 * (ox * dx + oz * dz), cc = ox * ox + oz * oz - c.r * c.r;
  let best = -1;
  if (cc <= 0 && o.y >= c.y0 && o.y <= c.y1) return 0;
  if (a > EPS) {
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t >= 0) { const y = o.y + dy * t; if (y >= c.y0 && y <= c.y1) best = t; }
    }
  }
  // caps
  if (Math.abs(dy) > EPS) {
    for (const yc of [c.y0, c.y1]) {
      const t = (yc - o.y) / dy;
      if (t < 0 || (best >= 0 && t >= best)) continue;
      const px = ox + dx * t, pz = oz + dz * t;
      if (px * px + pz * pz <= c.r * c.r) best = t;
    }
  }
  return best;
}
