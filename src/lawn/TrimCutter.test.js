import { describe, expect, it } from 'vitest';
import { GrassGrid } from './GrassGrid.js';
import { TrimCutter } from './TrimCutter.js';

const CUT = 0.3;
const RADIUS = 0.15;

function lawn() {
  const grid = new GrassGrid({ width: 4, depth: 2, texelsPerMeter: 10, targetHeight: CUT });
  grid.fill(() => 1);
  return grid;
}

/**
 * Sweeps the head from x = 0.5 to x = 3.5 at a steady speed over 1.5 seconds, at a frame
 * rate.
 *
 * @param {number} fps
 */
function sweep(fps) {
  const grid = lawn();
  const cutter = new TrimCutter(grid);
  const frames = Math.round(fps * 1.5);
  const at = (/** @type {number} */ t) => ({ x: 0.5 + 3 * t, z: 1 });
  let cut = 0;
  for (let frame = 0; frame < frames; frame++) {
    cut += cutter.update(1 / fps, at(frame / frames), at((frame + 1) / frames), RADIUS, CUT);
  }
  return { grid, cut };
}

describe('TrimCutter', () => {
  it('cuts a continuous path behind the moving head', () => {
    const { grid } = sweep(60);
    for (let column = 6; column < 34; column++) {
      expect(grid.height[10 * grid.columns + column]).toBeCloseTo(CUT);
    }
  });

  it('cuts exactly the same lawn at any frame rate', () => {
    const reference = sweep(60);
    for (const fps of [30, 50, 144]) {
      const { grid, cut } = sweep(fps);
      expect(Array.from(grid.height), `at ${fps} fps`).toEqual(Array.from(reference.grid.height));
      expect(cut).toBeCloseTo(reference.cut, 6);
    }
  });

  it('starts a fresh sweep after the line stops, instead of cutting across the gap', () => {
    const grid = lawn();
    const cutter = new TrimCutter(grid);
    cutter.update(1 / 60, { x: 0.5, z: 1 }, { x: 0.5, z: 1 }, RADIUS, CUT);
    cutter.lift();
    cutter.update(1 / 60, { x: 3.5, z: 1 }, { x: 3.5, z: 1 }, RADIUS, CUT);
    expect(grid.height[10 * grid.columns + 20]).toBe(1); // x = 2, in the gap
    expect(grid.height[10 * grid.columns + 35]).toBeCloseTo(CUT);
  });
});
