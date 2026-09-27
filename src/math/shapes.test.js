import { describe, expect, it } from 'vitest';
import { circle, growShape, insideShape } from './shapes.js';

describe('insideShape', () => {
  const rect = { kind: 'rect', minX: 0, maxX: 2, minZ: -1, maxZ: 1 };
  const ellipse = { kind: 'ellipse', x: 0, z: 0, radiusX: 2, radiusZ: 1 };

  it('tells points inside a rectangle from those outside, edges included', () => {
    expect(insideShape(rect, 1, 0)).toBe(true);
    expect(insideShape(rect, 2, 1)).toBe(true);
    expect(insideShape(rect, 2.01, 0)).toBe(false);
  });

  it('handles ellipses stretched along x or z', () => {
    expect(insideShape(ellipse, 1.9, 0)).toBe(true);
    expect(insideShape(ellipse, 0, 1.1)).toBe(false);
    expect(insideShape(ellipse, 1.5, 0.7)).toBe(false);
  });

  it('makes circles', () => {
    expect(insideShape(circle(3, 3, 1), 3.7, 3.7)).toBe(true);
    expect(insideShape(circle(3, 3, 1), 3.8, 3.8)).toBe(false);
  });
});

describe('growShape', () => {
  it('grows rectangles and ellipses by a margin, without changing the original', () => {
    const rect = { kind: 'rect', minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    expect(insideShape(growShape(rect, 0.5), -0.4, 1.4)).toBe(true);
    expect(insideShape(rect, -0.4, 1.4)).toBe(false);
    expect(insideShape(growShape(circle(0, 0, 1), 0.5), 1.4, 0)).toBe(true);
    expect(insideShape(growShape(circle(0, 0, 1), -0.5), 0.6, 0)).toBe(false);
  });
});
