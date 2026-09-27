// @ts-check

/**
 * Converts the engine's frame time (milliseconds) into seconds for game logic.
 *
 * Large steps (a tab switch, a debugger pause, a hitch) are clamped so the simulation
 * never jumps forward: the game briefly runs in slow motion instead of teleporting.
 *
 * @param {number} deltaMs Time since the previous frame, in milliseconds.
 * @param {number} maxDeltaSeconds Longest step we are willing to simulate at once.
 * @returns {number} Step length in seconds, between 0 and maxDeltaSeconds.
 */
export function toDeltaSeconds(deltaMs, maxDeltaSeconds) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
  return Math.min(deltaMs / 1000, maxDeltaSeconds);
}

/**
 * Counts fixed-length "ticks" (e.g. 60 per second) inside variable-length frames. Anything
 * that must come out exactly the same on every computer, like cutting grass (for multiplayer
 * later), runs once per tick instead of once per frame, whatever the frame rate.
 */
export class FixedTicker {
  /** @param {number} stepSeconds Length of one tick, e.g. 1 / 60. */
  constructor(stepSeconds) {
    this.step = stepSeconds;
    this.reset();
  }

  reset() {
    /** Seconds since the last tick. */
    this.accumulator = 0;
  }

  /**
   * Moves time forward by one frame.
   *
   * @param {number} dt Seconds in this frame.
   * @returns {number[]} When each tick in this frame happened, as fractions of the frame
   *   (0 = its start, 1 = its end). Usually one; none on a short frame, several on a long one.
   */
  advance(dt) {
    if (!(dt > 0)) return [];
    const before = this.accumulator;
    this.accumulator += dt;
    // A hair of tolerance, so 60 frames of 1/60 s always make exactly 60 ticks despite
    // floating-point rounding.
    const count = Math.floor(this.accumulator / this.step + 1e-9);
    this.accumulator = Math.max(0, this.accumulator - count * this.step);
    const fractions = [];
    for (let i = 1; i <= count; i++) {
      fractions.push(Math.min(1, (i * this.step - before) / dt));
    }
    return fractions;
  }
}
