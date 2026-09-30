import { describe, expect, it } from 'vitest';
import { GrassGrid, MOWED_TOLERANCE } from './GrassGrid.js';

const DECK = { width: 0.4, length: 0.2 };
const CUT = 0.3;

/**
 * A lawn at 10 texels per meter, full height everywhere unless told otherwise.
 *
 * @param {{ width?: number, depth?: number, heightAt?: (x: number, z: number) => number,
 *   densityAt?: (x: number, z: number) => number }} [options]
 */
function lawn({ width = 2, depth = 2, heightAt = () => 1, densityAt } = {}) {
  const grid = new GrassGrid({ width, depth, texelsPerMeter: 10, targetHeight: CUT });
  grid.fill(heightAt, densityAt);
  grid.takeChangedRect();
  return grid;
}

/** @param {GrassGrid} grid @param {number} x meters @param {number} z meters */
function heightAt(grid, x, z) {
  return grid.height[Math.floor(z * 10) * grid.columns + Math.floor(x * 10)];
}

describe('GrassGrid.grassAt', () => {
  it('says how tall the grass is at a spot, and 0 off the lawn or in its holes', () => {
    const grid = lawn({ heightAt: (x) => (x < 1 ? 0.8 : 0) });
    expect(grid.grassAt(0.5, 0.5)).toBeCloseTo(0.8);
    expect(grid.grassAt(1.5, 0.5)).toBe(0); // a hole (a flower bed, say)
    expect(grid.grassAt(-0.1, 0.5)).toBe(0);
    expect(grid.grassAt(0.5, 2.5)).toBe(0);
    grid.cutDeck({ x: 0.5, z: 0.5, yaw: 0 }, DECK, CUT);
    expect(grid.grassAt(0.5, 0.5)).toBeCloseTo(CUT);
  });
});

describe('GrassGrid setup', () => {
  it('sizes the grid from meters and detail', () => {
    const grid = new GrassGrid({ width: 2, depth: 1, texelsPerMeter: 10, targetHeight: CUT });
    expect([grid.columns, grid.rows]).toEqual([20, 10]);
    expect(grid.height.length).toBe(200);
  });

  it('rejects nonsense options instead of making an empty lawn', () => {
    const ok = { width: 1, depth: 1, texelsPerMeter: 10, targetHeight: CUT };
    expect(() => new GrassGrid({ ...ok, width: 0 })).toThrow();
    expect(() => new GrassGrid({ ...ok, depth: NaN })).toThrow();
    expect(() => new GrassGrid({ ...ok, targetHeight: undefined })).toThrow();
  });

  it('fills from texel centers in meters, and masks out spots with no lawn', () => {
    const seen = [];
    const grid = lawn({
      heightAt: (x, z) => {
        seen.push([x, z]);
        return x < 1 ? 0.8 : 0; // lawn on the left half only
      },
    });
    expect(seen[0][0]).toBeCloseTo(0.05);
    expect(seen[0][1]).toBeCloseTo(0.05);
    expect(grid.height[0]).toBeCloseTo(0.8);
    expect(grid.mask[0]).toBe(1);
    expect(grid.mask[19]).toBe(0);
    expect(grid.density[19]).toBe(0);
  });

  it('starts at 0% progress, and marks everything for upload', () => {
    const grid = new GrassGrid({ width: 1, depth: 1, texelsPerMeter: 10, targetHeight: CUT });
    grid.fill(() => 1);
    expect(grid.progress).toBe(0);
    expect(grid.takeChangedRect()).toEqual({ minX: 0, minY: 0, maxX: 9, maxY: 9 });
  });

  it('counts a lawn that is already short as done', () => {
    expect(lawn({ heightAt: () => CUT }).progress).toBe(1);
  });
});

