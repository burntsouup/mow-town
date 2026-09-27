import { describe, expect, it } from 'vitest';
import { gridSize, texelCenterInMeters, uvAxesFromTriangle, uvToTexel } from './surfaceMath.js';

describe('gridSize', () => {
  it('gives the driveway 256 × 512 texels at ~2 cm per texel', () => {
    expect(gridSize(5, 10, 51.2)).toEqual({ width: 256, height: 512 });
  });

  it('rounds to whole texels and never returns zero', () => {
    expect(gridSize(1.01, 0.001, 10)).toEqual({ width: 10, height: 1 });
  });
});

describe('uvToTexel', () => {
  const grid = { width: 256, height: 512 };

  it('maps the UV corners to the grid corners', () => {
    expect(uvToTexel(0, 0, grid)).toEqual({ x: 0, y: 0 });
    expect(uvToTexel(1, 1, grid)).toEqual({ x: 256, y: 512 });
  });

  it('maps the middle of the surface to the middle of the grid', () => {
    expect(uvToTexel(0.5, 0.25, grid)).toEqual({ x: 128, y: 128 });
  });

  it('clamps UVs that fall slightly outside 0..1', () => {
    expect(uvToTexel(-0.01, 1.02, grid)).toEqual({ x: 0, y: 512 });
  });
});

describe('texelCenterInMeters', () => {
  it('finds the center of a texel on the real surface', () => {
    const grid = { width: 5, height: 10 }; // 1 texel per meter
    expect(texelCenterInMeters(0, 0, grid, 5, 10)).toEqual({ x: 0.5, y: 0.5 });
    expect(texelCenterInMeters(4, 9, grid, 5, 10)).toEqual({ x: 4.5, y: 9.5 });
  });

  it('round-trips with uvToTexel', () => {
    const grid = { width: 256, height: 512 };
    const meters = texelCenterInMeters(99, 300, grid, 5, 10);
    const texel = uvToTexel(meters.x / 5, meters.y / 10, grid);
    expect(texel.x).toBeCloseTo(99.5);
    expect(texel.y).toBeCloseTo(300.5);
  });
});

describe('uvAxesFromTriangle', () => {
  it('finds u along +x and v along +z for a ground patch (like the driveway)', () => {
    const { u, v } = uvAxesFromTriangle(
      [
        [0, 0, 0],
        [5, 0, 0],
        [0, 0, 10],
      ],
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    );
    expect(u[0]).toBeCloseTo(1);
    expect(v[2]).toBeCloseTo(1);
  });

  it('finds u sideways and v upward for an upright panel (like a fence)', () => {
    const { u, v } = uvAxesFromTriangle(
      [
        [0, 0, 3],
        [0, 1.6, 3],
        [-24, 0, 3],
      ],
      [
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    );
    expect(u[0]).toBeCloseTo(1); // u grows toward +x
    expect(v[1]).toBeCloseTo(1); // v grows upward
  });
});
