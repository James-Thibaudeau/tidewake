// Keyboard, mouse and touch input. Exposes held state (steer, spyHeld) and
// edge-triggered action counts that the game consumes once per frame.

const ACTION_KEYS = {
  KeyW: 'sailUp', ArrowUp: 'sailUp',
  KeyS: 'sailDown', ArrowDown: 'sailDown',
  KeyE: 'action', Space: 'action', Enter: 'action', NumpadEnter: 'action',
  KeyM: 'map',
  Escape: 'pause', KeyP: 'pause',
};
const ALWAYS = new Set(['map', 'pause']);
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = true;
    this.keys = new Set();
    this.actions = { sailUp: 0, sailDown: 0, action: 0, map: 0, pause: 0 };
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
    this.setTiller(0);
  }

  onKeyDown(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    const act = ACTION_KEYS[e.code];
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
    if (this.enabled) {
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) k += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) k -= 1;
    }
    const v = k + (this.enabled ? this.tiller : 0);
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }

  get spyHeld() {
    if (!this.enabled) return false;
    return this.spyButton || this.keys.has('KeyZ') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeActions() {
    const a = this.actions;
    const out = { sailUp: a.sailUp, sailDown: a.sailDown, action: a.action, map: a.map, pause: a.pause };
    a.sailUp = a.sailDown = a.action = a.map = a.pause = 0;
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

  setTiller(v) {
    this.tiller = v;
    if (this.knob) {
      const track = this.knob.parentElement;
      const half = track ? track.clientWidth / 2 - 33 : 60;
      this.knob.style.transform = `translateX(${v * half}px) rotate(${v * 50}deg)`;
    }
  }
}
