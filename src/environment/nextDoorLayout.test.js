import { describe, expect, it } from 'vitest';
import { NEXT_LAWN, NEXT_SPOTS, nextDoorLawn } from './nextDoorLayout.js';

describe("the Parkers' lawn", () => {
  const area = nextDoorLawn();
  const { front, side } = NEXT_LAWN;
  /** World meters to the lawn's own (from its front-left corner). */
  const at = (/** @type {number} */ x, /** @type {number} */ z) =>
    area.heightAt(x - front.left, z - front.front);

  it('is an L: a wide front yard and a side yard running back between the houses', () => {
    expect(at(20, -8)).toBeGreaterThan(0); // front yard
    expect(at(11, 4)).toBeGreaterThan(0); // side yard
    expect(at(20, 4)).toBe(0); // their house, behind the front yard
    expect(area.width).toBeCloseTo(front.right - front.left);
    expect(area.depth).toBeCloseTo(side.back - front.front);
  });

  it('has no grass under the things on it', () => {
    for (const spot of Object.values(NEXT_SPOTS)) expect(at(spot.x, spot.z)).toBe(0);
  });

  it('counts the hedge, the shed and the things on the lawn as edges, but not paths', () => {
    expect(area.edgeAt(-0.1, 5)).toBe(true); // the hedge, along the left
    expect(area.edgeAt(2, area.depth + 0.1)).toBe(true); // the shed, behind the side yard
    const bed = NEXT_SPOTS.islandBed;
    expect(area.edgeAt(bed.x - front.left, bed.z - front.front)).toBe(true);
    expect(area.edgeAt(5, -0.1)).toBe(false); // the sidewalk
    expect(area.edgeAt(area.width + 0.1, 3)).toBe(false); // their driveway
  });

  it('is about one and a half times the size of our front lawn', () => {
    let texels = 0;
    for (let z = 0.05; z < area.depth; z += 0.1) {
      for (let x = 0.05; x < area.width; x += 0.1) if (area.heightAt(x, z) > 0) texels++;
    }
    const squareMeters = texels / 100;
    expect(squareMeters).toBeGreaterThan(180);
    expect(squareMeters).toBeLessThan(215);
  });
});
