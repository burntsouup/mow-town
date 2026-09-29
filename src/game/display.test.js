import { describe, expect, it } from 'vitest';
import { pixelRatioFor, refreshRateFrom } from './display.js';

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
