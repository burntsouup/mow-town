// @ts-check
import { config } from '../config.js';
import { createValueNoise, fractalNoise, smoothstep } from '../math/noise.js';
import { circle, growShape, insideShape } from '../math/shapes.js';
import { SIDEWALK } from './frontYardLayout.js';

// The Parkers' place, next door (to the right of our driveway), as plain data so tests can
// use the real lawn without Babylon. Same units and axes as frontYardLayout.js.

export const NEXT_HOUSE = { left: 14, right: 30, front: 1.5, back: 11.5, wallHeight: 3.2 };
export const NEXT_DRIVEWAY = { width: 4.4, centerX: 27.8 };
/** A low hedge along the property line, between our driveway and their lawn. */
export const HEDGE = { x: 8.6, front: SIDEWALK.back + 0.6, back: 7.4 };
/** A garden shed at the back of the side yard, between the two houses. */
export const SHED = { left: 9, right: 13.6, front: 7.5, back: 9.9, height: 2.3 };
/**
 * Their lawn is an L: a wide front yard, plus a side yard that runs back between the houses.
 * `front` and `side` are the two rectangles; together they fit in `bounds`.
 */
export const NEXT_LAWN = {
  front: {
    left: 9.1,
    right: NEXT_DRIVEWAY.centerX - NEXT_DRIVEWAY.width / 2,
    front: SIDEWALK.back,
    back: -0.3,
  },
  side: { left: 9.1, right: 13.5, front: -0.3, back: SHED.front - 0.2 },
};
/** Things on their lawn, as shapes in world meters (see math/shapes.js). */
export const NEXT_SPOTS = {
  tree: circle(11, -7, 0.55), // a ring of mulch around the trunk
  islandBed: {
    kind: /** @type {const} */ ('ellipse'),
    x: 18.6,
    z: -5.4,
    radiusX: 2.3,
    radiusZ: 1.1,
  },
  birdbath: circle(22.9, -2.6, 0.24),
  gnome: circle(14.2, -9.3, 0.11),
  mailbox: circle(NEXT_DRIVEWAY.centerX - NEXT_DRIVEWAY.width / 2 - 0.4, SIDEWALK.back + 0.4, 0.08),
};

/**
 * Where their lawn is and how long the grass starts out; same shape of data as frontLawn().
 * The grass is a little shaggier than ours: nobody has mowed it in a while.
 */
export function nextDoorLawn() {
  const { front, side } = NEXT_LAWN;
  const left = front.left;
  const right = front.right;
  const bottom = front.front;
  const top = side.back;
  const noise = createValueNoise(33);
  const thickNoise = createValueNoise(9);
  const [shortest, tallest] = config.grass.uncutHeight;
  const trimAround = [
    NEXT_SPOTS.tree,
    growShape(NEXT_SPOTS.islandBed, 0.04),
    growShape(NEXT_SPOTS.birdbath, 0.02),
    growShape(NEXT_SPOTS.gnome, 0.02),
    NEXT_SPOTS.mailbox,
  ];
  /** @param {{ left: number, right: number, front: number, back: number }} r */
  const inRect = (r, /** @type {number} */ x, /** @type {number} */ z) =>
    x >= r.left && x <= r.right && z >= r.front && z <= r.back;
  const thickness = (/** @type {number} */ x, /** @type {number} */ z) =>
    smoothstep(0.6, 0.76, fractalNoise(thickNoise, x * 0.3, z * 0.3, 2));
  /** @param {number} x @param {number} z */
  const heightAt = (x, z) => {
    const worldX = left + x;
    const worldZ = bottom + z;
    if (!inRect(front, worldX, worldZ) && !inRect(side, worldX, worldZ)) return 0;
    if (trimAround.some((shape) => insideShape(shape, worldX, worldZ))) return 0;
    const height = shortest + (tallest - shortest) * fractalNoise(noise, x * 0.6, z * 0.6, 3);
    return height + (tallest - height) * thickness(x, z);
  };
  const width = right - left;
  const depth = top - bottom;
  return {
    name: "The Parkers' lawn",
    center: [(left + right) / 2, (bottom + top) / 2],
    width,
    depth,
    heightAt,
    densityAt: (/** @type {number} */ x, /** @type {number} */ z) => 1 + 1.5 * thickness(x, z),
    /** @param {number} x @param {number} z */
    edgeAt: (x, z) =>
      x < 0 || // the hedge
      z > depth || // the shed at the back of the side yard
      trimAround.some((shape) => insideShape(shape, left + x, bottom + z)),
    revealScale: 1.35, // a bigger lawn: the aerial view flies higher and further back
  };
}
