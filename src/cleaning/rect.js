// @ts-check

/**
 * Rectangles of texels (inclusive bounds), used to track which part of a grid changed so we
 * only process and upload that part. `null` means "nothing".
 *
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Rect
 */

/**
 * The smallest rectangle containing both (either may be null).
 *
 * @param {Rect | null} a
 * @param {Rect | null} b
 * @returns {Rect | null}
 */
export function unionRect(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * The whole grid as a rectangle.
 *
 * @param {number} width
 * @param {number} height
 * @returns {Rect}
 */
export function fullRect(width, height) {
  return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
}
