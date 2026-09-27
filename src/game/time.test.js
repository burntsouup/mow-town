import { describe, expect, it } from 'vitest';
import { FixedTicker, toDeltaSeconds } from './time.js';

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

describe('FixedTicker', () => {
  it('ticks once per step-length frame, at the end of the frame', () => {
    const ticker = new FixedTicker(1 / 60);
    expect(ticker.advance(1 / 60)).toEqual([1]);
  });

  it('spreads several ticks through a long frame', () => {
    const ticker = new FixedTicker(1 / 60);
    const fractions = ticker.advance(1 / 30);
    expect(fractions).toHaveLength(2);
    expect(fractions[0]).toBeCloseTo(0.5);
    expect(fractions[1]).toBeCloseTo(1);
  });

  it('carries leftover time into the next frame', () => {
    const ticker = new FixedTicker(1 / 60);
    expect(ticker.advance(1 / 120)).toEqual([]);
    const fractions = ticker.advance(1 / 120);
    expect(fractions).toHaveLength(1);
    expect(fractions[0]).toBeCloseTo(1);
  });

  it('makes the same number of ticks at any frame rate', () => {
    for (const fps of [30, 60, 75, 120, 144]) {
      const ticker = new FixedTicker(1 / 60);
      let ticks = 0;
      for (let frame = 0; frame < fps * 10; frame++) ticks += ticker.advance(1 / fps).length;
      expect(ticks, `at ${fps} fps`).toBe(600);
    }
  });

  it('ignores empty or invalid frames', () => {
    const ticker = new FixedTicker(1 / 60);
    expect(ticker.advance(0)).toEqual([]);
    expect(ticker.advance(Number.NaN)).toEqual([]);
    expect(ticker.accumulator).toBe(0);
  });
});
