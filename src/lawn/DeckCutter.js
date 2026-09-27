// @ts-check
import { FixedTicker } from '../game/time.js';
import { lerpPose } from './deckPose.js';

/** Cutting happens 60 times a second, whatever the frame rate (see FixedTicker). */
export const CUT_STEP_SECONDS = 1 / 60;

/**
 * Connects a moving deck to the GrassGrid. Each frame it's told where the deck was at the
 * start and end of the frame; it works out where the deck was at each fixed 60 Hz tick in
 * between, and cuts a stroke from the previous tick's pose to that one.
 *
 * Because the grid only ever sees tick poses, the lawn comes out the same whatever the frame
 * rate, which will matter for multiplayer.
 */
export class DeckCutter {
  /** @param {import('./GrassGrid.js').GrassGrid} grid */
  constructor(grid) {
    this.grid = grid;
    this.ticker = new FixedTicker(CUT_STEP_SECONDS);
    /** @type {import('./deckPose.js').DeckPose | null} Where the deck was at the last tick. */
    this.lastPose = null;
  }

  /**
   * @param {number} dt Seconds in this frame.
   * @param {import('./deckPose.js').DeckPose} from Deck pose at the start of the frame.
   * @param {import('./deckPose.js').DeckPose} to Deck pose at the end of the frame.
   * @param {import('./GrassGrid.js').Deck} deck
   * @param {number} cutTo Height to cut down to (0..1).
   * @returns {number} Grass cut this frame (see GrassGrid.cutDeck).
   */
  update(dt, from, to, deck, cutTo) {
    let cut = 0;
    for (const fraction of this.ticker.advance(dt)) {
      const pose = lerpPose(from, to, fraction);
      cut += this.lastPose
        ? this.grid.cutStroke(this.lastPose, pose, deck, cutTo)
        : this.grid.cutDeck(pose, deck, cutTo);
      this.lastPose = pose;
    }
    return cut;
  }

  /** The deck left the ground (or teleported): the next cut starts a fresh stroke. */
  lift() {
    this.lastPose = null;
  }
}
