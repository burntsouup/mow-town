import { describe, expect, it } from 'vitest';
import { DeckCutter } from './DeckCutter.js';
import { GrassGrid } from './GrassGrid.js';

const DECK = { width: 0.4, length: 0.2 };
const CUT = 0.3;

function lawn() {
  const grid = new GrassGrid({ width: 2, depth: 6, texelsPerMeter: 10, targetHeight: CUT });
  grid.fill(() => 1);
  return grid;
}

/**
 * Pushes the deck from z = 0.5 to z = 5.5 at a steady speed over 2 seconds, at a frame rate.
 *
 * @param {number} fps
 */
function mowStraight(fps) {
  const grid = lawn();
  const cutter = new DeckCutter(grid);
  const frames = fps * 2;
  let cut = 0;
  for (let frame = 0; frame < frames; frame++) {
    const from = { x: 1, z: 0.5 + (5 * frame) / frames, yaw: 0 };
    const to = { x: 1, z: 0.5 + (5 * (frame + 1)) / frames, yaw: 0 };
    cut += cutter.update(1 / fps, from, to, DECK, CUT);
  }
  return { grid, cut };
}

describe('DeckCutter', () => {
  it('cuts a continuous strip behind a moving deck', () => {
    const { grid } = mowStraight(60);
    for (let row = 6; row < 54; row++) expect(grid.height[row * 20 + 10]).toBeCloseTo(CUT);
  });

  it('cuts exactly the same lawn at any frame rate', () => {
    const reference = mowStraight(60);
    for (const fps of [30, 50, 144]) {
      const { grid, cut } = mowStraight(fps);
      expect(Array.from(grid.height), `at ${fps} fps`).toEqual(Array.from(reference.grid.height));
      expect(cut).toBeCloseTo(reference.cut, 6);
    }
  });

  it('starts a fresh stroke after being lifted, instead of cutting across the gap', () => {
    const grid = lawn();
    const cutter = new DeckCutter(grid);
    const here = { x: 1, z: 1, yaw: 0 };
    cutter.update(1 / 60, here, here, DECK, CUT);
    cutter.lift();
    const there = { x: 1, z: 5, yaw: 0 };
    cutter.update(1 / 60, there, there, DECK, CUT);
    expect(grid.height[30 * 20 + 10]).toBe(1); // z = 3, in the gap, still uncut
    expect(grid.height[50 * 20 + 10]).toBeCloseTo(CUT);
  });

  it('does nothing on a frame too short for a tick', () => {
    const grid = lawn();
    const cutter = new DeckCutter(grid);
    const pose = { x: 1, z: 1, yaw: 0 };
    expect(cutter.update(1 / 240, pose, pose, DECK, CUT)).toBe(0);
    expect(grid.progress).toBe(0);
  });
});
