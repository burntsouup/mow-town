// @ts-check

/**
 * Pure helpers for the sound code. Keeping the "sound design rules" separate from the Web
 * Audio code makes them easy to read, tweak, and test.
 */

/**
 * Eases a value toward a target, at the same speed at any frame rate. Used to smooth
 * jumpy per-frame numbers so the sound doesn't flutter.
 *
 * @param {number} current
 * @param {number} target
 * @param {number} dt Seconds since the previous frame.
 * @param {number} speed Higher = follows the target more closely.
 */
export function smoothTowards(current, target, dt, speed) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}
