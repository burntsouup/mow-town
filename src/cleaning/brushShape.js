// @ts-check

/**
 * The shape of a brush stamp on a grid: an ellipse (a circle is just an ellipse with equal
 * radii). Shared by the dirt and wetness grids so both see exactly the same spray footprint.
 * All sizes are in texels; `angle` rotates the ellipse's X radius away from the grid's +x.
 */

/**
 * @typedef {{ radiusX: number, radiusY: number, angle: number }} Ellipse
 * @typedef {{ radius: number } | Ellipse} BrushShape A circle ({ radius }) or an ellipse.
 */

/**
 * @param {BrushShape} shape
 * @returns {Ellipse}
 */
export function toEllipse(shape) {
  if ('radiusX' in shape) return shape;
  return { radiusX: shape.radius, radiusY: shape.radius, angle: 0 };
}

/**
 * The texels (inclusive, clipped to the grid) in the box that just contains the ellipse, or
 * null if it lies entirely off the grid.
 *
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @param {number} centerX
 * @param {number} centerY
 * @param {Ellipse} ellipse
 * @returns {import('./rect.js').Rect | null}
 */
export function ellipseBounds(gridWidth, gridHeight, centerX, centerY, ellipse) {
  const { radiusX, radiusY, angle } = ellipse;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = Math.hypot(radiusX * cos, radiusY * sin);
  const halfHeight = Math.hypot(radiusX * sin, radiusY * cos);
  const minX = Math.max(0, Math.floor(centerX - halfWidth));
  const maxX = Math.min(gridWidth - 1, Math.ceil(centerX + halfWidth));
  const minY = Math.max(0, Math.floor(centerY - halfHeight));
  const maxY = Math.min(gridHeight - 1, Math.ceil(centerY + halfHeight));
  return minX > maxX || minY > maxY ? null : { minX, minY, maxX, maxY };
}

/**
 * Calls `visit` for every texel whose center is inside the ellipse, with its index and its
 * distance from the center (0 at the middle, approaching 1 at the edge).
 *
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @param {number} centerX
 * @param {number} centerY
 * @param {Ellipse} ellipse
 * @param {(index: number, distance: number) => void} visit
 * @returns {import('./rect.js').Rect | null} The box it looked in (null if off the grid).
 */
export function forEachTexelInEllipse(gridWidth, gridHeight, centerX, centerY, ellipse, visit) {
  const bounds = ellipseBounds(gridWidth, gridHeight, centerX, centerY, ellipse);
  if (!bounds) return null;
  const { radiusX, radiusY, angle } = ellipse;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const { minX, maxX, minY, maxY } = bounds;

  for (let y = minY; y <= maxY; y++) {
    const dy = y + 0.5 - centerY;
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - centerX;
      // Rotate into the ellipse's own frame, then scale each axis by its radius.
      const along = (dx * cos + dy * sin) / radiusX;
      const across = (-dx * sin + dy * cos) / radiusY;
      const distanceSquared = along * along + across * across;
      if (distanceSquared < 1) visit(y * gridWidth + x, Math.sqrt(distanceSquared));
    }
  }
  return bounds;
}

/**
 * How far the ellipse reaches from its center in a given direction. Used to space stamps
 * along a stroke: moving across the thin side of an ellipse needs stamps closer together.
 *
 * @param {Ellipse} ellipse
 * @param {number} directionX
 * @param {number} directionY
 */
export function ellipseReach(ellipse, directionX, directionY) {
  const length = Math.hypot(directionX, directionY);
  if (length === 0) return Math.min(ellipse.radiusX, ellipse.radiusY);
  const cos = Math.cos(ellipse.angle);
  const sin = Math.sin(ellipse.angle);
  const along = (directionX * cos + directionY * sin) / length;
  const across = (-directionX * sin + directionY * cos) / length;
  return 1 / Math.hypot(along / ellipse.radiusX, across / ellipse.radiusY);
}
