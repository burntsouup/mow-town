import { describe, expect, it } from 'vitest';
import {
  bodyBand,
  CLOTHES,
  directionAt,
  elevationAtLevel,
  furCover,
  starOutline,
} from './clothesMath.js';
import { bodyPoint } from './tuftMath.js';
import { cycleStyle, DEFAULT_OUTFIT } from './wardrobe.js';

/** @param {number[]} list @param {number} i */
const vec = (list, i) => ({ x: list[i * 3], y: list[i * 3 + 1], z: list[i * 3 + 2] });

describe('directionAt', () => {
  it('goes round from the front (+z) toward +x, and up with elevation', () => {
    const front = directionAt(0, 0);
    expect(front.z).toBeCloseTo(1);
    expect(directionAt(Math.PI / 2, 0).x).toBeCloseTo(1);
    expect(directionAt(1, Math.PI / 2).y).toBeCloseTo(1);
  });
});

describe('elevationAtLevel', () => {
  it('finds where the body crosses a height', () => {
    for (const angle of [0, 1, 2.5, 4]) {
      const e = elevationAtLevel(bodyPoint, angle, { height: 0.3, tilt: 0 });
      expect(bodyPoint(directionAt(angle, e)).point.y).toBeCloseTo(0.3, 4);
    }
  });

  it('follows a tilted line, higher at the front', () => {
    const level = { height: 0.86, tilt: 0.25 };
    const front = bodyPoint(directionAt(0, elevationAtLevel(bodyPoint, 0, level))).point;
    const back = bodyPoint(directionAt(Math.PI, elevationAtLevel(bodyPoint, Math.PI, level))).point;
    expect(front.y - 0.25 * front.z).toBeCloseTo(0.86, 4);
    expect(front.y).toBeGreaterThan(back.y + 0.05);
  });
});

describe('bodyBand', () => {
  const shirt = CLOTHES.shirt;
  const band = bodyBand(bodyPoint, { ...shirt, rows: 6, columns: 16 });

  it('makes a grid of (rows + 1) × (columns + 1) points', () => {
    expect(band.positions.length).toBe(7 * 17 * 3);
    expect(band.normals.length).toBe(band.positions.length);
    expect(band.uvs.length).toBe(7 * 17 * 2);
    expect(band.indices.length).toBe(6 * 16 * 6);
    expect(band.bottom.length).toBe(17);
    expect(band.top.length).toBe(17);
  });

  it('runs between the two levels', () => {
    const skin = bodyBand(bodyPoint, { ...shirt, offset: 0, rows: 6, columns: 16 });
    /** @param {{ y: number, z: number }} p @param {{ height: number, tilt: number }} level */
    const levelOf = (p, level) => p.y - level.tilt * p.z;
    for (const p of skin.top) expect(levelOf(p, shirt.to)).toBeCloseTo(shirt.to.height, 4);
    for (const p of skin.bottom) expect(levelOf(p, shirt.from)).toBeCloseTo(shirt.from.height, 4);
  });

  it('dips at the front of the neckline, below the smile', () => {
    const front = band.top[8]; // halfway round from the back
    const back = band.top[0];
    expect(front.y).toBeLessThan(0.5);
    expect(back.y).toBeGreaterThan(front.y + 0.15);
  });

  it('sits just outside the skin', () => {
    const skin = bodyBand(bodyPoint, { ...shirt, offset: 0, rows: 6, columns: 16 });
    for (let i = 0; i < skin.positions.length; i += 3) {
      const moved = Math.hypot(
        band.positions[i] - skin.positions[i],
        band.positions[i + 1] - skin.positions[i + 1],
        band.positions[i + 2] - skin.positions[i + 2],
      );
      expect(moved).toBeCloseTo(shirt.offset, 6);
    }
  });

  it('closes up at the back: the first and last columns meet', () => {
    const first = band.bottom[0];
    const last = band.bottom[16];
    expect(last.x).toBeCloseTo(first.x, 6);
    expect(last.z).toBeCloseTo(first.z, 6);
  });

  it('winds its triangles clockwise seen from outside (Babylon’s front faces)', () => {
    const { positions, normals, indices } = band;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map((k) => vec(positions, k));
      const n = vec(normals, indices[i]);
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const cross = {
        x: ab.y * ac.z - ab.z * ac.y,
        y: ab.z * ac.x - ab.x * ac.z,
        z: ab.x * ac.y - ab.y * ac.x,
      };
      expect(cross.x * n.x + cross.y * n.y + cross.z * n.z).toBeLessThan(0);
    }
  });

  it('reaches the very bottom with no lower level (shorts), and the top with none (hats)', () => {
    const shorts = bodyBand(bodyPoint, { ...CLOTHES.shorts, from: null, rows: 4, columns: 8 });
    expect(Math.min(...shorts.bottom.map((p) => p.y))).toBeLessThan(0.06);
    const crown = bodyBand(bodyPoint, {
      from: CLOTHES.hats.cap.line,
      to: null,
      offset: 0.03,
      rows: 4,
      columns: 8,
    });
    expect(Math.min(...crown.top.map((p) => p.y))).toBeGreaterThan(1);
  });
});

describe('furCover', () => {
  it('hides nothing when nothing is worn', () => {
    expect(furCover(DEFAULT_OUTFIT)).toEqual({ band: null, cap: null });
  });

  it('hides the fur under a shirt, shorts or both', () => {
    const shirt = cycleStyle(DEFAULT_OUTFIT, 'shirt', 1);
    const shorts = cycleStyle(DEFAULT_OUTFIT, 'shorts', 1);
    const both = cycleStyle(shirt, 'shorts', 1);
    expect(furCover(shirt).band).toEqual({ from: CLOTHES.shirt.from, to: CLOTHES.shirt.to });
    expect(furCover(shorts).band?.from.height).toBeLessThan(0);
    expect(furCover(shorts).band?.to).toEqual(CLOTHES.shorts.to);
    expect(furCover(both).band?.from.height).toBeLessThan(0);
    expect(furCover(both).band?.to).toEqual(CLOTHES.shirt.to);
  });

  it('hides the fur under a hat', () => {
    const cap = cycleStyle(DEFAULT_OUTFIT, 'hat', 1);
    expect(furCover(cap).cap).toEqual(CLOTHES.hats.cap.line);
  });

  it('knows where every hat sits', () => {
    let outfit = cycleStyle(DEFAULT_OUTFIT, 'hat', 1);
    while (outfit.hat.style !== 'none') {
      expect(furCover(outfit).cap).not.toBeNull();
      outfit = cycleStyle(outfit, 'hat', 1);
    }
  });
});

describe('starOutline', () => {
  it('alternates tips and notches, starting at the top', () => {
    const star = starOutline(5, 1, 0.5);
    expect(star).toHaveLength(10);
    expect(star[0].x).toBeCloseTo(0);
    expect(star[0].y).toBeCloseTo(1);
    star.forEach((p, i) => expect(Math.hypot(p.x, p.y)).toBeCloseTo(i % 2 ? 0.5 : 1));
  });
});