describe('GrassGrid.cutDeck', () => {
  it('cuts a rectangle centered on the deck, width across and length along', () => {
    const grid = lawn();
    grid.cutDeck({ x: 1, z: 1, yaw: 0 }, DECK, CUT); // facing +z: 0.4 m across x, 0.2 m along z
    expect(heightAt(grid, 0.85, 1.05)).toBeCloseTo(CUT);
    expect(heightAt(grid, 1.15, 0.95)).toBeCloseTo(CUT);
    expect(heightAt(grid, 1.25, 1.05)).toBe(1); // too far to the side
    expect(heightAt(grid, 1.05, 1.15)).toBe(1); // too far ahead
  });

  it('turns the footprint with the deck', () => {
    const grid = lawn();
    grid.cutDeck({ x: 1, z: 1, yaw: Math.PI / 2 }, DECK, CUT); // facing +x: now 0.4 m along z
    expect(heightAt(grid, 1.05, 1.15)).toBeCloseTo(CUT);
    expect(heightAt(grid, 1.15, 1.05)).toBe(1);
  });

  it('records which way the deck was facing, only where there is lawn', () => {
    const grid = lawn({ heightAt: (x) => (x < 1 ? 1 : 0) });
    grid.cutDeck({ x: 1, z: 1, yaw: Math.PI / 2 }, DECK, CUT);
    const inside = 10 * grid.columns + 9;
    expect(grid.mowX[inside]).toBeCloseTo(1);
    expect(grid.mowZ[inside]).toBeCloseTo(0);
    expect(grid.mowX[10 * grid.columns + 10]).toBe(0); // no lawn there
  });

  it('re-mowing short grass still turns its stripe', () => {
    const grid = lawn();
    grid.cutDeck({ x: 1, z: 1, yaw: 0 }, DECK, CUT);
    grid.cutDeck({ x: 1, z: 1, yaw: Math.PI }, DECK, CUT);
    expect(grid.mowZ[10 * grid.columns + 10]).toBeCloseTo(-1);
  });

  it('reports how much grass it cut, and nothing the second time', () => {
    const grid = lawn();
    const first = grid.cutDeck({ x: 1, z: 1, yaw: 0 }, DECK, CUT);
    // 0.4 × 0.2 m of full grass (1) cut to 0.3: about 0.08 m² × 0.7.
    expect(first).toBeCloseTo(0.08 * 0.7, 2);
    expect(grid.cutDeck({ x: 1, z: 1, yaw: 0 }, DECK, CUT)).toBe(0);
  });

  it('counts thick grass as more work', () => {
    const thick = lawn({ densityAt: () => 2 });
    expect(thick.cutDeck({ x: 1, z: 1, yaw: 0 }, DECK, CUT)).toBeCloseTo(2 * 0.08 * 0.7, 2);
  });

  it('never makes short grass taller', () => {
    const grid = lawn({ heightAt: () => 0.2 });
    grid.cutDeck({ x: 1, z: 1, yaw: 0 }, DECK, CUT);
    expect(heightAt(grid, 1.05, 1.05)).toBeCloseTo(0.2);
  });

  it('marks just the cut area as changed, clipped to the lawn', () => {
    const grid = lawn();
    grid.cutDeck({ x: 0, z: 0, yaw: 0 }, DECK, CUT);
    expect(grid.takeChangedRect()).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 0 });
    expect(grid.takeChangedRect()).toBeNull();
  });

  it('ignores cuts entirely off the lawn', () => {
    const grid = lawn();
    expect(grid.cutDeck({ x: -5, z: -5, yaw: 0 }, DECK, CUT)).toBe(0);
    expect(grid.takeChangedRect()).toBeNull();
  });
});

describe('GrassGrid.workAhead', () => {
  it('is 1 in front of full, normal grass and 0 in front of cut grass', () => {
    const grid = lawn({ depth: 4 });
    expect(grid.workAhead({ x: 1, z: 1, yaw: 0 }, DECK, CUT)).toBeCloseTo(1);
    grid.cutStroke({ x: 1, z: 1, yaw: 0 }, { x: 1, z: 3, yaw: 0 }, DECK, CUT);
    expect(grid.workAhead({ x: 1, z: 1, yaw: 0 }, DECK, CUT)).toBeCloseTo(0);
  });

  it('only looks ahead of the deck, not under it', () => {
    const grid = lawn({ heightAt: (x, z) => (z < 1.15 ? CUT : 1) }); // tall grass from 1.15 m
    expect(grid.workAhead({ x: 1, z: 0.9, yaw: 0 }, DECK, CUT)).toBeCloseTo(0); // front at 1.0
    expect(grid.workAhead({ x: 1, z: 1.05, yaw: 0 }, DECK, CUT)).toBeGreaterThan(0.9);
    // Facing the other way, the tall grass is behind.
    expect(grid.workAhead({ x: 1, z: 1.05, yaw: Math.PI }, DECK, CUT)).toBeCloseTo(0);
  });

  it('is more in thick grass, and nothing off the lawn', () => {
    expect(lawn({ densityAt: () => 2 }).workAhead({ x: 1, z: 1, yaw: 0 }, DECK, CUT)).toBeCloseTo(
      2,
    );
    expect(lawn().workAhead({ x: -3, z: -3, yaw: 0 }, DECK, CUT)).toBe(0);
  });
});

