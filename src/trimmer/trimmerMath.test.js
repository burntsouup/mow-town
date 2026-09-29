import { describe, expect, it } from 'vitest';
import { groundAim, sweepTowards, withinReach } from './trimmerMath.js';

describe('groundAim', () => {
  it('finds where a downward view meets the ground', () => {
    // From 2 m up, looking 45° down toward +z: the ground is 2 m ahead.
    const down45 = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 };
    const aim = groundAim({ x: 1, y: 2, z: 0 }, down45, 20);
    expect(aim.x).toBeCloseTo(1);
    expect(aim.z).toBeCloseTo(2);
  });

  it('looking level or up, aims far out along the view instead', () => {
    expect(groundAim({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 20)).toEqual({ x: 20, z: 0 });
    const up = groundAim({ x: 0, y: 2, z: 0 }, { x: 0, y: 0.6, z: 0.8 }, 20);
    expect(up.x).toBeCloseTo(0);
    expect(up.z).toBeCloseTo(20);
  });

  it('never aims further than `far`, even at a shallow angle', () => {
    const shallow = { x: 0, y: -0.01, z: Math.sqrt(1 - 0.0001) };
    expect(groundAim({ x: 0, y: 2, z: 0 }, shallow, 20).z).toBeCloseTo(20);
  });
});

describe('withinReach', () => {
  const reach = { min: 0.6, max: 1.3 };
  const feet = { x: 5, z: 5 };

  it('leaves an aim within reach alone', () => {
    expect(withinReach(feet, { x: 5, z: 6 }, reach, 0)).toEqual({ x: 5, z: 6 });
  });

  it('pulls a far aim in, and pushes a close one out, along the same direction', () => {
    const far = withinReach(feet, { x: 15, z: 5 }, reach, 0);
    expect(far.x).toBeCloseTo(6.3);
    expect(far.z).toBeCloseTo(5);
    const close = withinReach(feet, { x: 5, z: 4.9 }, reach, 0);
    expect(close.x).toBeCloseTo(5);
    expect(close.z).toBeCloseTo(4.4);
  });

  it('reaches the way you face when the aim is right at your feet', () => {
    const ahead = withinReach(feet, feet, reach, Math.PI / 2); // facing +x
    expect(ahead.x).toBeCloseTo(5.6);
    expect(ahead.z).toBeCloseTo(5);
  });
});

describe('sweepTowards', () => {
  const settings = { follow: 12, maxSpeed: 3 };

  it('moves part of the way, easing in as it gets close', () => {
    const near = sweepTowards({ x: 0, z: 0 }, { x: 0.1, z: 0 }, 1 / 60, settings);
    expect(near.x).toBeGreaterThan(0);
    expect(near.x).toBeLessThan(0.1);
  });

  it('never swings faster than maxSpeed', () => {
    const next = sweepTowards({ x: 0, z: 0 }, { x: 0, z: 10 }, 0.1, settings);
    expect(next.z).toBeCloseTo(0.3);
  });

  it('arrives and stays put', () => {
    let head = { x: 0, z: 0 };
    for (let i = 0; i < 300; i++) head = sweepTowards(head, { x: 1, z: 1 }, 1 / 60, settings);
    expect(head.x).toBeCloseTo(1, 4);
    expect(sweepTowards({ x: 1, z: 1 }, { x: 1, z: 1 }, 1 / 60, settings)).toEqual({ x: 1, z: 1 });
  });
});
