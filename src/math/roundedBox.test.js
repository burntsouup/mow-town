import { describe, expect, it } from 'vitest';
import { roundedBox } from './roundedBox.js';

/** @param {number[]} values @param {number} i */
const vec = (values, i) => [values[i * 3], values[i * 3 + 1], values[i * 3 + 2]];

describe('roundedBox', () => {
  const box = roundedBox({ width: 2, height: 1, depth: 0.6, radius: 0.1, segments: 3 });
  const count = box.positions.length / 3;

  it('stays inside its size, and reaches it in the middle of each face', () => {
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = vec(box.positions, i);
      maxX = Math.max(maxX, Math.abs(x));
      maxY = Math.max(maxY, Math.abs(y));
      maxZ = Math.max(maxZ, Math.abs(z));
    }
    expect(maxX).toBeCloseTo(1);
    expect(maxY).toBeCloseTo(0.5);
    expect(maxZ).toBeCloseTo(0.3);
  });

  it('rounds the corners off', () => {
    // No point comes near the sharp corner (1, 0.5, 0.3).
    let nearest = Infinity;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = vec(box.positions, i);
      nearest = Math.min(nearest, Math.hypot(x - 1, y - 0.5, z - 0.3));
    }
    const cut = Math.sqrt(3) * 0.1 - 0.1; // corner to the rounded surface
    expect(nearest).toBeGreaterThan(cut * 0.95);
  });

  it('has a 0..1 texture coordinate for every point', () => {
    expect(box.uvs.length).toBe(count * 2);
    for (const uv of box.uvs) {
      expect(uv).toBeGreaterThanOrEqual(-1e-9);
      expect(uv).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('has unit normals that point outward', () => {
    for (let i = 0; i < count; i++) {
      const n = vec(box.normals, i);
      const p = vec(box.positions, i);
      expect(Math.hypot(...n)).toBeCloseTo(1);
      expect(n[0] * p[0] + n[1] * p[1] + n[2] * p[2]).toBeGreaterThan(0);
    }
  });

  it("winds every triangle clockwise from outside, as Babylon's front faces are", () => {
    for (let t = 0; t < box.indices.length; t += 3) {
      const [a, b, c] = [box.indices[t], box.indices[t + 1], box.indices[t + 2]];
      const [A, B, C] = [vec(box.positions, a), vec(box.positions, b), vec(box.positions, c)];
      const u = B.map((x, i) => x - A[i]);
      const w = C.map((x, i) => x - A[i]);
      const cross = [
        u[1] * w[2] - u[2] * w[1],
        u[2] * w[0] - u[0] * w[2],
        u[0] * w[1] - u[1] * w[0],
      ];
      const n = vec(box.normals, a);
      const area = Math.hypot(...cross);
      if (area > 1e-12)
        expect((cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]) / area).toBeLessThan(0);
    }
  });

  it('with no radius, is an ordinary box; with a huge one, clamps to a pill', () => {
    const sharp = roundedBox({ width: 1, height: 1, depth: 1, radius: 0 });
    for (let i = 0; i < sharp.positions.length; i++) {
      expect(Math.abs(sharp.positions[i])).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    const pill = roundedBox({ width: 1, height: 0.2, depth: 0.2, radius: 5 });
    expect(Math.max(...pill.positions.map(Math.abs))).toBeCloseTo(0.5);
  });
});
