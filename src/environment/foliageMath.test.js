import { describe, expect, it } from 'vitest';
import { createRandom } from '../math/noise.js';
import { centroid, flowerHeads, leafCards } from './foliageMath.js';

const LEAVES = 5; // leafCards' default, per cluster
const TREE = [
  { x: 0, y: 3, z: 0, radius: 1.4 },
  { x: 1, y: 2.8, z: 0.3, radius: 1 },
  { x: -0.9, y: 2.9, z: 0.4, radius: 1, squash: 0.8 },
];

/** @param {number[]} list @param {number} i */
const vec = (list, i) => ({ x: list[i * 3], y: list[i * 3 + 1], z: list[i * 3 + 2] });

describe('leafCards', () => {
  const cards = leafCards(TREE, { density: 20, size: 0.4, random: createRandom(2) });

  const points = cards.count * LEAVES * 4;

  it('makes clusters of leaves, each leaf four points and two triangles', () => {
    expect(cards.count).toBeGreaterThan(100);
    expect(cards.positions).toHaveLength(points * 3);
    expect(cards.normals).toHaveLength(points * 3);
    expect(cards.colors).toHaveLength(points * 4);
    expect(cards.indices).toHaveLength(cards.count * LEAVES * 6);
    expect(Math.max(...cards.indices)).toBe(points - 1);
  });

  it('puts leaves on the surface of the plant, not deep inside it', () => {
    for (let i = 0; i < points; i += 4) {
      // The middle of each leaf: the average of its points.
      const corners = [0, 1, 2, 3].map((k) => vec(cards.positions, i + k));
      const mid = {
        x: corners.reduce((s, c) => s + c.x, 0) / 4,
        y: corners.reduce((s, c) => s + c.y, 0) / 4,
        z: corners.reduce((s, c) => s + c.z, 0) / 4,
      };
      const nearestSurface = Math.min(
        ...TREE.map((b) =>
          Math.abs(
            Math.hypot(mid.x - b.x, (mid.y - b.y) / (b.squash ?? 1), mid.z - b.z) - b.radius,
          ),
        ),
      );
      expect(nearestSurface).toBeLessThan(0.4);
    }
  });

  it('lights every leaf with a unit normal pointing out of the plant', () => {
    const middle = centroid(TREE);
    for (let i = 0; i < points; i++) {
      const n = vec(cards.normals, i);
      const p = vec(cards.positions, i);
      expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
      const out = { x: p.x - middle.x, y: p.y - middle.y, z: p.z - middle.z };
      expect(n.x * out.x + n.y * out.y + n.z * out.z).toBeGreaterThan(-0.3);
    }
  });

  it('shades undersides darker', () => {
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < points; i++) {
      const n = vec(cards.normals, i);
      if (n.y > 0.7) top = Math.max(top, cards.colors[i * 4]);
      if (n.y < -0.7) bottom = Math.max(bottom, cards.colors[i * 4]);
    }
    expect(bottom).toBeLessThan(top);
  });

  it('is the same every time for the same seed', () => {
    const again = leafCards(TREE, { density: 20, size: 0.4, random: createRandom(2) });
    expect(again.positions).toEqual(cards.positions);
  });
});

describe('centroid', () => {
  it('leans toward the bigger balls', () => {
    const middle = centroid([
      { x: 0, y: 0, z: 0, radius: 2 },
      { x: 3, y: 0, z: 0, radius: 1 },
    ]);
    expect(middle.x).toBeGreaterThan(0);
    expect(middle.x).toBeLessThan(1);
  });
});

describe('flowerHeads', () => {
  const daisy = {
    x: 1,
    y: 0.3,
    z: -2,
    radius: 0.05,
    petals: 5,
    color: [1, 1, 1],
    middle: [1, 0.8, 0.1],
    tilt: [0.2, -0.1],
  };
  const heads = flowerHeads([daisy, { ...daisy, x: 3, petals: 6 }]);

  it('makes a middle point and two rings for each flower', () => {
    const perFlower = 1 + 2 * 30;
    expect(heads.positions).toHaveLength(2 * perFlower * 3);
    expect(heads.colors).toHaveLength(2 * perFlower * 4);
    expect(heads.indices).toHaveLength(2 * 30 * 9);
    expect(Math.max(...heads.indices)).toBe(2 * perFlower - 1);
  });

  it('keeps each flower within its radius, colored in the middle and on its petals', () => {
    for (let i = 0; i < 61; i++) {
      const p = vec(heads.positions, i);
      expect(Math.hypot(p.x - daisy.x, p.y - daisy.y, p.z - daisy.z)).toBeLessThan(
        daisy.radius * 1.2,
      );
    }
    expect(heads.colors.slice(0, 3)).toEqual(daisy.middle);
    expect(heads.colors.slice(8, 11)).toEqual(daisy.color); // the first petal point
  });

  it('faces the sky, tipped a little', () => {
    const n = vec(heads.normals, 0);
    expect(n.y).toBeGreaterThan(0.9);
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
  });
});
