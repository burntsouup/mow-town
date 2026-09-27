import { describe, expect, it } from 'vitest';
import {
  aimDirection,
  fanAxes,
  groundDistance,
  sprayAtDistance,
  sprayFootprint,
} from './sprayMath.js';

const settings = { nozzleRadius: 0.06, spreadPerMeter: 0.07, fullStrengthRange: 1.2, maxRange: 6 };

describe('sprayAtDistance', () => {
  it('is a tight spot at the nozzle that widens with distance', () => {
    expect(sprayAtDistance(0, settings).radius).toBeCloseTo(0.06);
    expect(sprayAtDistance(2, settings).radius).toBeCloseTo(0.2);
    expect(sprayAtDistance(4, settings).radius).toBeGreaterThan(
      sprayAtDistance(2, settings).radius,
    );
  });

  it('is full strength up close, fades with distance, and stops at max range', () => {
    expect(sprayAtDistance(1, settings).strength).toBe(1);
    expect(sprayAtDistance(3.6, settings).strength).toBeCloseTo(0.5);
    expect(sprayAtDistance(6, settings).strength).toBe(0);
    expect(sprayAtDistance(10, settings).strength).toBe(0);
  });

  it('never gets stronger as you move away', () => {
    let previous = Infinity;
    for (let d = 0; d <= 7; d += 0.25) {
      const { strength } = sprayAtDistance(d, settings);
      expect(strength).toBeLessThanOrEqual(previous);
      previous = strength;
    }
  });

  it('treats negative distances as zero', () => {
    expect(sprayAtDistance(-1, settings)).toEqual(sprayAtDistance(0, settings));
  });
});

describe('aimDirection', () => {
  const forward = { x: 0, y: 0, z: 1 };

  it('points from the gun to the target as a unit vector', () => {
    const direction = aimDirection({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 4 }, forward, 0.5);
    expect(direction.x).toBeCloseTo(0.6);
    expect(direction.z).toBeCloseTo(0.8);
    expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1);
  });

  it('uses the camera direction when the target is too close to the gun', () => {
    expect(aimDirection({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0.2 }, forward, 0.5)).toEqual(
      forward,
    );
  });

  it('uses the camera direction when the target is behind the gun', () => {
    expect(aimDirection({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -3 }, forward, 0.5)).toEqual(
      forward,
    );
  });
});

describe('groundDistance', () => {
  it('ignores height', () => {
    expect(groundDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 10, z: 4 })).toBe(5);
  });
});

describe('fanAxes', () => {
  const forward = { x: 0, y: 0, z: 1 };
  const right = { x: 1, y: 0, z: 0 };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

  it('spreads a horizontal fan left-right, and a vertical one up-down', () => {
    expect(fanAxes(forward, right, false).wide.x).toBeCloseTo(1);
    expect(Math.abs(fanAxes(forward, right, true).wide.y)).toBeCloseTo(1);
  });

  it('keeps both axes at right angles to the spray and to each other, even straight down', () => {
    const down = { x: 0, y: -1, z: 0 };
    for (const d of [forward, down, { x: 0.6, y: -0.8, z: 0 }]) {
      const { wide, thin } = fanAxes(d, right, false);
      expect(dot(wide, d)).toBeCloseTo(0);
      expect(dot(thin, d)).toBeCloseTo(0);
      expect(dot(wide, thin)).toBeCloseTo(0);
      expect(Math.hypot(wide.x, wide.y, wide.z)).toBeCloseTo(1);
    }
  });
});

describe('sprayFootprint', () => {
  const ground = {
    normal: { x: 0, y: 1, z: 0 },
    uAxis: { x: 1, y: 0, z: 0 },
    vAxis: { x: 0, y: 0, z: 1 },
  };
  const base = { radius: 0.3, flatness: 0.25, maxStretch: 3, ...ground };
  const down = { x: 0, y: -1, z: 0 };

  it('is the fan shape, same area as a round spot, when spraying straight down', () => {
    const spot = sprayFootprint({
      ...base,
      sprayDirection: down,
      wide: { x: 1, y: 0, z: 0 },
      thin: { x: 0, y: 0, z: 1 },
    });
    expect(spot.radiusX).toBeCloseTo(0.6); // 0.3 / √0.25
    expect(spot.radiusY).toBeCloseTo(0.15); // 0.3 × √0.25
    expect(Math.abs(Math.sin(spot.angle))).toBeCloseTo(0); // wide along u
    expect(spot.radiusX * spot.radiusY).toBeCloseTo(0.3 * 0.3);
    expect(spot.density).toBeCloseTo(1);
  });

  it('turns with the fan', () => {
    const spot = sprayFootprint({
      ...base,
      sprayDirection: down,
      wide: { x: 0, y: 0, z: 1 },
      thin: { x: 1, y: 0, z: 0 },
    });
    expect(Math.abs(Math.cos(spot.angle))).toBeCloseTo(0); // wide along v now
  });

  it('stretches along the spray when hitting at an angle, spreading the water thinner', () => {
    const angled = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }; // 45° onto the ground
    const { wide, thin } = fanAxes(angled, { x: 1, y: 0, z: 0 }, false);
    const spot = sprayFootprint({ ...base, sprayDirection: angled, wide, thin });
    expect(spot.radiusX).toBeCloseTo(0.6); // wide axis runs across: not stretched
    expect(spot.radiusY).toBeCloseTo(0.15 * Math.SQRT2); // thin axis stretched by 1/sin 45°
    expect(spot.density).toBeCloseTo(Math.SQRT1_2);
  });

  it('never stretches beyond maxStretch, even at a glancing angle', () => {
    const glancing = { x: 0, y: -0.02, z: 0.9998 };
    const { wide, thin } = fanAxes(glancing, { x: 1, y: 0, z: 0 }, true);
    const spot = sprayFootprint({ ...base, sprayDirection: glancing, wide, thin });
    expect(Math.max(spot.radiusX, spot.radiusY)).toBeLessThanOrEqual(0.3 * 3 + 1e-9);
    expect(spot.density).toBeGreaterThan(0);
    expect(spot.density).toBeLessThanOrEqual(1);
  });
});
