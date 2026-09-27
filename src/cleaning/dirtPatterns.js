// @ts-check
import { DIRT_TYPE } from './DirtMask.js';
import { createRandom, createValueNoise, fractalNoise, smoothstep } from './noise.js';

/**
 * Procedural starting dirt. Each pattern works in METERS (not texels), so it looks the same
 * whatever texture resolution we pick, and gives two things at every point:
 * - dirtAt(x, y): how dirty it is (0..1)
 * - typeAt(x, y): what kind of dirt it is (a DIRT_TYPE, e.g. grime or moss)
 *
 * @typedef {{ dirtAt: (x: number, y: number) => number, typeAt: (x: number, y: number) => number }} DirtPattern
 */

/** The four dirt levels from the design. Cleaning time scales with the amount of dirt. */
export const DIRT_LEVELS = { light: 0.25, dirty: 0.5, heavy: 0.75, extreme: 1 };

/**
 * A neglected concrete driveway:
 * - light: a dusty film everywhere, with some darker blotches ("dirty")
 * - dirty: two tire tracks running the length of the driveway
 * - heavy: grime built up along the edges, worst in the corners
 * - extreme: a few oil stains near the garage, where the car parks
 * - moss (tough): in the expansion joint across the middle, and along the lawn edges in the
 *   shadier half near the garage
 *
 * @param {{ width: number, length: number, seed: number }} options
 *   width across, length from the street (y = 0) to the garage (y = length), in meters.
 * @returns {DirtPattern}
 */
export function drivewayDirt({ width, length, seed }) {
  const random = createRandom(seed);
  const noise = createValueNoise(seed);
  const center = width / 2;
  const { light, dirty, heavy, extreme } = DIRT_LEVELS;

  const tracks = [center - 0.8, center + 0.8]; // a car's wheels are ~1.6 m apart
  const stains = Array.from({ length: 3 }, () => ({
    x: center + (random() - 0.5) * 1.8,
    y: length - 1.2 - random() * 2.5,
    radius: 0.3 + random() * 0.3,
  }));

  const jointY = length / 2; // a control joint (a cut line in the concrete) across the middle

  /** @param {number} x @param {number} y */
  const sample = (x, y) => {
    const blotches = fractalNoise(noise, x * 0.7, y * 0.7, 4); // ~1.5 m blobs with detail
    // Fine speckle. Rotating the coordinates hides the noise's underlying square grid.
    const grain = fractalNoise(noise, (x * 0.8 - y * 0.6) * 7 + 100, (x * 0.6 + y * 0.8) * 7, 2);

    // Everywhere: a light film, varying a little, with soft darker blotches here and there.
    let dirt = light + (blotches - 0.5) * 0.16 + (grain - 0.5) * 0.1;
    dirt = Math.max(dirt, smoothstep(0.56, 0.76, blotches) * (dirty + grain * 0.08));

    // Tire tracks: wander side to side a little and fade in and out along their length.
    tracks.forEach((trackX, i) => {
      const wander = (noise(i * 40, y * 0.25) - 0.5) * 0.25;
      const onTrack = 1 - smoothstep(0.08, 0.2, Math.abs(x - trackX - wander));
      const strength = smoothstep(0.3, 0.6, fractalNoise(noise, i * 20 + x * 0.5, y * 0.6, 3));
      dirt = Math.max(dirt, onTrack * (light + 0.1 + strength * (dirty + 0.12 - light - 0.1)));
    });

    // Edge grime: an uneven band along each edge, heaviest in the corners where dirt pools.
    const band = 0.2 + 0.35 * noise(x * 1.5 + 200, y * 1.5 + 200);
    const fromEdgeX = Math.min(x, width - x);
    const fromEdgeY = Math.min(y, length - y);
    const edge = 1 - smoothstep(0, band, Math.min(fromEdgeX, fromEdgeY));
    const corner =
      (1 - smoothstep(0, band * 1.8, fromEdgeX)) * (1 - smoothstep(0, band * 1.8, fromEdgeY));
    dirt = Math.max(dirt, edge * (dirty + 0.1 + grain * 0.1), corner * (heavy + grain * 0.15));

    // Oil stains: a black core with a brownish halo where the oil has spread.
    for (const stain of stains) {
      const wobble = (noise(x * 4 + 50, y * 4 + 50) - 0.5) * stain.radius * 0.6;
      const distance = Math.hypot(x - stain.x, y - stain.y) + wobble;
      const core = 1 - smoothstep(stain.radius * 0.45, stain.radius * 0.8, distance);
      const halo = 1 - smoothstep(stain.radius * 0.7, stain.radius * 1.5, distance);
      dirt = Math.max(dirt, core * extreme, halo * (heavy - 0.05));
    }

    // The joint collects grime along its whole length.
    const inJoint = 1 - smoothstep(0.012, 0.03, Math.abs(y - jointY));
    dirt = Math.max(dirt, inJoint * (dirty + 0.15));

    // Moss: clumps growing out of the joint, and along the lawn edges in the shadier
    // garage-end half. Clumps have ragged edges (fine noise) so they read as growth.
    const ragged = 0.8 + 0.4 * noise(x * 9 + 500, y * 9 + 500);
    const nearJoint = 1 - smoothstep(0.03, 0.14 * ragged, Math.abs(y - jointY));
    const jointMoss = nearJoint * smoothstep(0.4, 0.55, noise(x * 2.5 + 300, 7));
    const edgeBand = 1 - smoothstep(0.12, 0.5 * ragged, fromEdgeX);
    const shade = smoothstep(length * 0.3, length * 0.75, y);
    const patches = smoothstep(0.4, 0.55, fractalNoise(noise, x * 2 + 400, y * 2 + 400, 3));
    const moss = Math.max(jointMoss, edgeBand * shade * patches);
    const mossDirt = moss * (0.68 + grain * 0.22);
    const isMoss = mossDirt > 0.3 && mossDirt >= dirt;
    if (isMoss) dirt = mossDirt;

    return {
      dirt: Math.min(1, Math.max(0, dirt)),
      type: isMoss ? DIRT_TYPE.moss : DIRT_TYPE.grime,
    };
  };

  return memoizedPattern(sample);
}

