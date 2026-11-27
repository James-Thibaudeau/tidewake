// The ship at anchor while you're ashore in a storm ("Sea time while ashore"
// in the feature plan). Before the tempered chain (refit 3, the `storm` perk
// in REFITS), the anchor drags once a storm has really set in: the ashore
// panel counts down ANCHOR_DRAG.time seconds, and if you aren't back aboard by
// then she drags onto the rocks, loses a share of her hull (never all of it)
// and you row out after her. If the storm eases first, the anchor holds
// again. With the chain, a storm only tells you that it holds.
import { ANCHOR_DRAG } from '../config.js';
import { REFIT } from '../story-text.js';

export class AnchorDrag {
  constructor(ashore) {
    this.ashore = ashore;
    this.game = ashore.game;
    this.left = null;   // seconds until she drags onto the rocks (null: holding)
    this.told = false;  // this storm's "your chain holds" has been shown
  }

  /** Seconds left before she drags ashore, or null while the anchor holds. */
  get dragging() { return this.left; }

  update(dt) {
    const g = this.game, storm = g.weather.p.storm;
    if (this.left == null) {
      if (storm < ANCHOR_DRAG.start) { if (storm < ANCHOR_DRAG.end) this.told = false; return; }
      if (g.refits.holdsInStorm) {
        if (!this.told) { this.told = true; g.ui.toast(REFIT.stormHolds, 'info'); }
        return;
      }
      this.left = ANCHOR_DRAG.time;
      g.ui.toast(REFIT.stormDrag, 'warn');
    } else if (storm < ANCHOR_DRAG.end) {
      this.stop();
      g.ui.toast(REFIT.stormPassed, 'info');
      return;
    }
    this.left -= dt;
    g.ui.setAnchorDrag(Math.max(0, this.left));
    if (this.left <= 0) this.dragged();
  }

  /** Too late: she drags onto the rocks, and you row out after her. */
  dragged() {
    const g = this.game, s = g.state;
    this.stop();
    s.health = Math.max(1, s.health - g.boat.maxHealth * ANCHOR_DRAG.hull);
    g.ui.flashDamage(8);
    g.audio.play('crash');
    g.ui.toast(REFIT.stormDragged, 'warn');
    return this.ashore.leave();
  }

  /** Holding again (the storm eased, or you're back aboard). */
  stop() {
    if (this.left != null) this.game.ui.setAnchorDrag(null);
    this.left = null;
  }
}
