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