/** Board layout shared by the fence's wood texture and its dirt: 14 cm boards, 1.2 cm gaps. */
export const FENCE_BOARD = { width: 0.14, gap: 0.012 };

/**
 * A weathered wooden fence, seen from the yard:
 * - light: grey weathering everywhere, a little different on each board
 * - dirty: dark water stains running down from the top of some boards; grime in the gaps
 * - heavy: mud splashed up along the bottom
 * - moss (tough): patches along the damp bottom edge
 *
 * @param {{ height: number, seed: number }} options
 *   x runs along the fence, y up from the ground (0..height), in meters.
 * @returns {DirtPattern}
 */
export function fenceDirt({ height, seed }) {
  const noise = createValueNoise(seed);
  const { dirty, heavy } = DIRT_LEVELS;

  /** @param {number} x @param {number} y */
  const sample = (x, y) => {
    const board = Math.floor(x / FENCE_BOARD.width);
    const inGap = x - board * FENCE_BOARD.width < FENCE_BOARD.gap;
    const boardShade = noise(board * 1.37 + 0.5, 3.1); // each board weathered a bit differently
    const grain = fractalNoise(noise, x * 3 + 20, y * 14, 2); // wood grain runs up the boards

    // Grey weathering everywhere.
    let dirt = 0.32 + (boardShade - 0.5) * 0.12 + (grain - 0.5) * 0.08;
    // Some boards have dark water stains running down from the top.
    if (boardShade > 0.6) {
      const stain = smoothstep(height * 0.15, height * 0.9, y) * smoothstep(0.6, 0.75, boardShade);
      dirt = Math.max(dirt, stain * (dirty + 0.05 + grain * 0.1));
    }
    // Grime collects in the gaps between boards.
    if (inGap) dirt = Math.max(dirt, dirty + 0.1);
    // Mud splashed up from the ground: a band along the bottom, uneven in height.
    const splashTop = 0.2 + 0.25 * noise(x * 0.8, 11);
    const splashes = smoothstep(0.35, 0.6, noise(x * 6 + 50, y * 6 + 50));
    const splash =
      (1 - smoothstep(0, splashTop, y)) * Math.max(splashes, 1 - smoothstep(0, 0.1, y));
    dirt = Math.max(dirt, splash * (heavy + grain * 0.1));
    // Moss along the damp bottom edge, in patches with ragged tops.
    const ragged = 0.7 + 0.6 * noise(x * 7 + 300, 5);
    const mossBand = 1 - smoothstep(0.04, 0.2 * ragged, y);
    const mossPatches = smoothstep(0.42, 0.58, fractalNoise(noise, x * 1.2 + 90, 3, 3));
    const mossDirt = mossBand * mossPatches * (0.7 + grain * 0.2);
    const isMoss = mossDirt > 0.3 && mossDirt >= dirt;
    if (isMoss) dirt = mossDirt;

    return {
      dirt: Math.min(1, Math.max(0, dirt)),
      type: isMoss ? DIRT_TYPE.moss : DIRT_TYPE.grime,
    };
  };
  return memoizedPattern(sample);
}

