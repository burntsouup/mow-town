// @ts-check
import { FixedTicker } from '../game/time.js';
import { CUT_STEP_SECONDS } from './DeckCutter.js';

/**
 * Connects the string trimmer's head to the GrassGrid, like DeckCutter does for the mower:
 * it cuts at fixed 60 Hz ticks, sweeping a circle from the previous tick's spot to this one,
 * so the lawn comes out the same at any frame rate.
 */
export class TrimCutter {
  /**
   * @param {import('./GrassGrid.js').GrassGrid} grid
   * @param {import('./cutRecording.js').CutRecording | null} [recording] See DeckCutter.
   */
  constructor(grid, recording = null) {
    this.grid = grid;
    this.recording = recording;
    this.ticker = new FixedTicker(CUT_STEP_SECONDS);
    /** @type {{ x: number, z: number } | null} Where the head was at the last tick. */
    this.last = null;
  }

  /**
   * @param {number} dt Seconds in this frame.
   * @param {{ x: number, z: number }} from Head position at the start of the frame.
   * @param {{ x: number, z: number }} to Head position at the end of the frame.
   * @param {number} radius Meters: how far the spinning line reaches.
   * @param {number} cutTo Height to cut down to (0..1).
   * @returns {number} Grass cut this frame (see GrassGrid.cutDeck).
   */
  update(dt, from, to, radius, cutTo) {
    let cut = 0;
    for (const f of this.ticker.advance(dt)) {
      const here = { x: from.x + (to.x - from.x) * f, z: from.z + (to.z - from.z) * f };
      this.recording?.addTrim(this.last, here, radius, cutTo);
      cut += this.last
        ? this.grid.cutCircleStroke(this.last, here, radius, cutTo)
        : this.grid.cutCircle(here.x, here.z, radius, cutTo);
      this.last = here;
    }
    return cut;
  }

  /** The line stopped (or the head jumped): the next cut starts a fresh sweep. */
  lift() {
    this.last = null;
  }
}
