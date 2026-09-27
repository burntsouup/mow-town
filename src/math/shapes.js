// @ts-check

/**
 * Simple flat shapes on the ground, used to lay out the level (flower beds, mulch rings)
 * and to decide where the lawn is. Coordinates are meters on the ground plane (x, z).
 *
 * @typedef {{ kind: 'rect', minX: number, maxX: number, minZ: number, maxZ: number }} RectShape
 * @typedef {{ kind: 'ellipse', x: number, z: number, radiusX: number, radiusZ: number }} EllipseShape
 * @typedef {RectShape | EllipseShape} Shape A circle is an ellipse with equal radii.
 */

/**
 * @param {Shape} shape
 * @param {number} x
 * @param {number} z
 */
export function insideShape(shape, x, z) {
  if (shape.kind === 'rect') {
    return x >= shape.minX && x <= shape.maxX && z >= shape.minZ && z <= shape.maxZ;
  }
  const dx = (x - shape.x) / shape.radiusX;
  const dz = (z - shape.z) / shape.radiusZ;
  return dx * dx + dz * dz <= 1;
}

/**
 * The same shape, grown outward by `margin` meters (shrunk if negative).
 *
 * @param {Shape} shape
 * @param {number} margin
 * @returns {Shape}
 */
export function growShape(shape, margin) {
  if (shape.kind === 'rect') {
    return {
      ...shape,
      minX: shape.minX - margin,
      maxX: shape.maxX + margin,
      minZ: shape.minZ - margin,
      maxZ: shape.maxZ + margin,
    };
  }
  return { ...shape, radiusX: shape.radiusX + margin, radiusZ: shape.radiusZ + margin };
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} radius
 * @returns {EllipseShape}
 */
export function circle(x, z, radius) {
  return { kind: 'ellipse', x, z, radiusX: radius, radiusZ: radius };
}
