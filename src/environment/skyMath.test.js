import { describe, expect, it } from 'vitest';
import { createRandom } from '../math/noise.js';
import { cloudBlobs, hillRing, skyColor } from './skyMath.js';

const SKY = {
  zenith: /** @type {[number, number, number]} */ ([0.2, 0.5, 0.9]),
  horizon: /** @type {[number, number, number]} */ ([0.85, 0.9, 0.95]),
  glow: /** @type {[number, number, number]} */ ([1, 0.9, 0.7]),
  sunSize: 0.02,
};
const SUN = { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 };
const AWAY = { x: 0, y: 0, z: -1 };

describe('skyColor', () => {
  it('is the horizon color at (and below) the horizon, away from the sun', () => {
    expect(skyColor(AWAY, SUN, SKY)).toEqual(SKY.horizon);
    expect(skyColor({ x: 0, y: -1, z: 0 }, SUN, SKY)).toEqual(SKY.horizon);
  });

  it('turns to the zenith color overhead, bluer as you look up', () => {
    const overhead = skyColor({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, SKY);
    overhead.forEach((c, i) => expect(c).toBeCloseTo(SKY.zenith[i]));
    const low = skyColor({ x: -0.95, y: 0.3, z: 0 }, SUN, SKY);
    const high = skyColor({ x: -0.3, y: 0.95, z: 0 }, SUN, SKY);
    expect(high[2] - high[0]).toBeGreaterThan(low[2] - low[0]);
  });

  it('glows round the sun, and is brightest of all on its disc', () => {
    const near = skyColor({ x: 0.2, y: 0.69, z: 0.69 }, SUN, SKY);
    const far = skyColor({ x: 0.9, y: 0.3, z: -0.3 }, SUN, SKY);
    const disc = skyColor(SUN, SUN, SKY);
    expect(near[0]).toBeGreaterThan(far[0]);
    expect(disc[0]).toBeGreaterThan(1.5);
    expect(near[0]).toBeLessThan(disc[0]);
  });
});

describe('cloudBlobs', () => {
  it('keeps every blob inside its box (twice as wide as it is tall)', () => {
    const random = createRandom(3);
    for (let n = 0; n < 20; n++) {
      const blobs = cloudBlobs(random, 3 + (n % 4));
      for (const { x, y, radius } of blobs) {
        expect(x - radius / 2).toBeGreaterThanOrEqual(0);
        expect(x + radius / 2).toBeLessThanOrEqual(1);
        expect(y - radius).toBeGreaterThanOrEqual(0);
        expect(y + radius).toBeLessThanOrEqual(1);
      }
    }
  });

  it('piles up highest in the middle, with puffs on top of each heap', () => {
    const blobs = cloudBlobs(createRandom(8), 5);
    expect(blobs).toHaveLength(15); // each heap and its two puffs
    const top = (/** @type {{ y: number, radius: number }} */ b) => b.y - b.radius;
    const heaps = blobs.filter((_, i) => i % 3 === 0);
    expect(top(heaps[2])).toBeLessThan(Math.min(top(heaps[0]), top(heaps[4])));
  });
});

describe('hillRing', () => {
  const ring = hillRing({
    radius: 150,
    depth: 40,
    height: 20,
    steps: 32,
    noise: (angle) => 0.5 + 0.5 * Math.sin(angle * 3),
    foot: [0.8, 0.85, 0.9],
    top: [0.5, 0.6, 0.5],
  });

  it('goes all the way round: a foot and a crest at every step, closing up', () => {
    expect(ring.positions).toHaveLength(33 * 2 * 3);
    expect(ring.indices).toHaveLength(32 * 6);
    const [x0, , z0] = ring.positions.slice(0, 3);
    const [x1, , z1] = ring.positions.slice(-6, -3);
    expect(x1).toBeCloseTo(x0, 6);
    expect(z1).toBeCloseTo(z0, 6);
  });

  it('keeps its feet below the ground and its crests up to the height, further out', () => {
    for (let i = 0; i < ring.positions.length; i += 6) {
      const [fx, fy, fz, cx, cy, cz] = ring.positions.slice(i, i + 6);
      expect(fy).toBeLessThan(0);
      expect(cy).toBeGreaterThan(0);
      expect(cy).toBeLessThanOrEqual(20);
      expect(Math.hypot(cx, cz)).toBeGreaterThan(Math.hypot(fx, fz));
    }
  });
});
