// @ts-check

/**
 * Picking a render resolution that the screen can keep up with. Pure logic, no Babylon.
 *
 * A 120 Hz screen leaves only 8.3 ms to draw each frame, and on a Retina MacBook the grass
 * alone takes about that at full resolution. So on fast screens we render a little below
 * the screen's own sharpness (at 1.5 pixels per CSS pixel instead of 2), which the eye barely
 * notices but halves the pixels to fill.
 *
 * @typedef {{ maxPixelRatio: number, highRefreshAbove: number,
 *   highRefreshPixelRatio: number }} DisplaySettings
 */

/**
 * The screen's refresh rate, from the time between a few frames while nothing heavy runs.
 * The middle value (median) ignores the odd slow frame.
 *
 * @param {number[]} frameMs Milliseconds between frames.
 * @returns {number} Frames per second, or 0 if there's nothing to go on.
 */
export function refreshRateFrom(frameMs) {
  const valid = frameMs.filter((ms) => ms > 0 && Number.isFinite(ms)).sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  const middle = valid.length >> 1;
  const median = valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
  return 1000 / median;
}

/**
 * How many pixels to render per CSS pixel.
 *
 * @param {number} devicePixelRatio The screen's own (2 on a Retina Mac).
 * @param {number} refreshRate Frames per second (see refreshRateFrom).
 * @param {DisplaySettings} settings
 */
export function pixelRatioFor(devicePixelRatio, refreshRate, settings) {
  const cap =
    refreshRate > settings.highRefreshAbove
      ? Math.min(settings.maxPixelRatio, settings.highRefreshPixelRatio)
      : settings.maxPixelRatio;
  return Math.max(0.5, Math.min(devicePixelRatio || 1, cap));
}
