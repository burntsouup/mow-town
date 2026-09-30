import { describe, expect, it } from 'vitest';
import { grassVariationData, tileableNoise } from './grassNoise.js';

describe('tileableNoise', () => {
  it('stays in 0..1 and repeats every period', () => {
    const noise = tileableNoise(4, 6);
    for (let i = 0; i < 200; i++) {
      const x = (i * 0.731) % 17;
      const y = (i * 1.37) % 23;
      const value = noise(x, y);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(noise(x + 6, y)).toBeCloseTo(value, 9);
      expect(noise(x, y - 12)).toBeCloseTo(value, 9);
    }
  });

  it('is smooth: nearby points have nearby values', () => {
    const noise = tileableNoise(9, 8);
    for (let x = 0; x < 8; x += 0.05) {
      expect(Math.abs(noise(x + 0.01, 2.3) - noise(x, 2.3))).toBeLessThan(0.05);
    }
  });
});

describe('grassVariationData', () => {
  const size = 64;
  const data = grassVariationData(size, 5);
  /** @param {number} x @param {number} y @param {number} channel */
  const at = (x, y, channel) => data[(y * size + x) * 4 + channel];

  it('fills every pixel of every channel', () => {
    expect(data).toHaveLength(size * size * 4);
    for (let channel = 0; channel < 4; channel++) {
      const values = Array.from({ length: size }, (_, x) => at(x, 7, channel));
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(10); // not flat
    }
  });

  it('tiles: the right edge runs on into the left, and the bottom into the top', () => {
    for (let channel = 0; channel < 4; channel++) {
      // The step across the seam is no bigger than steps elsewhere in the texture.
      let biggest = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 1; x < size; x++) {
          biggest = Math.max(biggest, Math.abs(at(x, y, channel) - at(x - 1, y, channel)));
        }
      }
      for (let i = 0; i < size; i++) {
        expect(Math.abs(at(0, i, channel) - at(size - 1, i, channel))).toBeLessThanOrEqual(
          biggest + 1,
        );
        expect(Math.abs(at(i, 0, channel) - at(i, size - 1, channel))).toBeLessThanOrEqual(
          biggest + 1,
        );
      }
    }
  });
});