describe('GrassGrid.cutStroke', () => {
  it('leaves no gaps along a long, fast stroke', () => {
    const grid = lawn({ width: 1, depth: 4 });
    grid.cutStroke({ x: 0.5, z: 0.2, yaw: 0 }, { x: 0.5, z: 3.8, yaw: 0 }, DECK, CUT);
    for (let z = 0.25; z < 3.8; z += 0.1) {
      expect(heightAt(grid, 0.55, z), `at z ${z}`).toBeCloseTo(CUT);
    }
  });

  it('sweeps the corners of a turn on the spot', () => {
    const deck = { width: 0.5, length: 0.2 };
    const start = { x: 1, z: 1, yaw: 0 };
    const end = { x: 1, z: 1, yaw: Math.PI / 2 };
    // This spot is outside the deck at the start and at the end of the turn...
    const ends = lawn();
    ends.cutDeck(start, deck, CUT);
    ends.cutDeck(end, deck, CUT);
    expect(heightAt(ends, 0.85, 1.15)).toBe(1);
    // ...but the deck's side sweeps over it halfway through.
    const turned = lawn();
    turned.cutStroke(start, end, deck, CUT);
    expect(heightAt(turned, 0.85, 1.15)).toBeCloseTo(CUT);
  });

  it('gives the same result every time for the same strokes (determinism)', () => {
    const run = () => {
      const grid = lawn();
      grid.cutStroke({ x: 0.3, z: 0.3, yaw: 0.2 }, { x: 1.7, z: 1.1, yaw: 1.3 }, DECK, CUT);
      grid.cutStroke({ x: 1.7, z: 1.1, yaw: 1.3 }, { x: 0.5, z: 1.8, yaw: -2 }, DECK, CUT);
      return [Array.from(grid.height), Array.from(grid.mowX), grid.progress];
    };
    expect(run()).toEqual(run());
  });
});

describe('GrassGrid progress', () => {
  it('reaches 100% once every bit of lawn is cut', () => {
    const grid = lawn({ width: 1, depth: 1 });
    grid.cutStroke({ x: 0.2, z: 0, yaw: 0 }, { x: 0.2, z: 1, yaw: 0 }, DECK, CUT);
    expect(grid.progress).toBeGreaterThan(0.3);
    expect(grid.progress).toBeLessThan(0.5);
    grid.cutStroke({ x: 0.6, z: 0, yaw: 0 }, { x: 0.6, z: 1, yaw: 0 }, DECK, CUT);
    grid.cutStroke({ x: 0.9, z: 0, yaw: 0 }, { x: 0.9, z: 1, yaw: 0 }, DECK, CUT);
    expect(grid.progress).toBeCloseTo(1, 5);
  });

  it('weights tall, thick grass more than short, thin grass', () => {
    // Left half: tall and thick. Right half: barely above the target.
    const grid = lawn({
      width: 2,
      depth: 1,
      heightAt: (x) => (x < 1 ? 1 : CUT + 0.1),
      densityAt: (x) => (x < 1 ? 2 : 1),
    });
    grid.cutStroke(
      { x: 0.5, z: 0, yaw: 0 },
      { x: 0.5, z: 1, yaw: 0 },
      { width: 1, length: 0.2 },
      CUT,
    );
    // Per texel, tall + thick counts (1 - 0.32) × 2 = 1.36; short counts 0.4 - 0.32 = 0.08.
    expect(grid.progress).toBeCloseTo(1.36 / 1.44, 3);
  });

  it('keeps its running total in step with a recount', () => {
    const grid = lawn();
    grid.cutStroke({ x: 0.3, z: 0.3, yaw: 0.2 }, { x: 1.7, z: 1.1, yaw: 1.3 }, DECK, CUT);
    let remaining = 0;
    for (let i = 0; i < grid.height.length; i++) if (!grid.isMowed(i)) remaining += grid.weight[i];
    expect(grid.remainingWeight).toBeCloseTo(remaining, 6);
  });

  it('ignores spots with no lawn', () => {
    const grid = lawn({ heightAt: (x) => (x < 1 ? 1 : 0) });
    grid.cutStroke(
      { x: 0.5, z: 0, yaw: 0 },
      { x: 0.5, z: 2, yaw: 0 },
      { width: 1.2, length: 0.2 },
      CUT,
    );
    expect(grid.progress).toBeCloseTo(1, 5);
  });
});

