import { describe, expect, it } from 'vitest';
import { DIRT_TYPE } from './DirtMask.js';
import {
  DIRT_LEVELS,
  drivewayDirt,
  FENCE_BOARD,
  fenceDirt,
  PATIO_PAVER,
  paverAt,
  patioDirt,
} from './dirtPatterns.js';
import { createRandom, createValueNoise, fractalNoise, smoothstep } from './noise.js';

describe('createRandom', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });

  it('gives different sequences for different seeds, always in [0, 1)', () => {
    const a = createRandom(1);
    const b = createRandom(2);
    const values = Array.from({ length: 1000 }, a);
    expect(values[0]).not.toBe(b());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});

describe('createValueNoise', () => {
  const noise = createValueNoise(7);

  it('stays in [0, 1], including negative coordinates', () => {
    for (let i = 0; i < 500; i++) {
      const value = noise(i * 0.37 - 90, i * -0.61 + 20);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('is smooth: nearby points have nearby values', () => {
    expect(Math.abs(noise(3.2, 4.7) - noise(3.21, 4.7))).toBeLessThan(0.05);
  });

  it('fractal noise also stays in [0, 1]', () => {
    for (let i = 0; i < 200; i++) {
      const value = fractalNoise(noise, i * 0.9, i * 0.4, 4);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('smoothstep', () => {
  it('is 0 below, 1 above, and 0.5 halfway', () => {
    expect(smoothstep(1, 2, 0)).toBe(0);
    expect(smoothstep(1, 2, 3)).toBe(1);
    expect(smoothstep(1, 2, 1.5)).toBeCloseTo(0.5);
  });
});

describe('drivewayDirt', () => {
  const width = 5;
  const length = 10;
  const step = 0.05; // sample every 5 cm

  /** Samples the pattern on a grid and returns [{ x, y, dirt, type }]. */
  function sample(seed) {
    const { dirtAt, typeAt } = drivewayDirt({ width, length, seed });
    const samples = [];
    for (let y = step / 2; y < length; y += step) {
      for (let x = step / 2; x < width; x += step) {
        samples.push({ x, y, dirt: dirtAt(x, y), type: typeAt(x, y) });
      }
    }
    return samples;
  }
  const samples = sample(1);
  const average = (list) => list.reduce((sum, s) => sum + s.dirt, 0) / list.length;

  it('is the same every time for the same seed, and different for another seed', () => {
    const again = sample(1);
    const other = sample(2);
    expect(again.map((s) => s.dirt)).toEqual(samples.map((s) => s.dirt));
    expect(other.map((s) => s.dirt)).not.toEqual(samples.map((s) => s.dirt));
  });

  it('stays in 0..1 and leaves no spot already clean', () => {
    const values = samples.map((s) => s.dirt);
    expect(Math.min(...values)).toBeGreaterThan(0.1);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
  });

  it('contains all four dirt levels', () => {
    const near = (level, tolerance) =>
      samples.filter((s) => Math.abs(s.dirt - level) <= tolerance).length;
    expect(near(DIRT_LEVELS.light, 0.1)).toBeGreaterThan(samples.length * 0.3); // most of it
    expect(near(DIRT_LEVELS.dirty, 0.1)).toBeGreaterThan(100);
    expect(near(DIRT_LEVELS.heavy, 0.1)).toBeGreaterThan(20);
    expect(near(DIRT_LEVELS.extreme, 0.05)).toBeGreaterThan(20);
  });

  it('is grimier along the edges than in the middle, and grimiest in the corners', () => {
    const corners = samples.filter(
      (s) => Math.min(s.x, width - s.x) < 0.2 && Math.min(s.y, length - s.y) < 0.2,
    );
    const edges = samples.filter(
      (s) => Math.min(s.x, width - s.x) < 0.1 && Math.min(s.y, length - s.y) > 1,
    );
    const middle = samples.filter((s) => Math.abs(s.x - 1.2) < 0.2 && Math.abs(s.y - 5) < 2);
    expect(average(edges)).toBeGreaterThan(average(middle));
    expect(average(corners)).toBeGreaterThan(average(edges));
  });

  it('puts the oil stains (the extreme dirt) near the garage end', () => {
    const extreme = samples.filter((s) => s.dirt > 0.95);
    expect(extreme.length).toBeGreaterThan(0);
    for (const s of extreme) expect(s.y).toBeGreaterThan(length / 2);
  });

  it('grows some moss, but only a small part of the driveway', () => {
    const moss = samples.filter((s) => s.type === DIRT_TYPE.moss);
    expect(moss.length).toBeGreaterThan(20);
    expect(moss.length).toBeLessThan(samples.length * 0.1);
  });

  it('grows moss only around the middle joint or along the edges in the garage-end half', () => {
    for (const s of samples.filter((s) => s.type === DIRT_TYPE.moss)) {
      const nearJoint = Math.abs(s.y - length / 2) < 0.2;
      const onShadyEdge = Math.min(s.x, width - s.x) < 0.65 && s.y > length * 0.3;
      expect(nearJoint || onShadyEdge).toBe(true);
    }
  });

  it('makes moss thick (it is tough and worth a lot)', () => {
    for (const s of samples.filter((s) => s.type === DIRT_TYPE.moss)) {
      expect(s.dirt).toBeGreaterThan(0.3);
    }
  });
});

describe('fenceDirt', () => {
  const width = 24;
  const height = 1.6;
  const { dirtAt, typeAt } = fenceDirt({ height, seed: 4 });
  const samples = [];
  for (let y = 0.01; y < height; y += 0.04) {
    for (let x = 0.003; x < width; x += 0.037) {
      samples.push({ x, y, dirt: dirtAt(x, y), type: typeAt(x, y) });
    }
  }
  const average = (list) => list.reduce((sum, s) => sum + s.dirt, 0) / list.length;

  it('weathers the whole fence (nothing starts clean) and stays in 0..1', () => {
    const values = samples.map((s) => s.dirt);
    expect(Math.min(...values)).toBeGreaterThan(0.2);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
  });

  it('is muddiest along the bottom', () => {
    const bottom = samples.filter((s) => s.y < 0.15);
    const middle = samples.filter((s) => s.y > 0.6 && s.y < 1);
    expect(average(bottom)).toBeGreaterThan(average(middle) + 0.15);
  });

  it('keeps grime in the gaps between boards', () => {
    const inGap = (s) => s.x % FENCE_BOARD.width < FENCE_BOARD.gap;
    const gaps = samples.filter((s) => inGap(s) && s.y > 0.6);
    const boards = samples.filter((s) => !inGap(s) && s.y > 0.6);
    expect(average(gaps)).toBeGreaterThan(average(boards));
  });

  it('grows moss only along the bottom edge', () => {
    const moss = samples.filter((s) => s.type === DIRT_TYPE.moss);
    expect(moss.length).toBeGreaterThan(20);
    for (const s of moss) expect(s.y).toBeLessThan(0.3);
  });

  it('is the same every time for the same seed', () => {
    const again = fenceDirt({ height, seed: 4 });
    expect(again.dirtAt(3.3, 0.7)).toBe(dirtAt(3.3, 0.7));
  });
});

describe('paverAt', () => {
  const module = PATIO_PAVER.size + PATIO_PAVER.joint;

  it('finds the joints between pavers', () => {
    expect(paverAt(0.01, 0.2).inJoint).toBe(true); // in the vertical joint at x = 0
    expect(paverAt(0.2, 0.01).inJoint).toBe(true); // in the horizontal joint at y = 0
    expect(paverAt(0.25, 0.25).inJoint).toBe(false); // the middle of a paver
  });

  it('shifts every other row by half a paver (a running bond)', () => {
    const y = module * 1.5; // middle of the second row
    expect(paverAt(0.01, y).inJoint).toBe(false); // the joint moved away from x = 0...
    expect(paverAt(module / 2 + 0.01, y).inJoint).toBe(true); // ...to half a paver across
  });
});

describe('patioDirt', () => {
  const width = 6;
  const length = 4;
  const { dirtAt, typeAt } = patioDirt({ width, length, seed: 6 });
  const samples = [];
  for (let y = 0.005; y < length; y += 0.013) {
    for (let x = 0.005; x < width; x += 0.013) {
      samples.push({ x, y, dirt: dirtAt(x, y), type: typeAt(x, y), joint: paverAt(x, y).inJoint });
    }
  }
  const average = (list) => list.reduce((sum, s) => sum + s.dirt, 0) / list.length;

  it('packs grime into the joints', () => {
    const joints = samples.filter((s) => s.joint);
    const pavers = samples.filter((s) => !s.joint);
    expect(average(joints)).toBeGreaterThan(average(pavers) + 0.2);
  });

  it('grows moss only in the joints, mostly near the house', () => {
    const moss = samples.filter((s) => s.type === DIRT_TYPE.moss);
    expect(moss.length).toBeGreaterThan(100);
    for (const s of moss) expect(s.joint).toBe(true);
    const nearHouse = moss.filter((s) => s.y < length / 2).length;
    expect(nearHouse).toBeGreaterThan(moss.length - nearHouse);
  });

  it('has a greasy barbecue spot (the dirtiest dirt)', () => {
    expect(samples.some((s) => s.dirt > 0.95 && !s.joint)).toBe(true);
  });

  it('leaves nothing clean to start with', () => {
    // (reduce, not Math.min(...array): spreading ~140k values overflows the call stack)
    const lowest = samples.reduce((min, s) => Math.min(min, s.dirt), Infinity);
    expect(lowest).toBeGreaterThan(0.1);
  });
});
