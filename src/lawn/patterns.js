// @ts-check
import { stripeNeatness } from './neatness.js';

/**
 * Lawn art: the patterns clients ask for, how well a lawn matches one, and how far along a
 * job for one is. Pure: it reads a GrassGrid's arrays, no Babylon.
 *
 * Directions are compared with the doubled-angle trick from neatness.js: a mowing direction
 * at angle a (from +x toward +z) becomes (cos 2a, sin 2a), so a stripe mowed one way and
 * the next one mowed back count as the same, and two passes at right angles come out
 * opposite each other.
 *
 * @typedef {'stripes' | 'checkerboard' | 'diagonal'} PatternId
 * @typedef {{ name: string, tipLabel: string, praise: string, passes: 1 | 2,
 *   acrossHint?: string }} Pattern name: for the objective; tipLabel: on the receipt;
 *   praise: the card's title when the tip is full; passes: how many times the lawn is mowed;
 *   acrossHint: the objective's hint once the first of two passes is done.
 * @typedef {{ columns: number, rows: number, texelsPerMeter: number, mask: Uint8Array,
 *   mowX: Float32Array, mowZ: Float32Array, crossX: Float32Array, crossZ: Float32Array }}
 *   Grid A GrassGrid (only these fields are used).
 */

/** @type {Record<PatternId, Pattern>} */
export const PATTERNS = {
  stripes: { name: 'Stripes', tipLabel: 'Neat stripes', praise: 'Nice stripes!', passes: 1 },
  checkerboard: {
    name: 'Checkerboard',
    tipLabel: 'Checkerboard',
    praise: 'Nice checkerboard!',
    passes: 2,
    acrossHint: 'Now mow across your stripes',
  },
  diagonal: {
    name: 'Diagonal stripes',
    tipLabel: 'Diagonal stripes',
    praise: 'Nice diagonals!',
    passes: 1,
  },
};

/**
 * How well a lawn matches a pattern, from 0 (not at all) to 1 (perfectly), judged in square
 * patches like stripeNeatness, so a pattern that bends round a tree only loses a little:
 * - stripes: parallel rows, any direction (stripeNeatness)
 * - diagonal: parallel rows at 45° to the lawn's sides (either diagonal)
 * - checkerboard: neat rows, then neat rows at right angles across them (squares or
 *   diamonds)
 *
 * @param {Grid} grid
 * @param {PatternId} pattern
 * @param {number} patchSize Meters along each side of a patch.
 * @returns {number} 0..1, or 0 if nothing has been mowed.
 */
export function patternScore(grid, pattern, patchSize) {
  if (pattern === 'stripes') return stripeNeatness(grid, patchSize);
  const patches = sumPatches(grid, patchSize);
  if (patches.mowed === 0) return 0;
  let total = 0;
  for (let p = 0; p < patches.count; p++) {
    const length = Math.hypot(patches.cos[p], patches.sin[p]);
    if (length === 0) continue;
    if (pattern === 'diagonal') {
      // Of the rows' average direction, only the diagonal part counts, squared so being
      // a little off costs little and being way off costs a lot (30° off keeps 75%).
      total += (patches.sin[p] * patches.sin[p]) / length;
    } else {
      // Both passes neat, and at right angles: their doubled angles point opposite ways.
      const across = Math.hypot(patches.crossCos[p], patches.crossSin[p]);
      const opposed = -(
        patches.cos[p] * patches.crossCos[p] +
        patches.sin[p] * patches.crossSin[p]
      );
      if (across > 0 && opposed > 0) total += opposed / Math.sqrt(length * across);
    }
  }
  return Math.min(1, total / patches.mowed);
}

/**
 * The job's progress, in the same units as the lawn's own (so the job's usual "done at"
 * threshold still applies): for a two-pass pattern, the first pass is the first half and
 * mowing across it the second.
 *
 * @param {PatternId} pattern
 * @param {{ mowed: number, crossed: number }} lawn Fractions of the lawn mowed, and mowed
 *   across (GrassGrid.progress and crossProgress).
 * @param {{ completeAt: number, crossDoneAt: number }} settings completeAt: the mowed
 *   fraction that counts as done; crossDoneAt: the same for mowing across.
 */
export function patternProgress(pattern, { mowed, crossed }, { completeAt, crossDoneAt }) {
  if (PATTERNS[pattern].passes === 1) return mowed;
  const first = Math.min(1, mowed / completeAt);
  const second = Math.min(1, crossed / crossDoneAt);
  return completeAt * (0.5 * first + 0.5 * second);
}

/**
 * Which way the stripes on a lawn mostly run, for the aerial view to look along them: the
 * last pass, and the one it went across (if much of the lawn was mowed across). Angles are
 * of the axis (a stripe and its opposite are the same), in radians from +x toward +z.
 *
 * @param {Grid} grid
 * @param {number} [least] How lined-up the texels must be (0..1) to count as running a way.
 * @returns {{ latest: number | null, earlier: number | null }}
 */
export function stripeAxes(grid, least = 0.2) {
  let cos = 0;
  let sin = 0;
  let crossCos = 0;
  let crossSin = 0;
  let mowed = 0;
  for (let i = 0; i < grid.mask.length; i++) {
    const x = grid.mowX[i];
    const z = grid.mowZ[i];
    if (!grid.mask[i] || (x === 0 && z === 0)) continue;
    mowed++;
    cos += x * x - z * z;
    sin += 2 * x * z;
    const cx = grid.crossX[i];
    const cz = grid.crossZ[i];
    crossCos += cx * cx - cz * cz;
    crossSin += 2 * cx * cz;
  }
  /** @param {number} c @param {number} s */
  const axis = (c, s) =>
    mowed > 0 && Math.hypot(c, s) / mowed >= least ? Math.atan2(s, c) / 2 : null;
  return { latest: axis(cos, sin), earlier: axis(crossCos, crossSin) };
}

/**
 * Sums the doubled-angle directions (of the last pass, and the one it crossed) per patch.
 *
 * @param {Grid} grid
 * @param {number} patchSize Meters.
 */
function sumPatches(grid, patchSize) {
  const texels = Math.max(1, Math.round(patchSize * grid.texelsPerMeter));
  const patchColumns = Math.ceil(grid.columns / texels);
  const count = patchColumns * Math.ceil(grid.rows / texels);
  const sums = {
    count,
    mowed: 0,
    cos: new Float64Array(count),
    sin: new Float64Array(count),
    crossCos: new Float64Array(count),
    crossSin: new Float64Array(count),
  };
  for (let row = 0; row < grid.rows; row++) {
    const patchRow = Math.floor(row / texels) * patchColumns;
    for (let column = 0; column < grid.columns; column++) {
      const i = row * grid.columns + column;
      const x = grid.mowX[i];
      const z = grid.mowZ[i];
      if (!grid.mask[i] || (x === 0 && z === 0)) continue;
      const p = patchRow + Math.floor(column / texels);
      sums.cos[p] += x * x - z * z;
      sums.sin[p] += 2 * x * z;
      const cx = grid.crossX[i];
      const cz = grid.crossZ[i];
      sums.crossCos[p] += cx * cx - cz * cz;
      sums.crossSin[p] += 2 * cx * cz;
      sums.mowed++;
    }
  }
  return sums;
}
