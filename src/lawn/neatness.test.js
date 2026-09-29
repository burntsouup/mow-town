import { describe, expect, it } from 'vitest';
import { createRandom } from '../math/noise.js';
import { GrassGrid } from './GrassGrid.js';
import { stripeNeatness } from './neatness.js';

const DECK = { width: 0.5, length: 0.4 };
const CUT = 0.3;
const PATCH = 1.5;

/** A 10 × 8 m lawn at 16 texels per meter, full height everywhere. */
function lawn(heightAt = () => 1) {
  const grid = new GrassGrid({ width: 10, depth: 8, texelsPerMeter: 16, targetHeight: CUT });
  grid.fill(heightAt);
  return grid;
}

/**
 * Mows straight back-and-forth rows across the whole lawn.
 *
 * @param {GrassGrid} grid
 * @param {'x' | 'z'} along
 */
function mowRows(grid, along) {
  const [length, across] = along === 'x' ? [10, 8] : [8, 10];
  for (let row = 0, c = DECK.width / 2; c < across + DECK.width / 2; row++, c += 0.45) {
    const forward = row % 2 === 0;
    const [from, to] = forward ? [0, length] : [length, 0];
    // yaw 0 heads +z, π/2 heads +x
    const yaw = along === 'x' ? (forward ? Math.PI / 2 : -Math.PI / 2) : forward ? 0 : Math.PI;
    const pose = (/** @type {number} */ a) => (along === 'x' ? { x: a, z: c } : { x: c, z: a });
    grid.cutStroke({ ...pose(from), yaw }, { ...pose(to), yaw }, DECK, CUT);
  }
}

describe('stripeNeatness', () => {
  it('is 0 before anything is mowed', () => {
    expect(stripeNeatness(lawn(), PATCH)).toBe(0);
  });

  it('scores tidy back-and-forth rows near 1, whichever way they run', () => {
    for (const along of /** @type {const} */ (['x', 'z'])) {
      const grid = lawn();
      mowRows(grid, along);
      expect(grid.progress).toBeGreaterThan(0.99);
      expect(stripeNeatness(grid, PATCH)).toBeGreaterThan(0.98);
    }
  });

  it('scores diagonal rows just as well', () => {
    const grid = lawn();
    const yaw = Math.PI / 4;
    const [dx, dz] = [Math.sin(yaw), Math.cos(yaw)];
    for (let offset = -14, row = 0; offset < 14; offset += 0.45, row++) {
      // Lines along (dx, dz), shifted sideways by `offset`, long enough to cross the lawn.
      const [cx, cz] = [5 + dz * offset, 4 - dx * offset];
      const [ax, az, bx, bz] = [cx - dx * 15, cz - dz * 15, cx + dx * 15, cz + dz * 15];
      const heading = row % 2 === 0 ? yaw : yaw + Math.PI;
      const [from, to] =
        row % 2 === 0
          ? [
              [ax, az],
              [bx, bz],
            ]
          : [
              [bx, bz],
              [ax, az],
            ];
      grid.cutStroke(
        { x: from[0], z: from[1], yaw: heading },
        { x: to[0], z: to[1], yaw: heading },
        DECK,
        CUT,
      );
    }
    expect(stripeNeatness(grid, PATCH)).toBeGreaterThan(0.97);
  });

  it('keeps most of the score for laps around the lawn (they bend only at the corners)', () => {
    const grid = lawn();
    for (let inset = DECK.width / 2; inset < 4; inset += 0.45) {
      const [left, right, front, back] = [inset, 10 - inset, inset, 8 - inset];
      const corners = [
        { x: left, z: front, yaw: 0 },
        { x: left, z: back, yaw: Math.PI / 2 },
        { x: right, z: back, yaw: Math.PI },
        { x: right, z: front, yaw: -Math.PI / 2 },
        { x: left, z: front, yaw: 0 },
      ];
      for (let i = 0; i < 4; i++) {
        const { yaw } = corners[i];
        grid.cutStroke({ ...corners[i], yaw }, { ...corners[i + 1], yaw }, DECK, CUT);
      }
    }
    expect(stripeNeatness(grid, PATCH)).toBeGreaterThan(0.75);
  });

  it('scores a random scribble low', () => {
    const grid = lawn();
    const random = createRandom(3);
    let pose = { x: 5, z: 4, yaw: 0 };
    for (let step = 0; step < 6000; step++) {
      let yaw = pose.yaw + (random() - 0.5) * 0.8;
      let x = pose.x + Math.sin(yaw) * 0.15;
      let z = pose.z + Math.cos(yaw) * 0.15;
      if (x < 0 || x > 10 || z < 0 || z > 8) [x, z, yaw] = [pose.x, pose.z, yaw + Math.PI];
      const next = { x, z, yaw };
      grid.cutStroke(pose, next, DECK, CUT);
      pose = next;
    }
    expect(grid.progress).toBeGreaterThan(0.95);
    expect(stripeNeatness(grid, PATCH)).toBeLessThan(0.45);
  });

  it('ignores texels with no lawn', () => {
    // Only a strip along the front is lawn; rows along x mow it neatly.
    const grid = lawn((_x, z) => (z < 1 ? 1 : 0));
    mowRows(grid, 'x');
    grid.mowX[grid.columns * 50] = 1; // junk off the lawn shouldn't count
    expect(stripeNeatness(grid, PATCH)).toBeGreaterThan(0.98);
  });
});
