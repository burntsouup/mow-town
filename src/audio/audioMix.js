// @ts-check

/**
 * Pure mapping from what the pressure washer is doing to how loud each sound layer should
 * be. Keeping this separate from the Web Audio code makes the "sound design rules" easy to
 * read, tweak, and test.
 */

/**
 * @typedef {{
 *   equipped: boolean,
 *   spraying: boolean,
 *   hitting: boolean,
 *   strength: number,
 *   dirtRate: number,
 * }} WasherSoundState
 *   strength 0..1 at the impact point; dirtRate = dirt removed per second.
 *
 * @typedef {{
 *   humIdle: number,
 *   humSpraying: number,
 *   hiss: number,
 *   impact: number,
 *   strip: number,
 *   fullStripRate: number,
 * }} MixSettings
 */

/**
 * @param {WasherSoundState} state
 * @param {MixSettings} settings
 * @returns {{ hum: number, hiss: number, impact: number, strip: number }} Volumes, 0 = silent.
 */
export function audioMix(state, settings) {
  const { equipped, spraying, hitting, strength, dirtRate } = state;
  // The engine runs once you have the gun, and works harder while spraying.
  const hum = equipped ? (spraying ? settings.humSpraying : settings.humIdle) : 0;
  // The nozzle hisses whenever water comes out.
  const hiss = spraying ? settings.hiss : 0;
  // Water hitting a surface: louder when closer (stronger), silent when spraying at the sky.
  const impact = spraying && hitting ? settings.impact * (0.35 + 0.65 * clamp01(strength)) : 0;
  // Gritty stripping sound: follows how much dirt is actually coming off.
  const strip = spraying ? settings.strip * clamp01(dirtRate / settings.fullStripRate) : 0;
  return { hum, hiss, impact, strip };
}

/**
 * Eases a value toward a target, at the same speed at any frame rate. Used to smooth
 * jumpy per-frame numbers (like dirt removed) so the sound doesn't flutter.
 *
 * @param {number} current
 * @param {number} target
 * @param {number} dt Seconds since the previous frame.
 * @param {number} speed Higher = follows the target more closely.
 */
export function smoothTowards(current, target, dt, speed) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

/** @param {number} value */
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
