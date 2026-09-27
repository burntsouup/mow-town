// @ts-check
import { config } from '../config.js';
import { createValueNoise, fractalNoise, smoothstep } from '../math/noise.js';
import { circle, growShape, insideShape } from '../math/shapes.js';

// The front yard's layout as plain data, so tests (like the pacing check) can use the real
// lawn without Babylon. Units are meters. +x = right (toward the garage), +z = away from the
// street, y = up. The street runs along x at the front; the house faces the street.

export const HOUSE = { left: -8, right: 8, front: 1.5, back: 11.5, wallHeight: 3.2 };
export const SIDEWALK = { front: -12, back: -10.5 };
export const DRIVEWAY = { width: 5, centerX: 4.5 };
export const WALKWAY = { centerX: -2, width: 1.2 };
/** A low wooden fence along the left of the lot, turning in to meet the house. */
export const FENCE = { x: -13.9, back: 1.6, height: 1 };
/** The mowable front lawn: fence to driveway, sidewalk to the flower bed along the house. */
export const LAWN = {
  left: -13.75,
  right: DRIVEWAY.centerX - DRIVEWAY.width / 2,
  front: SIDEWALK.back,
  back: -0.3,
};
/** Things on the lawn, as shapes in world meters (see math/shapes.js). */
export const SPOTS = {
  walkway: {
    kind: /** @type {const} */ ('rect'),
    minX: WALKWAY.centerX - WALKWAY.width / 2,
    maxX: WALKWAY.centerX + WALKWAY.width / 2,
    minZ: SIDEWALK.back,
    maxZ: HOUSE.front,
  },
  flowerBed: {
    kind: /** @type {const} */ ('ellipse'),
    x: -11.2,
    z: -3,
    radiusX: 1.5,
    radiusZ: 0.85,
  },
  tree: circle(-7.6, -6.6, 0.65), // a ring of mulch around the trunk
  ball: circle(-4.6, -8.7, 0.16),
  truck: {
    kind: /** @type {const} */ ('rect'),
    minX: -10.65,
    maxX: -10.15,
    minZ: -9.05,
    maxZ: -8.75,
  },
  mailbox: circle(1.2, SIDEWALK.back + 0.4, 0.08),
};

/**
 * Where the lawn is and how long the grass starts out. `heightAt` takes lawn-local meters
 * (from the lawn's front-left corner) and returns 0 where there's no lawn.
 */
export function frontLawn() {
  const width = LAWN.right - LAWN.left;
  const depth = LAWN.back - LAWN.front;
  const noise = createValueNoise(21);
  const thickNoise = createValueNoise(7);
  const [shortest, tallest] = config.grass.uncutHeight;
  // Grass stops a few centimeters short of beds and toys, so it doesn't poke through them.
  const notLawn = [
    SPOTS.walkway,
    growShape(SPOTS.flowerBed, 0.04),
    SPOTS.tree,
    growShape(SPOTS.ball, 0.02),
    growShape(SPOTS.truck, 0.03),
    SPOTS.mailbox,
  ];
  /** Thick, lush patches: 0 in most of the lawn, up to 1 in a few blobs. */
  const thickness = (/** @type {number} */ x, /** @type {number} */ z) =>
    smoothstep(0.64, 0.78, fractalNoise(thickNoise, x * 0.3, z * 0.3, 2));
  /** @param {number} x @param {number} z */
  const heightAt = (x, z) => {
    const worldX = LAWN.left + x;
    const worldZ = LAWN.front + z;
    if (notLawn.some((shape) => insideShape(shape, worldX, worldZ))) return 0;
    const height = shortest + (tallest - shortest) * fractalNoise(noise, x * 0.6, z * 0.6, 3);
    return height + (tallest - height) * thickness(x, z); // thick grass grows tall
  };
  return {
    center: [(LAWN.left + LAWN.right) / 2, (LAWN.front + LAWN.back) / 2],
    width,
    depth,
    heightAt,
    densityAt: (/** @type {number} */ x, /** @type {number} */ z) => 1 + 1.5 * thickness(x, z),
  };
}