describe('GrassGrid.shrinkRemaining and reset', () => {
  it('shrinks the leftovers down to the target, finishing the job', () => {
    const grid = lawn();
    expect(grid.shrinkRemaining(0.5)).toBe(true);
    expect(heightAt(grid, 1, 1)).toBeCloseTo(0.5);
    expect(grid.shrinkRemaining(0.5)).toBe(false);
    expect(heightAt(grid, 1, 1)).toBeCloseTo(CUT);
    expect(grid.progress).toBeCloseTo(1, 5);
  });

  it('grows everything back and forgets the stripes', () => {
    const grid = lawn();
    grid.cutStroke({ x: 0.3, z: 0.3, yaw: 0.2 }, { x: 1.7, z: 1.1, yaw: 1.3 }, DECK, CUT);
    grid.takeChangedRect();
    grid.reset();
    expect(grid.progress).toBe(0);
    expect(grid.height.every((h) => h === 1)).toBe(true);
    expect(grid.mowX.every((v) => v === 0)).toBe(true);
    expect(grid.takeChangedRect()).toEqual(grid.fullRect());
  });
});

describe('GrassGrid.cutCircle (string trimmer)', () => {
  it('cuts long grass inside the circle only', () => {
    const grid = lawn();
    const cut = grid.cutCircle(1, 1, 0.3, CUT);
    expect(heightAt(grid, 1, 1)).toBeCloseTo(CUT);
    expect(heightAt(grid, 1.25, 1)).toBeCloseTo(CUT); // inside, near the rim
    expect(heightAt(grid, 1.25, 1.25)).toBe(1); // a corner of the box, outside the circle
    expect(heightAt(grid, 1.4, 1)).toBe(1);
    // About π × 0.3² m² of full grass, cut from 1 down to 0.3.
    expect(cut).toBeCloseTo(Math.PI * 0.09 * 0.7, 1);
    expect(grid.progress).toBeGreaterThan(0);
  });

  it('leaves mowed stripes alone, and gives trimmed grass no mowing direction', () => {
    const grid = lawn();
    grid.cutDeck({ x: 0.5, z: 1, yaw: Math.PI / 2 }, { width: 0.4, length: 0.4 }, CUT);
    const striped = Math.floor(10) * grid.columns + 5; // (0.5, 1)
    expect(grid.cutCircle(0.5, 1, 0.1, CUT)).toBe(0);
    expect(grid.mowX[striped]).toBeCloseTo(1);
    grid.cutCircle(1.5, 1, 0.2, CUT);
    const trimmed = Math.floor(10) * grid.columns + 15; // (1.5, 1)
    expect(heightAt(grid, 1.5, 1)).toBeCloseTo(CUT);
    expect([grid.mowX[trimmed], grid.mowZ[trimmed]]).toEqual([0, 0]);
  });

  it('only counts lawn, and marks the area it checked as changed', () => {
    const grid = lawn({ heightAt: (x) => (x < 1 ? 1 : 0) });
    grid.cutCircle(1, 1, 0.3, CUT);
    expect(heightAt(grid, 1.1, 1)).toBe(0); // no lawn there, so nothing to cut
    expect(grid.takeChangedRect()).toEqual({ minX: 7, minY: 7, maxX: 12, maxY: 12 });
    expect(grid.cutCircle(-5, -5, 0.3, CUT)).toBe(0);
    expect(grid.takeChangedRect()).toBeNull();
  });

  it('leaves no gaps along a fast sweep', () => {
    const grid = lawn();
    grid.cutCircleStroke({ x: 0.2, z: 1 }, { x: 1.8, z: 1 }, 0.15, CUT);
    for (let x = 0.25; x <= 1.75; x += 0.1) expect(heightAt(grid, x, 1)).toBeCloseTo(CUT);
  });
});

