import { describe, expect, it } from 'vitest';
import { smoothTowards } from './audioMix.js';

describe('smoothTowards', () => {
  it('moves part of the way toward the target', () => {
    const next = smoothTowards(0, 10, 0.016, 10);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
  });

  it('is frame-rate independent', () => {
    const oneStep = smoothTowards(0, 10, 0.1, 10);
    const twoSteps = smoothTowards(smoothTowards(0, 10, 0.05, 10), 10, 0.05, 10);
    expect(twoSteps).toBeCloseTo(oneStep, 10);
  });
});
