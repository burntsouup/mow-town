import { describe, expect, it } from 'vitest';
import { GrassGrid } from './GrassGrid.js';
import { PATTERNS, patternProgress, patternScore, stripeAxes } from './patterns.js';

const DECK = { width: 0.5, length: 0.4 };
const CUT = 0.3;
const PATCH = 1.5;
const WIDTH = 10;
const DEPTH = 8;

/** A 10 × 8 m lawn at 16 texels per meter, full height everywhere. */
function lawn() {
  const grid = new GrassGrid({ width: WIDTH, depth: DEPTH, texelsPerMeter: 16, targetHeight: CUT });
  grid.fill(() => 1);
  return grid;
}

/**
 * Mows back-and-forth rows over the whole lawn, heading `yaw` (0 = +z, π/2 = +x) and back.
 *
 * @param {GrassGrid} grid
 * @param {number} yaw
 */
function mowRows(grid, yaw) {
  const [dx, dz] = [Math.sin(yaw), Math.cos(yaw)];
  const reach = WIDTH + DEPTH; // long enough to cross the lawn from its middle, any way
  for (let offset = -reach, row = 0; offset < reach; offset += 0.45, row++) {
    // A line along (dx, dz) through the middle, shifted sideways by `offset`.
    const [cx, cz] = [WIDTH / 2 + dz * offset, DEPTH / 2 - dx * offset];
    const a = { x: cx - dx * reach, z: cz - dz * reach };
    const b = { x: cx + dx * reach, z: cz + dz * reach };
    const [from, to, heading] = row % 2 === 0 ? [a, b, yaw] : [b, a, yaw + Math.PI];
    grid.cutStroke({ ...from, yaw: heading }, { ...to, yaw: heading }, DECK, CUT);
  }
}

describe('patternScore', () => {
  it('scores stripes as neat rows, any way they run', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI / 4]) {
      const grid = lawn();
      mowRows(grid, yaw);
      expect(patternScore(grid, 'stripes', PATCH)).toBeGreaterThan(0.97);
    }
  });

  it('scores diagonals near 1 at 45°, less the further off, and 0 when straight', () => {
    const at = (/** @type {number} */ yaw) => {
      const grid = lawn();
      mowRows(grid, yaw);
      return patternScore(grid, 'diagonal', PATCH);
    };
    expect(at(Math.PI / 4)).toBeGreaterThan(0.95);
    expect(at(-Math.PI / 4)).toBeGreaterThan(0.95); // the other diagonal is fine too
    expect(at(Math.PI / 4 + 0.15)).toBeGreaterThan(0.9); // ~9° off: still a full tip
    expect(at(Math.PI / 6)).toBeCloseTo(0.75, 1); // 15° off
    expect(at(0)).toBeLessThan(0.05);
    expect(at(Math.PI / 2)).toBeLessThan(0.05);
  });

  it('scores a checkerboard only once it has been mowed across', () => {
    const grid = lawn();
    mowRows(grid, 0);
    expect(patternScore(grid, 'checkerboard', PATCH)).toBe(0);
    mowRows(grid, Math.PI / 2);
    expect(patternScore(grid, 'checkerboard', PATCH)).toBeGreaterThan(0.95);
  });

  it('counts diamonds (both passes diagonal) as a checkerboard too', () => {
    const grid = lawn();
    mowRows(grid, Math.PI / 4);
    mowRows(grid, -Math.PI / 4);
    expect(patternScore(grid, 'checkerboard', PATCH)).toBeGreaterThan(0.95);
  });

  it('gives a half-crossed checkerboard part marks, and a skewed one less', () => {
    const half = lawn();
    mowRows(half, 0);
    half.cutDeck({ x: WIDTH / 4, z: DEPTH / 2, yaw: Math.PI / 2 }, { width: 50, length: 5 }, CUT);
    const score = patternScore(half, 'checkerboard', PATCH);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.75);

    const skewed = lawn();
    mowRows(skewed, 0);
    mowRows(skewed, Math.PI / 3); // only 60° across
    expect(patternScore(skewed, 'checkerboard', PATCH)).toBeLessThan(0.8);
  });

  it('is 0 before anything is mowed', () => {
    for (const pattern of /** @type {const} */ (['stripes', 'checkerboard', 'diagonal'])) {
      expect(patternScore(lawn(), pattern, PATCH)).toBe(0);
    }
  });
});

describe('patternProgress', () => {
  const settings = { completeAt: 0.98, crossDoneAt: 0.9 };

  it('is just the mowed fraction for one-pass patterns', () => {
    const lawn = { mowed: 0.5, crossed: 0.2 };
    expect(patternProgress('stripes', lawn, settings)).toBe(0.5);
    expect(patternProgress('diagonal', lawn, settings)).toBe(0.5);
  });

  it('makes each pass of a checkerboard half the job, done when both are', () => {
    const progress = (/** @type {number} */ mowed, /** @type {number} */ crossed) =>
      patternProgress('checkerboard', { mowed, crossed }, settings);
    expect(progress(0, 0)).toBe(0);
    expect(progress(0.98, 0)).toBeCloseTo(0.49);
    expect(progress(1, 0.45)).toBeCloseTo(0.98 * 0.75);
    expect(progress(0.98, 0.9)).toBe(0.98); // done
    expect(progress(1, 1)).toBe(0.98); // never past done
  });
});

describe('stripeAxes', () => {
  it('finds the way the stripes run (as an axis), or null before mowing', () => {
    expect(stripeAxes(lawn())).toEqual({ latest: null, earlier: null });
    const grid = lawn();
    mowRows(grid, 0); // heading ±z: the z axis, 90° from +x
    const axes = stripeAxes(grid);
    expect(Math.abs(axes.latest ?? 0)).toBeCloseTo(Math.PI / 2, 2);
    expect(axes.earlier).toBeNull();
  });

  it('finds both passes of a checkerboard', () => {
    const grid = lawn();
    mowRows(grid, Math.PI / 4);
    mowRows(grid, -Math.PI / 4);
    const axes = stripeAxes(grid);
    expect(axes.latest).toBeCloseTo(-Math.PI / 4, 2);
    expect(axes.earlier).toBeCloseTo(Math.PI / 4, 2);
  });
});

describe('PATTERNS', () => {
  it('names every pattern and says how many passes it takes', () => {
    for (const pattern of Object.values(PATTERNS)) {
      expect(pattern.name).toBeTruthy();
      expect(pattern.tipLabel).toBeTruthy();
      expect([1, 2]).toContain(pattern.passes);
      if (pattern.passes === 2) expect(pattern.acrossHint).toBeTruthy();
    }
  });
});
