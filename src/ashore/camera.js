// Third-person follow camera for exploring ashore: orbits the explorer, drag
// to turn and wheel/pinch to zoom (same feel as the sailing camera), swings in
// behind the direction of travel when you haven't touched it for a moment,
// and pulls in when scenery gets between it and you.
import { raycast } from './collide.js';

const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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
    this.side = 1;         // which way we were circling the last tree
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

  /** Jump straight to a framing behind the character (on arrival, after a respawn). */
  snap(ctrl, yaw = ctrl.yaw) {
    this.yaw = yaw;
    this.cur = this.dist;
    this.extra = 0;
    this.ahead.x = this.ahead.z = 0;
    this.target.x = ctrl.pos.x; this.target.y = ctrl.pos.y + this.headHeight; this.target.z = ctrl.pos.z;
    this.lastLook = -Infinity;
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

    // circling a tall tree: look in at the trunk from outside the spiral, turned
    // a little toward the way we're going so the next platform stays in view
    let hub = null, hd = Infinity;
    for (const h of this.hubs()) {
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < (h.orbit || 2.5) + 2.2 && p.y > h.base + 0.6 && !(p.y > h.top) && d < hd) { hub = h; hd = d; }
    }
    if (hub && idle > 0.5) {
      const ix = (hub.x - p.x) / (hd || 1), iz = (hub.z - p.z) / (hd || 1); // toward the trunk
      const w = (p.x - hub.x) * v.z - (p.z - hub.z) * v.x;                   // circling direction
      if (Math.abs(w) > 0.5) this.side = Math.sign(w);
      const tx = -iz * this.side, tz = ix * this.side;                      // tangent we're heading along
      const yawT = Math.atan2(ix + tx * 1.2, iz + tz * 1.2); // ~50° toward the way we're circling
      this.yaw += wrap(yawT - this.yaw) * (1 - Math.exp(-3.2 * dt));
      pitchT = Math.max(pitchT, 0.55); extraT = Math.max(extraT, 1.6);
    } else if (moving && sp > 0.6 && idle > 0.6) {
      // swing in behind the direction of travel
      const heading = Math.atan2(v.x, v.z);
      const off = wrap(heading - this.yaw);
      // walking straight at the camera shouldn't spin it round
      if (Math.abs(off) < 2.3) this.yaw += off * (1 - Math.exp(-(0.8 + 2.4 * Math.min(1, sp / 4.5)) * dt));
    }
    if (idle > 1.2) this.pitch = damp(this.pitch, pitchT, 1.4, dt);
    this.extra = damp(this.extra, extraT, 1.5, dt);

    // ---- follow target: head height plus a little look-ahead
    const ax = ctrl.vel.x * 0.22, az = ctrl.vel.z * 0.22;
    this.ahead.x = damp(this.ahead.x, ax, 3, dt);
    this.ahead.z = damp(this.ahead.z, az, 3, dt);
    const t = this.target;
    t.x = damp(t.x, ctrl.pos.x + this.ahead.x, 14, dt);
    t.z = damp(t.z, ctrl.pos.z + this.ahead.z, 14, dt);
    // vertical follows a bit softer, so jumps don't bob the whole view
    t.y = damp(t.y, ctrl.pos.y + this.headHeight, ctrl.grounded ? 8 : 3.5, dt);

    // ---- pull in when something solid blocks the view (thin things don't count)
    const full = this.dist + this.extra;
    const dir = this.offsetDir();
    const hit = raycast(this.solidView(), t, dir, full + 0.3);
    const want = hit.hit ? Math.max(1.4, hit.dist - 0.4) : full;
    this.cur = want < this.cur ? damp(this.cur, want, 10, dt) : damp(this.cur, want, 2.5, dt);
    this.place();
  }

  offsetDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
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
