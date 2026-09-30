// @ts-check

/**
 * Pure geometry for Tuft's clothes. Clothes are fitted to the body: a shirt is the band of
 * the body's surface between two heights, pushed out a little; a hat's crown is the top of
 * the head above a tilted line. Where clothes cover the body, the fur underneath is hidden
 * (see `furCover` and FurMaterialPlugin), so it doesn't poke through.
 *
 * @typedef {import('./tuftMath.js').Vec3} Vec3
 * @typedef {(direction: Vec3) => { point: Vec3, normal: Vec3 }} SurfaceAt A point on the
 *   body in a direction from its middle, and which way the surface faces there (bodyPoint).
 * @typedef {{ height: number, tilt: number }} Level Where a garment ends: the points where
 *   y - tilt * z = height (tilt > 0 makes it higher at the front, like a cap pushed back).
 * @typedef {import('./wardrobe.js').Outfit} Outfit
 */

/**
 * Where each garment sits on the body, in the body's own space (y up from its bottom, which
 * is about 0.06; the top is about 0.99; the smile is at 0.56). offset: meters out from the
 * skin. The fur is 0.08 long: a shirt nearly as far out keeps Tuft's plump outline (any
 * closer and the fur above it overhangs, like a muffin in its case); hats hug the head.
 */
export const CLOTHES = {
  // The neckline dips at the front (below the smile) and rises round the back, so the
  // shirt wraps over Tuft's shoulders instead of stopping at its widest, like a bowl.
  shirt: { from: { height: 0.2, tilt: 0 }, to: { height: 0.575, tilt: -0.31 }, offset: 0.065 },
  shorts: { to: { height: 0.22, tilt: 0 }, offset: 0.055 },
  /** @type {Record<string, { line: Level, offset: number }>} */
  hats: {
    cap: { line: { height: 0.86, tilt: 0.25 }, offset: 0.035 },
    beanie: { line: { height: 0.84, tilt: 0.25 }, offset: 0.045 },
    bucket: { line: { height: 0.85, tilt: 0.2 }, offset: 0.04 },
    straw: { line: { height: 0.86, tilt: 0.2 }, offset: 0.04 },
  },
};

/** Below everything: where shorts start. */
const BOTTOM = { height: -1, tilt: 0 };

/**
 * Where the fur is hidden under clothes: the band between two levels (the shirt and
 * shorts), and everything above a hat's line.
 *
 * @param {Outfit} outfit
 * @returns {{ band: { from: Level, to: Level } | null, cap: Level | null }}
 */
export function furCover(outfit) {
  const shirt = outfit.shirt.style !== 'none';
  const shorts = outfit.shorts.style !== 'none';
  const band =
    shirt || shorts
      ? {
          from: shorts ? BOTTOM : CLOTHES.shirt.from,
          to: shirt ? CLOTHES.shirt.to : CLOTHES.shorts.to,
        }
      : null;
  const hat = CLOTHES.hats[outfit.hat.style];
  return { band, cap: hat ? hat.line : null };
}

/**
 * A direction from the body's middle: `angle` around it (0 = front, +z; π/2 = +x) and
 * `elevation` up from the middle (-π/2 bottom .. π/2 top).
 *
 * @param {number} angle
 * @param {number} elevation
 * @returns {Vec3}
 */
export function directionAt(angle, elevation) {
  const c = Math.cos(elevation);
  return { x: Math.sin(angle) * c, y: Math.sin(elevation), z: Math.cos(angle) * c };
}

const POLE = Math.PI / 2 - 1e-4;

/**
 * The elevation, at an angle around the body, where the surface crosses a level (found by
 * halving the range until it's close enough).
 *
 * @param {SurfaceAt} surfaceAt
 * @param {number} angle
 * @param {Level} level
 */
export function elevationAtLevel(surfaceAt, angle, { height, tilt }) {
  let low = -POLE;
  let high = POLE;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    const { point } = surfaceAt(directionAt(angle, middle));
    if (point.y - tilt * point.z < height) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * A band of the body's surface, pushed out along its normals: from one level up to another
 * (null means all the way to the bottom, or the top). Columns go round the body, rows go up;
 * the first and last columns meet at the back (repeated, so the texture wraps cleanly).
 *
 * @param {SurfaceAt} surfaceAt
 * @param {{ from: Level | null, to: Level | null, offset: number, rows: number,
 *   columns: number }} options
 * @returns {{ positions: number[], normals: number[], uvs: number[], indices: number[],
 *   bottom: Vec3[], top: Vec3[] }} bottom/top: the edge rings (closed loops), for hems.
 */
export function bodyBand(surfaceAt, { from, to, offset, rows, columns }) {
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {number[]} */
  const uvs = [];
  /** @type {Vec3[]} */
  const bottom = [];
  /** @type {Vec3[]} */
  const top = [];
  // Round the back first (angle π), so the seam is behind.
  for (let c = 0; c <= columns; c++) {
    const angle = Math.PI + (2 * Math.PI * c) / columns;
    const start = from ? elevationAtLevel(surfaceAt, angle, from) : -POLE;
    const end = to ? elevationAtLevel(surfaceAt, angle, to) : POLE;
    for (let r = 0; r <= rows; r++) {
      const { point, normal } = surfaceAt(directionAt(angle, start + ((end - start) * r) / rows));
      const p = {
        x: point.x + normal.x * offset,
        y: point.y + normal.y * offset,
        z: point.z + normal.z * offset,
      };
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(c / columns, r / rows);
      if (r === 0) bottom.push(p);
      if (r === rows) top.push(p);
    }
  }
  /** @type {number[]} */
  const indices = [];
  const at = (/** @type {number} */ c, /** @type {number} */ r) => c * (rows + 1) + r;
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      // Babylon's front faces wind clockwise, seen from outside.
      indices.push(at(c, r), at(c, r + 1), at(c + 1, r));
      indices.push(at(c + 1, r), at(c, r + 1), at(c + 1, r + 1));
    }
  }
  return { positions, normals, uvs, indices, bottom, top };
}

/**
 * The outline of a star, starting at the top point and going round.
 *
 * @param {number} points How many points it has.
 * @param {number} outer Radius to the tips.
 * @param {number} inner Radius to the notches between them.
 * @returns {{ x: number, y: number }[]} 2 × points corners.
 */
export function starOutline(points, outer, inner) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = Math.PI / 2 + (i * Math.PI) / points;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}
