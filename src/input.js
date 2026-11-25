// Keyboard, mouse and touch input. Exposes held state (steer, spyHeld, move,
// run) and edge-triggered action counts that the game consumes once per frame.
//
// Bindings depend on the control scheme:
//   'sea'  – sailing: W/S trim the sail, A/D steer, E/Space act
//   'land' – on foot: WASD move, Space jumps, E acts, Shift runs
//   'menu' – nothing but map/pause

const COMMON_KEYS = { KeyM: 'map', KeyJ: 'journal', Escape: 'pause', KeyP: 'pause' };
const KEYMAPS = {
  sea: {
    ...COMMON_KEYS,
    KeyW: 'sailUp', ArrowUp: 'sailUp',
    KeyS: 'sailDown', ArrowDown: 'sailDown',
    KeyE: 'action', Space: 'action', Enter: 'action', NumpadEnter: 'action',
  },
  land: {
    ...COMMON_KEYS,
    Space: 'jump',
    KeyE: 'action', Enter: 'action', NumpadEnter: 'action',
  },
  menu: { ...COMMON_KEYS },
};
const ACTIONS = ['sailUp', 'sailDown', 'action', 'map', 'pause', 'jump', 'journal'];
const ALWAYS = new Set(['map', 'pause', 'journal']);
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = true;
    this.keys = new Set();
    this.scheme = 'sea';
    this.actions = Object.fromEntries(ACTIONS.map((a) => [a, 0]));
    this.stick = { x: 0, y: 0 };   // touch joystick, -1..1 (y up = forward)
    this.runButton = false;
    this.look = { dx: 0, dy: 0, zoom: 0 };
    this.tiller = 0;
    this.spyButton = false;
    this.pointers = new Map();
    this.pinchDist = 0;

    if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) this.markTouch();
    window.addEventListener('touchstart', () => this.markTouch(), { passive: true, once: true });

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clearHeld());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearHeld(); });

    // Camera look: drag / pinch / wheel on the canvas
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    canvas.addEventListener('lostpointercapture', (e) => this.onPointerUp(e));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 33;
      else if (e.deltaMode === 2) d *= 400;
      this.look.zoom += d;
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.setupTouchControls();
  }

  markTouch() { document.body.classList.add('touch'); }

  clearHeld() {
    this.keys.clear();
    this.spyButton = false;
    this.runButton = false;
    this.setTiller(0);
    this.setStick(0, 0);
  }

  /** Switch bindings: 'sea' | 'land' | 'menu'. Also swaps the touch controls. */
  setScheme(name) {
    if (!KEYMAPS[name] || name === this.scheme) return;
    this.scheme = name;
    this.clearHeld();
    for (const a of ACTIONS) if (!ALWAYS.has(a)) this.actions[a] = 0;
    document.body.classList.toggle('scheme-land', name === 'land');
  }

  onKeyDown(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    const act = KEYMAPS[this.scheme][e.code];
    if (!this.enabled) {
      if (act && ALWAYS.has(act) && !e.repeat) this.actions[act]++;
      return;
    }
    // Space/Enter on a focused button should press the button, not trigger a game action twice
    if ((e.code === 'Space' || e.code === 'Enter') && t && t.tagName === 'BUTTON') return;
    this.keys.add(e.code);
    if (act && !e.repeat) this.actions[act]++;
  }

  get steer() {
    let k = 0;
    if (this.enabled && this.scheme === 'sea') {
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) k += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) k -= 1;
    }
    const v = k + (this.enabled && this.scheme === 'sea' ? this.tiller : 0);
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }

  get spyHeld() {
    if (!this.enabled || this.scheme !== 'sea') return false;
    // not Shift: it's part of screenshot shortcuts (Cmd+Shift+4)
    return this.spyButton || this.keys.has('KeyZ');
  }

  /**
   * On-foot movement intent, before camera rotation: x = right, y = forward,
   * length 0..1. Keyboard gives full-strength diagonals normalised to 1;
   * the touch stick is analogue.
   */
  get move() {
    const out = { x: 0, y: 0 };
    if (!this.enabled || this.scheme !== 'land') return out;
    const K = this.keys;
    if (K.has('KeyD') || K.has('ArrowRight')) out.x += 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) out.x -= 1;
    if (K.has('KeyW') || K.has('ArrowUp')) out.y += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) out.y -= 1;
    out.x += this.stick.x; out.y += this.stick.y;
    const len = Math.hypot(out.x, out.y);
    if (len > 1) { out.x /= len; out.y /= len; }
    return out;
  }

  /** Held run (Shift on keyboard, or the stick pushed to its rim on touch). */
  get run() {
    if (!this.enabled || this.scheme !== 'land') return false;
    return this.runButton || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ||
      Math.hypot(this.stick.x, this.stick.y) > 0.92;
  }

  /** Held jump (for variable jump height); the jump action is the edge. */
  get jumpHeld() {
    return this.enabled && this.scheme === 'land' && (this.keys.has('Space') || this.jumpButton === true);
  }

  consumeActions() {
    const a = this.actions;
    const out = { ...a };
    for (const k of ACTIONS) a[k] = 0;
    return out;
  }

  consumeLook() {
    const out = { dx: this.look.dx, dy: this.look.dy, zoom: this.look.zoom };
    this.look.dx = this.look.dy = this.look.zoom = 0;
    return out;
  }

  // ------------------------------------------------------------- pointer look
  onPointerDown(e) {
    if (e.pointerType === 'touch') this.markTouch();
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.pinchDist = this.currentPinch();
  }

  onPointerMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (this.pointers.size === 1) {
      this.look.dx += e.clientX - p.x;
      this.look.dy += e.clientY - p.y;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size >= 2) {
      const d = this.currentPinch();
      if (this.pinchDist > 0) this.look.zoom -= (d - this.pinchDist) * 3;
      this.pinchDist = d;
    }
  }

  onPointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.pinchDist = this.pointers.size >= 2 ? this.currentPinch() : 0;
  }

  currentPinch() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  // ---------------------------------------------------------- touch controls
  setupTouchControls() {
    const tiller = document.getElementById('tiller');
    const knob = document.getElementById('tillerKnob');
    this.knob = knob;
    if (tiller) {
      let active = null;
      const setFrom = (clientX) => {
        const r = tiller.getBoundingClientRect();
        const half = r.width / 2 - 30;
        const v = (clientX - (r.left + r.width / 2)) / Math.max(10, half);
        this.setTiller(v < -1 ? -1 : v > 1 ? 1 : v);
      };
      tiller.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.markTouch();
        active = e.pointerId;
        try { tiller.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        setFrom(e.clientX);
      });
      tiller.addEventListener('pointermove', (e) => { if (e.pointerId === active) setFrom(e.clientX); });
      const end = (e) => { if (e.pointerId === active) { active = null; this.setTiller(0); } };
      tiller.addEventListener('pointerup', end);
      tiller.addEventListener('pointercancel', end);
      tiller.addEventListener('lostpointercapture', end);
    }
    const tap = (id, act) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this.enabled || ALWAYS.has(act)) this.actions[act]++;
      });
      el.addEventListener('click', (e) => e.preventDefault());
    };
    tap('btnSailUp', 'sailUp');
    tap('btnSailDown', 'sailDown');
    tap('btnAction', 'action');

    // On-foot joystick: drag anywhere inside the base, knob follows the finger
    const base = document.getElementById('stick');
    this.stickKnob = document.getElementById('stickKnob');
    if (base) {
      let active = null;
      const setFrom = (e) => {
        const r = base.getBoundingClientRect();
        const R = r.width / 2 - 14;
        const dx = (e.clientX - (r.left + r.width / 2)) / R, dy = -(e.clientY - (r.top + r.height / 2)) / R;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) { this.setStick(0, 0); return; }
        const ux = dx / len, uy = dy / len, knob = Math.min(1, len);
        // small dead zone so a resting thumb doesn't creep
        const dz = 0.12, mag = knob < dz ? 0 : (knob - dz) / (1 - dz);
        this.setStick(ux * mag, uy * mag, ux * knob, uy * knob);
      };
      base.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.markTouch();
        active = e.pointerId;
        try { base.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        setFrom(e);
      });
      base.addEventListener('pointermove', (e) => { if (e.pointerId === active) setFrom(e); });
      const end = (e) => { if (e.pointerId === active) { active = null; this.setStick(0, 0); } };
      base.addEventListener('pointerup', end);
      base.addEventListener('pointercancel', end);
      base.addEventListener('lostpointercapture', end);
    }
    const jump = document.getElementById('btnJump');
    if (jump) {
      const on = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this.enabled && this.scheme === 'land') this.actions.jump++;
        this.jumpButton = true; jump.classList.add('held');
        try { jump.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      };
      const off = () => { this.jumpButton = false; jump.classList.remove('held'); };
      jump.addEventListener('pointerdown', on);
      jump.addEventListener('pointerup', off);
      jump.addEventListener('pointercancel', off);
      jump.addEventListener('lostpointercapture', off);
    }
    const spy = document.getElementById('btnSpy');
    if (spy) {
      const on = (e) => { e.preventDefault(); e.stopPropagation(); this.spyButton = true; spy.classList.add('held'); try { spy.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } };
      const off = () => { this.spyButton = false; spy.classList.remove('held'); };
      spy.addEventListener('pointerdown', on);
      spy.addEventListener('pointerup', off);
      spy.addEventListener('pointercancel', off);
      spy.addEventListener('lostpointercapture', off);
    }
  }

  /** x, y are the (dead-zoned) values; kx, ky place the knob (defaults to x, y). */
  setStick(x, y, kx = x, ky = y) {
    this.stick.x = x; this.stick.y = y;
    if (this.stickKnob) {
      const base = this.stickKnob.parentElement;
      const R = base ? base.clientWidth / 2 - 14 : 50;
      const len = Math.min(1, Math.hypot(kx, ky));
      const a = Math.atan2(ky, kx);
      this.stickKnob.style.transform = `translate(${Math.cos(a) * len * R}px, ${-Math.sin(a) * len * R}px)`;
    }
  }

  setTiller(v) {
    this.tiller = v;
    if (this.knob) {
      const track = this.knob.parentElement;
      const half = track ? track.clientWidth / 2 - 33 : 60;
      this.knob.style.transform = `translateX(${v * half}px) rotate(${v * 50}deg)`;
    }
  }
}
