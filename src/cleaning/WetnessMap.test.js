import { describe, expect, it } from 'vitest';
import { WetnessMap } from './WetnessMap.js';

describe('WetnessMap', () => {
  it('starts dry', () => {
    const map = new WetnessMap(10, 10);
    expect(Math.max(...map.wetness)).toBe(0);
  });

  it('soaks the middle fully, fades at the edge, and leaves the outside dry', () => {
    const map = new WetnessMap(40, 40);
    map.soak(20.5, 20.5, 10);
    expect(map.get(20, 20)).toBe(1);
    expect(map.get(28, 20)).toBeGreaterThan(0); // 0.8 × radius: in the soft edge
    expect(map.get(28, 20)).toBeLessThan(1);
    expect(map.get(31, 20)).toBe(0); // beyond the radius
  });

  it('never makes an already wetter spot drier', () => {
    const map = new WetnessMap(40, 40);
    map.soak(20.5, 20.5, 10);
    map.soak(29.5, 20.5, 10); // soft edge of this stamp overlaps the first stamp's center
    expect(map.get(20, 20)).toBe(1);
  });

  it('leaves a continuous trail on a fast sweep', () => {
    const map = new WetnessMap(200, 20);
    map.soakStroke({ x: 10, y: 10 }, { x: 190, y: 10 }, 4);
    for (let x = 12; x <= 188; x++) expect(map.get(x, 10)).toBeGreaterThan(0.5);
  });

  it('dries at a steady rate and is completely dry after dryTime', () => {
    const map = new WetnessMap(20, 20);
    map.soak(10, 10, 5);
    map.dry(2, 8);
    expect(map.get(9, 9)).toBeCloseTo(0.75);
    for (let i = 0; i < 10; i++) map.dry(1, 8);
    expect(Math.max(...map.wetness)).toBe(0);
  });

  it('skips the work (and reports no change) once everything is dry', () => {
    const map = new WetnessMap(20, 20);
    map.soak(10, 10, 5);
    map.dry(9, 8);
    map.takeChanges();
    map.dry(0.016, 8);
    expect(map.takeChanges()).toBe(false);
  });

  it('flags changes when soaked', () => {
    const map = new WetnessMap(20, 20);
    expect(map.takeChanges()).toBe(false);
    map.soak(5, 5, 2);
    expect(map.takeChanges()).toBe(true);
    expect(map.takeChanges()).toBe(false);
  });

  it('can dry completely at once', () => {
    const map = new WetnessMap(20, 20);
    map.soak(10, 10, 5);
    map.takeChanges();
    map.dryCompletely();
    expect(Math.max(...map.wetness)).toBe(0);
    expect(map.takeChanges()).toBe(true);
    map.dry(0.016, 8);
    expect(map.takeChanges()).toBe(false); // nothing left to dry
  });
});

describe('WetnessMap with an elliptical spray', () => {
  it('soaks the same wide, short footprint as the dirt brush', () => {
    const map = new WetnessMap(60, 60);
    map.soak(30.5, 30.5, { radiusX: 10, radiusY: 3, angle: 0 });
    expect(map.get(35, 30)).toBe(1);
    expect(map.get(30, 34)).toBe(0);
  });
});

describe('WetnessMap: only works where it is wet', () => {
  it('tracks the wet area as it is soaked', () => {
    const map = new WetnessMap(100, 100);
    expect(map.wetRect).toBeNull();
    map.soak(20, 20, 3);
    map.soak(70, 60, 3);
    expect(map.wetRect.minX).toBeLessThanOrEqual(17);
    expect(map.wetRect.maxX).toBeGreaterThanOrEqual(73);
  });

  it('reports only the wet area as changed while drying', () => {
    const map = new WetnessMap(100, 100);
    map.soak(50, 50, 3);
    map.takeChangedRect();
    map.dry(0.1, 8);
    const rect = map.takeChangedRect();
    expect(rect.maxX - rect.minX).toBeLessThan(10);
  });

  it('forgets the wet area once everything is dry', () => {
    const map = new WetnessMap(100, 100);
    map.soak(50, 50, 3);
    map.dry(9, 8);
    expect(map.wetRect).toBeNull();
    map.takeChangedRect();
    map.dry(0.1, 8);
    expect(map.takeChangedRect()).toBeNull();
  });
});

describe('WetnessMap trickles (water running down a wall)', () => {
  it('runs from a point in the given direction and fades along the way', () => {
    const map = new WetnessMap(20, 100);
    map.trickle({ x: 10, y: 80 }, { x: 0, y: -1 }, 50, 1.5, 0.9, 0.3);
    expect(map.get(10, 79)).toBeGreaterThan(0.7); // near the start: quite wet
    expect(map.get(10, 55)).toBeGreaterThan(0.3); // halfway down
    expect(map.get(10, 55)).toBeLessThan(map.get(10, 79));
    expect(map.get(10, 90)).toBe(0); // it doesn't run uphill
    expect(map.get(15, 60)).toBe(0); // and it's thin
  });

  it('never makes a soaked spot drier', () => {
    const map = new WetnessMap(20, 100);
    map.soak(10, 60, 5);
    map.trickle({ x: 10, y: 80 }, { x: 0, y: -1 }, 40, 1.5, 0.5, 0.2);
    expect(map.get(10, 60)).toBe(1);
  });
});
