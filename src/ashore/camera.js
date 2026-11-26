// Third-person follow camera for exploring ashore: orbits the explorer, drag
// to turn and wheel/pinch to zoom (same feel as the sailing camera), swings in
// behind the direction of travel when you haven't touched it for a moment,
// and pulls in when scenery gets between it and you.
//
// Climbing round a tree it becomes a tower camera: it looks straight in at
// the trunk and orbits with you, so left and right on the stick run round the
// tree and jumps go across the screen, where gaps are easy to judge. A drag
// there is kept as an offset from that view until you leave the tree.
//
// Along a cliff face (level.faces, e.g. Archway Isle's traverse) it hangs
// out over the water and looks straight in at the rock, the same way, so left
// and right run along the ledges.
//
// Under a bough or a ledge it ducks: it looks along more level, from below
// the thing overhead, instead of rising into it.
import { raycast } from './collide.js';

const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const LEAD = -0.075; // seconds of the player's turning the tower view leads by (tuned: holding left hugs the trunk very slightly)

export class FollowCamera {
  /**
   * @param camera  a THREE.PerspectiveCamera (only position/lookAt are used)
   * @param level   the level (raycast + groundAt + waterY)
   */
  constructor(camera, level) {
    this.camera = camera;
    this.level = level;
    this.yaw = 0;          // heading the camera looks along (forward = (sin yaw, cos yaw))
    this.pitch = 0.32;     // radians above horizontal
    this.dist = 7.5;       // wanted distance
    this.cur = 7.5;        // actual distance after pull-in
    this.lastLook = -Infinity;
    this.time = 0;
    this.target = { x: 0, y: 0, z: 0 };
    this.ahead = { x: 0, z: 0 };
    this.headHeight = 1.35;
    this.extra = 0;        // context pull-back (high up, around trees), smoothed
    this.hub = null;       // the tree we're climbing round, if any
    this.hubOff = 0;       // the view's turn away from "straight at the trunk"
    this.hubManual = false; // the player set that turn by dragging
    this.lead = 0;
    this.faceIn = 0;       // on a cliff face: the eased way in at the rock
    this.duck = 0;         // 0..1: how far the view has dropped to get under something overhead
    this.solid = null;     // the level minus thin things, for pull-in checks
  }

  /**
   * The level as the camera sees it for pull-in: thin trunks, posts and leaf
   * discs are left out, so walking round a tree doesn't make the view pop in
   * and out. Rebuilt if the level's colliders change.
   */
  solidView() {
    const L = this.level;
    if (this.solid && this.solid.n === L.colliders.length) return this.solid;
    const thin = (c) => {
      if (c.type === 'cyl') return c.r < 1.2 || c.y1 - c.y0 < 0.6;
      // posts are thin both ways; a wall that's thin one way still blocks the view
      if (c.type === 'box') return Math.max(c.max[0] - c.min[0], c.max[2] - c.min[2]) < 0.9 || c.max[1] - c.min[1] < 0.35;
      return Math.max(c.h[0], c.h[2]) < 0.45 || c.h[1] < 0.18;
    };
    this.solid = { n: L.colliders.length, colliders: L.colliders.filter((c) => !thin(c)), groundAt: (x, z) => L.groundAt(x, z), waterY: L.waterY };
    return this.solid;
  }

  /** Trees with platforms spiralling round them (from the level's layout, or listed by a hand-built level). */
  hubs() {
    if (this.level.hubs) return this.level.hubs;
    const b = this.level.layout?.branches;
    return Array.isArray(b) ? b.map((x) => x.tree).filter(Boolean) : [];
  }

