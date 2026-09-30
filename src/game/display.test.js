import { describe, expect, it } from 'vitest';
import { isStruggling, lowerPixelRatio, pixelRatioFor, refreshRateFrom } from './display.js';

describe('refreshRateFrom', () => {
  it('finds the refresh rate from frame times, ignoring the odd hitch', () => {
    expect(refreshRateFrom([16.7, 16.6, 16.7, 50, 16.7])).toBeCloseTo(59.9, 0);
    expect(refreshRateFrom([8.3, 8.4, 8.3, 8.4])).toBeCloseTo(119.8, 0);
  });

  it('gives up (0) with nothing to go on', () => {
    expect(refreshRateFrom([])).toBe(0);
    expect(refreshRateFrom([0, NaN, -3])).toBe(0);
  });
});

describe('pixelRatioFor', () => {
  const settings = { maxPixelRatio: 2, highRefreshAbove: 75, highRefreshPixelRatio: 1.5 };

  it("uses the screen's own sharpness at 60 Hz, up to the cap", () => {
    expect(pixelRatioFor(2, 60, settings)).toBe(2);
    expect(pixelRatioFor(1, 60, settings)).toBe(1);
    expect(pixelRatioFor(3, 60, settings)).toBe(2); // a phone
  });

  it('renders a little softer on fast screens', () => {
    expect(pixelRatioFor(2, 120, settings)).toBe(1.5);
    expect(pixelRatioFor(1.25, 144, settings)).toBe(1.25); // already below the cap
  });

  it('copes with a missing ratio, and never goes below half', () => {
    expect(pixelRatioFor(0, 60, settings)).toBe(1);
    expect(pixelRatioFor(2, 60, { ...settings, maxPixelRatio: 0.1 })).toBe(0.5);
  });
});

describe('isStruggling', () => {
  const settings = { slowFactor: 1.4, slowShare: 0.25 };
  const frames = (/** @type {number} */ ms, /** @type {number} */ count) =>
    Array.from({ length: count }, () => ms);

  it('is fine keeping up with the screen', () => {
    expect(isStruggling(frames(8.3, 120), 120, settings)).toBe(false);
    expect(isStruggling(frames(16.7, 120), 60, settings)).toBe(false);
  });

  it('struggles when many frames miss', () => {
    // A 120 Hz screen, but every other frame takes two refreshes.
    const missing = frames(8.3, 60).flatMap((ms) => [ms, 16.7]);
    expect(isStruggling(missing, 120, settings)).toBe(true);
  });

  it('ignores a few slow frames and long hitches', () => {
    const someSlow = [...frames(8.3, 100), ...frames(16.7, 10)];
    expect(isStruggling(someSlow, 120, settings)).toBe(false);
    const hitches = [...frames(8.3, 100), ...frames(400, 40)];
    expect(isStruggling(hitches, 120, settings)).toBe(false);
  });

  it('needs enough frames to judge, and a known screen', () => {
    expect(isStruggling(frames(30, 10), 120, settings)).toBe(false);
    expect(isStruggling(frames(30, 120), 0, settings)).toBe(false);
  });
});

describe('lowerPixelRatio', () => {
  const settings = { step: 0.25, minPixelRatio: 1 };

  it('steps down, but not below the floor', () => {
    expect(lowerPixelRatio(1.5, settings)).toBe(1.25);
    expect(lowerPixelRatio(1.1, settings)).toBe(1);
    expect(lowerPixelRatio(1, settings)).toBe(1);
  });

  it('never goes up (a screen already below the floor stays put)', () => {
    expect(lowerPixelRatio(0.75, settings)).toBe(0.75);
  });
});