describe('GrassGrid edges', () => {
  /** A 2 × 2 m lawn with a 0.4 m square hole (a flower bed) in the middle. */
  function lawnWithBed() {
    const grid = lawn({
      heightAt: (x, z) => (Math.abs(x - 1) < 0.2 && Math.abs(z - 1) < 0.2 ? 0 : 1),
    });
    grid.markEdges(0.25);
    return grid;
  }
  /** @param {GrassGrid} grid @param {number} x @param {number} z */
  const isEdge = (grid, x, z) => grid.edge[Math.floor(z * 10) * grid.columns + Math.floor(x * 10)];

  it('marks lawn near its border and around holes, and nothing else', () => {
    const grid = lawnWithBed();
    expect(isEdge(grid, 0.05, 1)).toBe(1); // along the border
    expect(isEdge(grid, 1.95, 0.05)).toBe(1); // a corner
    expect(isEdge(grid, 1.35, 1)).toBe(1); // just beside the bed
    expect(isEdge(grid, 1, 1)).toBe(0); // in the bed: not lawn, so not an edge
    expect(isEdge(grid, 0.5, 0.5)).toBe(0); // out in the open
    expect(isEdge(grid, 1.55, 1)).toBe(0);
  });

  it('only marks edges along the things it is told to', () => {
    const grid = lawn({
      heightAt: (x, z) => (Math.abs(x - 1) < 0.2 && Math.abs(z - 1) < 0.2 ? 0 : 1),
    });
    grid.markEdges(0.25, (x) => x < 0); // just the left border, like a fence
    expect(isEdge(grid, 0.05, 1)).toBe(1);
    expect(isEdge(grid, 1.95, 1)).toBe(0);
    expect(isEdge(grid, 1.35, 1)).toBe(0);
  });

  it('tracks edge progress separately, weighted like the rest', () => {
    const grid = lawnWithBed();
    expect(grid.edgeProgress).toBe(0);
    grid.cutDeck({ x: 1, z: 1, yaw: 0 }, { width: 2, length: 2 }, CUT); // everything
    expect(grid.edgeProgress).toBe(1);
    expect(grid.progress).toBe(1);
    grid.reset();
    grid.cutCircle(0.5, 0.5, 0.2, CUT); // only open lawn
    expect(grid.edgeProgress).toBe(0);
    expect(grid.progress).toBeGreaterThan(0);
  });

  it('can shrink the leftovers away from the edges and leave the edges for later', () => {
    const grid = lawnWithBed();
    while (grid.shrinkRemaining(0.1, { inner: true, edges: false }));
    expect(grid.edgeProgress).toBe(0);
    expect(heightAt(grid, 0.5, 0.5)).toBeCloseTo(CUT);
    expect(heightAt(grid, 0.05, 1)).toBe(1);
    while (grid.shrinkRemaining(0.1, { inner: false, edges: true }));
    expect(grid.edgeProgress).toBe(1);
    expect(grid.progress).toBe(1);
  });
});

describe('GrassGrid.writeTexels', () => {
  it('packs height, mowing direction and lawn mask into RGBA bytes', () => {
    const grid = new GrassGrid({ width: 0.2, depth: 0.1, texelsPerMeter: 10, targetHeight: CUT });
    grid.fill((x) => (x < 0.1 ? 1 : 0));
    grid.mowX[0] = 1; // as if mowed heading +x
    const bytes = new Uint8Array(2 * 4);
    grid.writeTexels(bytes, { minX: 0, minY: 0, maxX: 1, maxY: 0 });
    expect(Array.from(bytes)).toEqual([255, 255, 128, 128, 0, 128, 128, 0]);
  });

  it('stores thicker grass as a higher alpha, up to MAX_DENSITY', () => {
    const grid = new GrassGrid({ width: 0.3, depth: 0.1, texelsPerMeter: 10, targetHeight: CUT });
    grid.fill(
      () => 1,
      (x) => (x < 0.1 ? 1 : x < 0.2 ? 2 : 9),
    );
    const bytes = new Uint8Array(3 * 4);
    grid.writeTexels(bytes, { minX: 0, minY: 0, maxX: 2, maxY: 0 });
    expect([bytes[3], bytes[7], bytes[11]]).toEqual([128, 192, 255]);
  });

  it('exposes the tolerance used to decide what counts as mowed', () => {
    expect(MOWED_TOLERANCE).toBeGreaterThan(0);
    expect(MOWED_TOLERANCE).toBeLessThan(0.1);
  });
});