/**
 * Wraps a sampler returning { dirt, type } as a DirtPattern. fill() asks for dirt, then type,
 * at each point in turn, so it remembers the last point to avoid computing everything twice.
 *
 * @param {(x: number, y: number) => { dirt: number, type: number }} sample
 * @returns {DirtPattern}
 */
function memoizedPattern(sample) {
  let lastX = NaN;
  let lastY = NaN;
  let last = { dirt: 0, type: DIRT_TYPE.grime };
  /** @param {number} x @param {number} y */
  const at = (x, y) => {
    if (x !== lastX || y !== lastY) {
      last = sample(x, y);
      lastX = x;
      lastY = y;
    }
    return last;
  };
  return { dirtAt: (x, y) => at(x, y).dirt, typeAt: (x, y) => at(x, y).type };
}

/**
 * Patio layout shared by the paver texture and its dirt: square pavers in a running bond
 * (every other row shifted by half a paver), with joints between them. Meters.
 */
export const PATIO_PAVER = { size: 0.45, joint: 0.03 };

/**
 * Where a point falls in the paver layout.
 *
 * @param {number} x Meters across the patio.
 * @param {number} y Meters along the patio.
 * @returns {{ inJoint: boolean, row: number, column: number }}
 */
export function paverAt(x, y) {
  const module = PATIO_PAVER.size + PATIO_PAVER.joint;
  const row = Math.floor(y / module);
  const shifted = x + (row % 2 === 0 ? 0 : module / 2);
  const column = Math.floor(shifted / module);
  const inJoint =
    shifted - column * module < PATIO_PAVER.joint || y - row * module < PATIO_PAVER.joint;
  return { inJoint, row, column };
}

/**
 * A paved patio behind the house:
 * - light: a film on every paver, a little different on each one
 * - dirty: brown leaf stains here and there; grime packed into every joint
 * - extreme: a greasy barbecue spot
 * - moss (tough): growing along the joints, most of all in the shade by the house (y = 0)
 *
 * @param {{ width: number, length: number, seed: number }} options
 *   x across (0..width), y from the house (0) out into the yard (length), in meters.
 * @returns {DirtPattern}
 */
export function patioDirt({ width, length, seed }) {
  const random = createRandom(seed);
  const noise = createValueNoise(seed);
  const { light, dirty, extreme } = DIRT_LEVELS;
  const leaves = Array.from({ length: 9 }, () => ({
    x: random() * width,
    y: random() * length,
    radius: 0.08 + random() * 0.1,
  }));
  const grease = { x: width * (0.65 + random() * 0.2), y: length * (0.55 + random() * 0.3) };

  /** @param {number} x @param {number} y */
  const sample = (x, y) => {
    const { inJoint, row, column } = paverAt(x, y);
    const paverShade = noise(column * 1.7 + 0.3, row * 1.3 + 0.7); // each paver a bit different
    const grain = noise(x * 9 + 40, y * 9 + 40);

    // A film on every paver.
    let dirt = light + (paverShade - 0.5) * 0.12 + (grain - 0.5) * 0.08;
    // Leaf stains: small soft brown blotches.
    for (const leaf of leaves) {
      const d = Math.hypot(x - leaf.x, y - leaf.y);
      dirt = Math.max(dirt, (1 - smoothstep(leaf.radius * 0.4, leaf.radius, d)) * (dirty + 0.1));
    }
    // A greasy barbecue spot.
    const greaseDistance = Math.hypot(x - grease.x, y - grease.y) + (grain - 0.5) * 0.08;
    dirt = Math.max(dirt, (1 - smoothstep(0.18, 0.34, greaseDistance)) * extreme);

    // Joints: packed grime everywhere, and moss in patches, most of all near the house.
    let isMoss = false;
    if (inJoint) {
      dirt = Math.max(dirt, dirty + 0.1 + grain * 0.1);
      const shade = 1 - smoothstep(0, length * 0.8, y);
      const patches = smoothstep(0.35, 0.55, fractalNoise(noise, x * 1.3 + 70, y * 1.3 + 70, 3));
      const mossDirt = (0.35 + 0.65 * shade) * patches * (0.7 + grain * 0.25);
      isMoss = mossDirt > 0.3 && mossDirt >= dirt;
      if (isMoss) dirt = mossDirt;
    }

    return {
      dirt: Math.min(1, Math.max(0, dirt)),
      type: isMoss ? DIRT_TYPE.moss : DIRT_TYPE.grime,
    };
  };
  return memoizedPattern(sample);
}
