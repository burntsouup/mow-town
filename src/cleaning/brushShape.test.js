import { describe, expect, it } from 'vitest';
import { ellipseBounds, ellipseReach, forEachTexelInEllipse, toEllipse } from './brushShape.js';

/** Which texels an ellipse covers, as a Set of "x,y" strings. */
function covered(width, height, cx, cy, ellipse) {
  const texels = new Set();
  forEachTexelInEllipse(width, height, cx, cy, ellipse, (i) => {
    texels.add(`${i % width},${Math.floor(i / width)}`);
  });
  return texels;
}

describe('toEllipse', () => {
  it('turns a circle into an ellipse with equal radii', () => {
    expect(toEllipse({ radius: 3 })).toEqual({ radiusX: 3, radiusY: 3, angle: 0 });
  });

  it('leaves an ellipse alone', () => {
    const ellipse = { radiusX: 5, radiusY: 2, angle: 1 };
    expect(toEllipse(ellipse)).toBe(ellipse);
  });
});

describe('forEachTexelInEllipse', () => {
  it('covers a wide, short area for a wide ellipse', () => {
    const texels = covered(40, 40, 20, 20, { radiusX: 10, radiusY: 3, angle: 0 });
    expect(texels.has('28,20')).toBe(true); // 8 across: inside
    expect(texels.has('20,24')).toBe(false); // 4 down: outside
  });

  it('turns the ellipse with its angle', () => {
    const texels = covered(40, 40, 20, 20, { radiusX: 10, radiusY: 3, angle: Math.PI / 2 });
    expect(texels.has('20,28')).toBe(true); // now it reaches down
    expect(texels.has('24,20')).toBe(false); // and is narrow across
  });

  it('reports distance 0 at the center and near 1 at the edge', () => {
    const distances = new Map();
    forEachTexelInEllipse(40, 40, 20.5, 20.5, { radiusX: 10, radiusY: 4, angle: 0 }, (i, d) =>
      distances.set(i, d),
    );
    expect(distances.get(20 * 40 + 20)).toBeCloseTo(0);
    expect(distances.get(20 * 40 + 29)).toBeCloseTo(0.9);
  });

  it('matches a circle when both radii are equal', () => {
    const asEllipse = covered(30, 30, 15, 15, { radiusX: 6, radiusY: 6, angle: 0.7 });
    let inCircle = 0;
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) if (Math.hypot(x + 0.5 - 15, y + 0.5 - 15) < 6) inCircle++;
    }
    expect(asEllipse.size).toBe(inCircle);
  });

  it('never visits texels outside the grid', () => {
    let visits = 0;
    forEachTexelInEllipse(10, 10, 0, 0, { radiusX: 30, radiusY: 5, angle: 0.4 }, (i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(100);
      visits++;
    });
    expect(visits).toBeGreaterThan(0);
  });
});

describe('ellipseReach', () => {
  const ellipse = { radiusX: 10, radiusY: 2, angle: 0 };

  it('reaches the long radius along the long axis and the short one across it', () => {
    expect(ellipseReach(ellipse, 1, 0)).toBeCloseTo(10);
    expect(ellipseReach(ellipse, 0, 1)).toBeCloseTo(2);
  });

  it('follows the rotation', () => {
    expect(ellipseReach({ ...ellipse, angle: Math.PI / 2 }, 0, 1)).toBeCloseTo(10);
  });
});

describe('ellipseBounds', () => {
  it('is the box around the ellipse, clipped to the grid', () => {
    expect(ellipseBounds(100, 100, 50, 50, { radiusX: 10, radiusY: 3, angle: 0 })).toEqual({
      minX: 40,
      minY: 47,
      maxX: 60,
      maxY: 53,
    });
    expect(ellipseBounds(20, 20, 2, 2, { radiusX: 5, radiusY: 5, angle: 0 })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 7,
      maxY: 7,
    });
  });

  it('is null for an ellipse entirely off the grid', () => {
    expect(ellipseBounds(20, 20, -50, 5, { radiusX: 3, radiusY: 3, angle: 0 })).toBeNull();
  });
});
