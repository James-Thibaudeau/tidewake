// A tiny event emitter. The game announces what happens (discover, dock,
// haul, wreck…) and systems like quests and the story listen, so they never
// have to patch the game's rules directly.

export class Emitter {
  constructor() { this.handlers = new Map(); }

  /** Subscribe; returns an unsubscribe function. */
  on(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) { this.handlers.get(name)?.delete(fn); }

  emit(name, ...args) {
    const hs = this.handlers.get(name);
    if (!hs) return;
    for (const fn of [...hs]) {
      try { fn(...args); } catch (e) { console.error(`[events] ${name} handler failed`, e); }
    }
  }
}
