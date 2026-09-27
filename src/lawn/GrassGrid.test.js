import { describe, expect, it } from 'vitest';
import { GrassGrid } from './GrassGrid.js';

/** A 2 × 1 m lawn at 10 texels per meter: 20 × 10 texels. */
function smallLawn() {
  const grid = new GrassGrid({ width: 2, depth: 1, texelsPerMeter: 10 });
  grid.fill(() => 1);
  grid.takeChangedRect();
  return grid;
}

describe('GrassGrid', () => {
  it('sizes the grid from meters and detail', () => {
    const grid = new GrassGrid({ width: 2, depth: 1, texelsPerMeter: 10 });
    expect([grid.columns, grid.rows]).toEqual([20, 10]);
    expect(grid.height.length).toBe(200);
  });

  it('rejects nonsense sizes instead of making an empty lawn', () => {
    expect(() => new GrassGrid({ width: 0, depth: 1, texelsPerMeter: 10 })).toThrow();
    expect(() => new GrassGrid({ width: 1, depth: NaN, texelsPerMeter: 10 })).toThrow();
  });

  it('fills from texel centers in meters, and masks out spots with no lawn', () => {
    const grid = new GrassGrid({ width: 2, depth: 1, texelsPerMeter: 10 });
    const seen = [];
    grid.fill((x, z) => {
      seen.push([x, z]);
      return x < 1 ? 0.8 : 0; // lawn on the left half only
    });
    expect(seen[0][0]).toBeCloseTo(0.05);
    expect(seen[0][1]).toBeCloseTo(0.05);
    expect(grid.height[0]).toBeCloseTo(0.8);
    expect(grid.mask[0]).toBe(1);
    expect(grid.mask[19]).toBe(0);
    expect(grid.takeChangedRect()).toEqual({ minX: 0, minY: 0, maxX: 19, maxY: 9 });
  });

  it('cuts a round patch down, never growing shorter grass back', () => {
    const grid = smallLawn();
    grid.height[5 * 20 + 10] = 0.1; // already very short, right in the middle
    grid.cutCircle(1, 0.5, 0.2, 0.3);
    expect(grid.height[5 * 20 + 9]).toBeCloseTo(0.3); // inside
    expect(grid.height[5 * 20 + 10]).toBeCloseTo(0.1); // stays shorter
    expect(grid.height[5 * 20 + 13]).toBe(1); // 0.35 m away: outside
    expect(grid.height[0]).toBe(1);
  });

  it('leaves spots with no lawn alone', () => {
    const grid = new GrassGrid({ width: 1, depth: 1, texelsPerMeter: 10 });
    grid.fill(() => 0);
    grid.cutCircle(0.5, 0.5, 0.3, 0.3);
    expect(grid.height.every((h) => h === 0)).toBe(true);
  });

  it('tracks the changed rectangle until taken, clipped to the grid', () => {
    const grid = smallLawn();
    expect(grid.takeChangedRect()).toBeNull();
    grid.cutCircle(0, 0, 0.2, 0.3);
    grid.cutCircle(0.5, 0.5, 0.1, 0.3);
    const rect = grid.takeChangedRect();
    expect(rect?.minX).toBe(0);
    expect(rect?.minY).toBe(0);
    expect(rect?.maxX).toBe(6);
    expect(rect?.maxY).toBe(6);
    expect(grid.takeChangedRect()).toBeNull();
  });

  it('ignores cuts entirely off the lawn', () => {
    const grid = smallLawn();
    grid.cutCircle(-5, -5, 0.3, 0.3);
    expect(grid.takeChangedRect()).toBeNull();
  });

  it('packs a rectangle into RGBA bytes: height in red, lawn mask in alpha', () => {
    const grid = new GrassGrid({ width: 0.2, depth: 0.2, texelsPerMeter: 10 });
    grid.fill((x) => (x < 0.1 ? 1 : 0));
    const bytes = new Uint8Array(2 * 1 * 4);
    grid.writeTexels(bytes, { minX: 0, minY: 1, maxX: 1, maxY: 1 });
    expect(Array.from(bytes)).toEqual([255, 128, 128, 255, 0, 128, 128, 0]);
  });
});
