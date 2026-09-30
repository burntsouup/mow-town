import { describe, expect, it } from 'vitest';
import { furShells } from './furGeometry.js';

// One triangle, facing up (+y).
const triangle = {
  positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
  normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
  indices: [0, 2, 1],
};

describe('furShells', () => {
  it('can make just the skin (no shells), exactly on the surface', () => {
    const skin = furShells(triangle, { shells: 0, length: 0 });
    expect(skin.positions).toEqual(triangle.positions);
    expect(skin.furShell).toEqual([0, 0, 0]);
  });

  it('can leave the skin out, for drawing it separately', () => {
    const shells = furShells(triangle, { shells: 2, length: 0.02, skin: false });
    expect(shells.furShell).toEqual([0.5, 0.5, 0.5, 1, 1, 1]);
    expect(shells.indices).toEqual([0, 2, 1, 3, 5, 4]);
  });

  const fur = furShells(triangle, { shells: 4, length: 0.02 });

  it('makes one copy of the surface for the skin, then one per shell', () => {
    expect(fur.positions.length).toBe(5 * 9);
    expect(fur.indices.slice(0, 6)).toEqual([0, 2, 1, 3, 5, 4]);
    expect(fur.indices).toHaveLength(5 * 3);
  });

  it('pushes each shell out along the normals, the last one to the full length', () => {
    expect(fur.positions[1]).toBeCloseTo(0); // the skin
    expect(fur.positions[9 + 1]).toBeCloseTo(0.005); // shell 1 of 4
    expect(fur.positions[4 * 9 + 1]).toBeCloseTo(0.02); // shell 4 of 4
    expect(fur.positions[4 * 9]).toBeCloseTo(0); // sideways, nothing moves
  });

  it('remembers where on the skin each point came from, and how far out it is', () => {
    expect(fur.furBase.slice(36, 39)).toEqual([0, 0, 0]);
    expect(fur.furShell).toEqual([
      0, 0, 0, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 1, 1, 1,
    ]);
    expect(fur.normals.slice(0, 3)).toEqual([0, 1, 0]);
  });
});