  /**
   * The cliff face you're on, if any (level.faces: { path: [[x, z]…] along the
   * rock, the water on its left; base, top; reach }), and the way in at it:
   * { face, inward } or null. The way in is a blend of every stretch of the
   * path near you, the nearer the more, so it turns smoothly round corners.
   */
  faceAt(p) {
    let best = null;
    for (const f of this.level.faces || []) {
      if (p.y < f.base || p.y > f.top) continue;
      let sx = 0, sz = 0, dmin = Infinity;
      for (let i = 1; i < f.path.length; i++) {
        const [ax, az] = f.path[i - 1], [bx, bz] = f.path[i];
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
        const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (l * l)));
        const d = Math.hypot(p.x - (ax + dx * t), p.z - (az + dz * t));
        if (d > f.reach + 3) continue;
        // the water is on the path's left: inward is to its right, (dz, -dx)
        const w = 1 / (d + 0.6) ** 3;
        sx += (dz / l) * w; sz += (-dx / l) * w;
        dmin = Math.min(dmin, d);
      }
      if (dmin <= f.reach && (!best || dmin < best.d)) best = { face: f, d: dmin, inward: Math.atan2(sx, sz) };
    }
    return best;
  }

  /** Jump straight to a framing behind the character (on arrival, after a respawn). */
  snap(ctrl, yaw = ctrl.yaw) {
    this.yaw = yaw;
    this.cur = this.dist;
    this.extra = 0;
    this.ahead.x = this.ahead.z = 0;
    this.target.x = ctrl.pos.x; this.target.y = ctrl.pos.y + this.headHeight; this.target.z = ctrl.pos.z;
    this.lastLook = -Infinity;
    this.hub = null;
    this.duck = 0;
    // start already pulled in if something solid is in the way (no pop after a teleport)
    const hit = raycast(this.solidView(), this.target, this.offsetDir(), this.dist + 0.3);
    if (hit.hit) this.cur = Math.max(1.4, hit.dist - 0.4);
    this.place();
  }

  /**
   * Turn stick/keys input (x = right, y = forward, -1..1) into a world-space
   * direction: forward is away from the camera.
   */
  toWorld(mx, my, out = { x: 0, z: 0 }) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // forward = (sin, cos), right = (-cos, sin)  (screen right when looking along forward)
    out.x = s * my - c * mx;
    out.z = c * my + s * mx;
    return out;
  }

  /**
   * @param ctrl    the CharacterController
   * @param look    { dx, dy, zoom } from input.consumeLook()
   * @param moving  whether the player is pushing a direction
   */
  update(dt, ctrl, look, moving) {
    this.time += dt;
    // ---- manual look
    if (look.dx || look.dy) {
      this.yaw -= look.dx * 0.006;
      this.pitch = Math.min(1.2, Math.max(-0.05, this.pitch + look.dy * 0.004));
      this.lastLook = this.time;
    }
    if (look.zoom) this.dist = Math.min(14, Math.max(4, this.dist * Math.exp(look.zoom * 0.0012)));

    // ---- auto framing (only once the player has let go of the view)
    const sp = ctrl.speed, p = ctrl.pos, v = ctrl.vel;
    const idle = this.time - this.lastLook;
    let pitchT = 0.32, extraT = 0;
    // height above the terrain below (high up = look down a little more, from further back)
    const gy = this.level.groundAt(p.x, p.z);
    const high = p.y - (Number.isFinite(gy) ? gy : (this.level.waterY ?? 0));
    if (high > 2.2) { pitchT = 0.46; extraT += Math.min(2, (high - 2.2) * 0.35 + 0.8); }

    // climbing round a tree: look straight in at the trunk from outside the
    // spiral and orbit with the player, so stick left/right is along the ledge
    let hub = null, hd = Infinity;
    for (const h of this.hubs()) {
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < (h.orbit || 2.5) + 2.2 && p.y > h.base + 0.6 && !(p.y > h.top) && d < hd) { hub = h; hd = d; }
    }
    const face = hub ? null : this.faceAt(p);
    if (hub && hd > 0.8) {
      const inward = Math.atan2(hub.x - p.x, hub.z - p.z);
      // arriving: start from the view we had and ease round; a drag is kept
      if (this.hub !== hub) { this.hub = hub; this.hubOff = wrap(this.yaw - inward); this.hubManual = false; this.lead = 0; }
      if (look.dx) { this.hubOff = wrap(this.yaw - inward - this.lead); this.hubManual = true; }
      else if (!this.hubManual) this.hubOff = damp(this.hubOff, 0, 2.2, dt);
      // no lag: if the view trailed behind, "left" would point a little off the
      // ledge and walk the player slowly outward
      // ...and a touch ahead of the player's own turning: the explorer takes a
      // moment to bend their run round the trunk, which would do the same
      const turning = ((p.x - hub.x) * v.z - (p.z - hub.z) * v.x) / (hd * hd); // rad/s round the trunk
      this.lead = damp(this.lead, turning * LEAD, 6, dt);
      this.yaw = inward + this.hubOff + this.lead;
      // stand further back round a big trunk, to see more of the way round
      pitchT = Math.max(pitchT, 0.5); extraT = Math.max(extraT, 1.6 + Math.min(2.4, (hub.orbit || 2.5) * 0.2));
    } else if (face) {
      // on a cliff face: out over the water, looking in at the rock; a drag is
      // kept. The way in eases round the wall's bends rather than snapping.
      if (this.hub !== face.face) { this.hub = face.face; this.faceIn = face.inward; this.hubOff = wrap(this.yaw - face.inward); this.hubManual = false; }
      this.faceIn += wrap(face.inward - this.faceIn) * (1 - Math.exp(-4 * dt));
      if (look.dx) { this.hubOff = wrap(this.yaw - this.faceIn); this.hubManual = true; }
      else if (!this.hubManual) this.hubOff = damp(this.hubOff, 0, 2.2, dt);
      this.yaw = this.faceIn + this.hubOff;
      pitchT = Math.max(pitchT, 0.38); extraT = Math.max(extraT, 2.6);
    } else if (moving && sp > 0.6 && idle > 0.6) {
      this.hub = null;
      // swing in behind the direction of travel
      const heading = Math.atan2(v.x, v.z);
      const off = wrap(heading - this.yaw);
      // walking straight at the camera shouldn't spin it round
      if (Math.abs(off) < 2.3) this.yaw += off * (1 - Math.exp(-(0.8 + 2.4 * Math.min(1, sp / 4.5)) * dt));
    }
    if (!hub && !face) this.hub = null;
    if (idle > 1.2) this.pitch = damp(this.pitch, pitchT, 1.4, dt);
    this.extra = damp(this.extra, extraT, 1.5, dt);

    // ---- follow target: head height plus a little look-ahead
    const ax = ctrl.vel.x * 0.22, az = ctrl.vel.z * 0.22;
    this.ahead.x = damp(this.ahead.x, ax, 3, dt);
    this.ahead.z = damp(this.ahead.z, az, 3, dt);
    // (where the explorer is drawn, between physics steps, so the view doesn't stutter)
    const t = this.target, at = ctrl.drawn();
    t.x = damp(t.x, at.x + this.ahead.x, 14, dt);
    t.z = damp(t.z, at.z + this.ahead.z, 14, dt);
    // vertical follows a bit softer, so jumps don't bob the whole view
    t.y = damp(t.y, at.y + this.headHeight, ctrl.grounded ? 8 : 3.5, dt);

    // ---- pull in when something solid blocks the view (thin things don't count)
    const full = this.dist + this.extra;
    // something solid overhead where the camera wants to be (a bough, the turn
    // above): come down under it rather than pull in against its underside
    const up = raycast(this.solidView(), t, this.offsetDir(this.pitch), full + 0.3);
    const over = up.hit && up.point.y > t.y + 1.2;
    this.duck = damp(this.duck, over ? 1 : 0, over ? 6 : 2, dt);
    const dir = this.offsetDir();
    const hit = raycast(this.solidView(), t, dir, full + 0.3);
    const want = hit.hit ? Math.max(1.4, hit.dist - 0.4) : full;
    this.cur = want < this.cur ? damp(this.cur, want, 10, dt) : damp(this.cur, want, 2.5, dt);
    this.place();
  }

  /** From the target out to the camera. By default at the ducked pitch (see `duck`). */
  offsetDir(pitch = this.pitch * (1 - 0.75 * this.duck)) {
    const cp = Math.cos(pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(pitch), z: -Math.cos(this.yaw) * cp };
  }

  place() {
    const t = this.target, d = this.offsetDir(), cam = this.camera;
    let x = t.x + d.x * this.cur, y = t.y + d.y * this.cur, z = t.z + d.z * this.cur;
    const g = this.level.groundAt(x, z);
    const floor = Math.max(Number.isFinite(g) ? g : -Infinity, this.level.waterY ?? 0) + 0.3;
    if (y < floor) y = floor;
    cam.position.set(x, y, z);
    cam.lookAt(t.x, t.y, t.z);
  }
}
