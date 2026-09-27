import { describe, expect, it } from 'vitest';
import { fullRect, unionRect } from './rect.js';

describe('unionRect', () => {
  it('covers both rectangles', () => {
    expect(
      unionRect({ minX: 1, minY: 5, maxX: 3, maxY: 6 }, { minX: 2, minY: 0, maxX: 8, maxY: 2 }),
    ).toEqual({ minX: 1, minY: 0, maxX: 8, maxY: 6 });
  });

  it('treats null as nothing', () => {
    const rect = { minX: 1, minY: 2, maxX: 3, maxY: 4 };
    expect(unionRect(null, rect)).toEqual(rect);
    expect(unionRect(rect, null)).toEqual(rect);
    expect(unionRect(null, null)).toBeNull();
  });

  it('returns a copy, never one of its inputs', () => {
    const rect = { minX: 1, minY: 2, maxX: 3, maxY: 4 };
    expect(unionRect(rect, null)).not.toBe(rect);
  });
});

describe('fullRect', () => {
  it('covers every texel of the grid', () => {
    expect(fullRect(256, 512)).toEqual({ minX: 0, minY: 0, maxX: 255, maxY: 511 });
  });
});
