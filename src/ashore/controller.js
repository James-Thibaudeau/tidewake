// The on-foot character controller: a kinematic capsule with a cozy-platformer
// feel (snappy acceleration, coyote time, jump buffering, variable jump height,
// step-up and ground snapping). Pure JS so it can be tested in Node; the
// tuning constants (config.js ASHORE) are passed in.
import { moveCapsule, makeResult, overlaps } from './collide.js';

const STEP = 1 / 120; // fixed physics step (s)

export class CharacterController {
  /**
   * @param level  a level from levelgen (colliders, groundAt, waterY, ...)
   * @param P      the ASHORE constants
   */
  constructor(level, P) {
    this.level = level;
    this.P = P;
    this.opts = { r: P.radius, h: P.height, cosSlope: Math.cos(P.slopeMax) };
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.grounded = false;
    this.groundTag = null;
    this.groundNormalY = 1;
    this.coyote = 0;
    this.buffer = 0;
    this.rising = false;      // in a jump that can still be cut short
    this.splashed = false;    // fired once per fall into the water
    this.acc = 0;
    this._res = makeResult();
    this._probe = makeResult();
    this._d = { x: 0, y: 0, z: 0 };
  }

  teleport(x, y, z, yaw = this.yaw) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = yaw;
    this.grounded = false; this.coyote = 0; this.buffer = 0; this.rising = false; this.splashed = false;
    this.acc = 0;
    // settle onto whatever is below so we start grounded
    this.snapDown(1.0);
  }

  /** Horizontal speed (m/s). */
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  /**
   * input: { wishX, wishZ, run, jumpPressed, jumpHeld }
   * returns { jumped, landed, splashed, tag }
   */
  update(dt, input) {
    const ev = { jumped: false, landed: 0, splashed: false, tag: this.groundTag };
    if (input.jumpPressed) this.buffer = this.P.buffer;
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= STEP && steps < 24) {
      this.step(STEP, input, ev);
      this.acc -= STEP;
      steps++;
    }
    ev.tag = this.groundTag;
    return ev;
  }

  step(dt, input, ev) {
    const P = this.P, v = this.vel;
    // ---- wish direction & speed
    let wx = input.wishX || 0, wz = input.wishZ || 0;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const amt = Math.min(1, wl);
    const top = (input.run ? P.run : P.walk) * amt;
    const tx = amt > 1e-3 ? (wx / Math.max(wl, 1e-6)) * top : 0;
    const tz = amt > 1e-3 ? (wz / Math.max(wl, 1e-6)) * top : 0;

    // ---- horizontal acceleration (toward the target velocity)
    let rate = this.grounded ? (amt > 0.05 ? P.accel : P.friction) : P.airAccel;
    // turning back on yourself: brake harder so reversals feel crisp, not skiddy
    if (amt > 0.05 && v.x * tx + v.z * tz < 0) rate *= this.grounded ? 1.6 : 1.3;
    let dvx = tx - v.x, dvz = tz - v.z;
    const dl = Math.hypot(dvx, dvz), maxDv = rate * dt * (this.grounded ? Math.max(1, top / P.walk) : 1);
    if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
    // in the air with no input, keep momentum (only a little drag)
    if (!this.grounded && amt < 0.05) { dvx = -v.x * 0.4 * dt; dvz = -v.z * 0.4 * dt; }
    v.x += dvx; v.z += dvz;

    // ---- timers, jump
    if (this.grounded) this.coyote = P.coyote; else this.coyote -= dt;
    this.buffer -= dt;
    if (this.buffer > 0 && this.coyote > 0) {
      v.y = P.jumpVel;
      this.grounded = false; this.coyote = 0; this.buffer = 0; this.rising = true;
      ev.jumped = true;
    }
    if (this.rising && !input.jumpHeld && v.y > 0) { v.y *= P.jumpCut; this.rising = false; }
    if (v.y <= 0) this.rising = false;

    // ---- gravity
    if (!this.grounded) v.y = Math.max(-P.maxFall, v.y - P.gravity * dt);
    else if (v.y < 0) v.y = 0;

    // ---- move
    const wasGrounded = this.grounded;
    const fallSpeed = -v.y;
    const p = this.pos, d = this._d;
    const x0 = p.x, z0 = p.z, y0 = p.y;
    d.x = v.x * dt; d.y = v.y * dt; d.z = v.z * dt;
    if (wasGrounded) d.y -= 0.01; // keep in contact with the ground we're standing on
    let res = moveCapsule(this.level, p, d, this.opts, this._res);

    // ---- step up onto low ledges we walked into
    const want = Math.hypot(d.x, d.z);
    if (wasGrounded && want > 1e-4 && res.walls.length && Math.hypot(p.x - x0, p.z - z0) < want * 0.6) {
      this.tryStepUp(x0, y0, z0, d);
      res = this._res;
    }

    // ---- velocity response to contacts
    for (const w of res.walls) {
      const vn = v.x * w.nx + v.z * w.nz;
      if (vn < 0) { v.x -= w.nx * vn; v.z -= w.nz * vn; }
    }
    if (res.ceiling && v.y > 0) { v.y = 0; this.rising = false; }
    if (res.steepN) {
      // sliding on a slope too steep to stand on: keep the motion in its plane
      const n = res.steepN, vn = v.x * n.x + v.y * n.y + v.z * n.z;
      if (vn < 0) { v.x -= n.x * vn; v.y -= n.y * vn; v.z -= n.z * vn; }
    }

    let grounded = res.grounded && v.y <= 0.01;
    // stay glued to the ground when walking down slopes and steps
    if (!grounded && wasGrounded && !ev.jumped && v.y <= 0.01) grounded = this.snapDown(P.stepUp + 0.05);
    else if (grounded) { this.groundTag = res.tag; this.groundNormalY = res.normalY; }

    if (grounded) {
      if (!wasGrounded && fallSpeed > 0.5) ev.landed = Math.max(ev.landed, fallSpeed);
      if (v.y < 0) v.y = 0;
    }
    this.grounded = grounded;

    // ---- facing: turn smoothly toward where we're going
    // Face where the player is steering (not where momentum still carries us),
    // so a sharp change of direction turns the explorer almost at once.
    const sp = Math.hypot(v.x, v.z);
    if (amt > 0.1 && (sp > 0.2 || this.grounded)) {
      const target = Math.atan2(tx, tz);
      let dyaw = target - this.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const turnRate = Math.abs(dyaw) > 1.2 ? 40 : 20;
      this.yaw += dyaw * (1 - Math.exp(-turnRate * dt));
    }

    // ---- water
    if (!this.splashed && p.y < this.level.waterY - 0.6) { this.splashed = true; ev.splashed = true; }
  }

  /** Lift by stepUp, retry the move, then settle down. Keeps it only if we got further. */
  tryStepUp(x0, y0, z0, d) {
    const P = this.P, p = this.pos;
    const bx = p.x, by = p.y, bz = p.z;
    const trial = { x: x0, y: y0 + P.stepUp, z: z0 };
    if (overlaps(this.level, trial, this.opts.r, this.opts.h)) return;
    // reach far enough onto the ledge that the capsule's rounded bottom lands on
    // its flat top rather than its corner (a one-frame move is only ~3 cm)
    const len = Math.hypot(d.x, d.z), reach = Math.max(len, this.opts.r * 0.6);
    moveCapsule(this.level, trial, { x: (d.x / len) * reach, y: 0, z: (d.z / len) * reach }, this.opts, this._probe);
    // settle back down onto the ledge
    const down = moveCapsule(this.level, trial, { x: 0, y: -(P.stepUp + 0.02), z: 0 }, this.opts, this._probe);
    const progressed = Math.hypot(trial.x - x0, trial.z - z0) > Math.hypot(bx - x0, bz - z0) + 1e-3;
    if (down.grounded && down.normalY >= this.opts.cosSlope && progressed && trial.y >= y0 - 1e-3) {
      p.x = trial.x; p.y = trial.y; p.z = trial.z;
      Object.assign(this._res, down, { walls: [], ceiling: false });
    } else {
      p.x = bx; p.y = by; p.z = bz;
    }
  }

  /** Move down up to `dist` looking for walkable ground; snaps there if found. */
  snapDown(dist) {
    const p = this.pos;
    const trial = { x: p.x, y: p.y, z: p.z };
    const res = moveCapsule(this.level, trial, { x: 0, y: -dist, z: 0 }, this.opts, this._probe);
    if (res.grounded && res.normalY >= this.opts.cosSlope) {
      p.x = trial.x; p.y = trial.y; p.z = trial.z;
      this.groundTag = res.tag; this.groundNormalY = res.normalY;
      this.grounded = true;
      return true;
    }
    return false;
  }
}
