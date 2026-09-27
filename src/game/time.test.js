import { describe, expect, it } from 'vitest';
import { toDeltaSeconds } from './time.js';

describe('toDeltaSeconds', () => {
  const max = 1 / 30;

  it('converts milliseconds to seconds', () => {
    expect(toDeltaSeconds(16, max)).toBeCloseTo(0.016);
  });

  it('clamps long frames to the maximum step', () => {
    expect(toDeltaSeconds(5000, max)).toBe(max);
  });

  it('returns 0 for zero, negative, or invalid input', () => {
    expect(toDeltaSeconds(0, max)).toBe(0);
    expect(toDeltaSeconds(-10, max)).toBe(0);
    expect(toDeltaSeconds(Number.NaN, max)).toBe(0);
    expect(toDeltaSeconds(Number.POSITIVE_INFINITY, max)).toBe(0);
  });
});
