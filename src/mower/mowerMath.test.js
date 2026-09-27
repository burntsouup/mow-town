import { describe, expect, it } from 'vitest';
import { steerTowards, updateMotion } from './mowerMath.js';

const SETTINGS = {
  pushSpeed: 1.4,
  pullSpeed: 0.8,
  acceleration: 2,
  braking: 4,
  turnSpeed: 1.6,
  turnAcceleration: 6,
};
const DT = 1 / 60;
const STILL = { speed: 0, yawRate: 0 };

/**
 * Runs the handling for a while with fixed controls.
 *
 * @param {{ speed: number, yawRate: number }} motion
 * @param {{ throttle: number, turn: number }} controls
 * @param {number} seconds
 * @param {number} [speedFactor]
 */
function hold(motion, controls, seconds, speedFactor) {
  let m = motion;
  for (let t = 0; t < seconds - 1e-9; t += DT)
    m = updateMotion(m, controls, SETTINGS, DT, speedFactor);
  return m;
}

describe('updateMotion', () => {
  it('takes a moment to get rolling, then holds push speed', () => {
    expect(hold(STILL, { throttle: 1, turn: 0 }, 0.2).speed).toBeLessThan(0.5);
    expect(hold(STILL, { throttle: 1, turn: 0 }, 2).speed).toBeCloseTo(1.4);
  });

  it('coasts to a stop instead of halting instantly', () => {
    const rolling = { speed: 1.4, yawRate: 0 };
    expect(hold(rolling, { throttle: 0, turn: 0 }, 0.1).speed).toBeGreaterThan(0.9);
    expect(hold(rolling, { throttle: 0, turn: 0 }, 1).speed).toBe(0);
  });

  it('pulls back more slowly than it pushes', () => {
    expect(hold(STILL, { throttle: -1, turn: 0 }, 2).speed).toBeCloseTo(-0.8);
  });

  it('brakes before reversing', () => {
    const rolling = { speed: 1.4, yawRate: 0 };
    const next = updateMotion(rolling, { throttle: -1, turn: 0 }, SETTINGS, DT);
    expect(next.speed).toBeCloseTo(1.4 - 4 * DT);
  });

  it('pushes slower when something (like thick grass) holds it back', () => {
    expect(hold(STILL, { throttle: 1, turn: 0 }, 2, 0.5).speed).toBeCloseTo(0.7);
  });

  it('builds up to its turning speed, right for positive turn', () => {
    const first = updateMotion(STILL, { throttle: 0, turn: 1 }, SETTINGS, DT);
    expect(first.yawRate).toBeGreaterThan(0);
    expect(first.yawRate).toBeLessThan(1.6);
    expect(hold(STILL, { throttle: 0, turn: -1 }, 1).yawRate).toBeCloseTo(-1.6);
  });

  it('clamps out-of-range controls', () => {
    expect(hold(STILL, { throttle: 5, turn: 9 }, 2)).toEqual({ speed: 1.4, yawRate: 1.6 });
  });
});

describe('steerTowards', () => {
  it('turns fully toward a far-off target, the short way around', () => {
    expect(steerTowards(0, 2, 0.4)).toBe(1);
    expect(steerTowards(0, -2, 0.4)).toBe(-1);
    expect(steerTowards(3, -3, 0.4)).toBeGreaterThan(0); // across ±π: right is shorter
  });

  it('eases off as the mower lines up', () => {
    expect(steerTowards(0, 0.2, 0.4)).toBeCloseTo(0.5);
    expect(steerTowards(1, 1, 0.4)).toBe(0);
  });

  it('settles on the target heading without swinging far past it', () => {
    let yaw = 0;
    let motion = STILL;
    let furthest = 0;
    for (let t = 0; t < 4; t += DT) {
      motion = updateMotion(
        motion,
        { throttle: 0, turn: steerTowards(yaw, 1.5, 0.4) },
        SETTINGS,
        DT,
      );
      yaw += motion.yawRate * DT;
      furthest = Math.max(furthest, yaw);
    }
    expect(yaw).toBeCloseTo(1.5, 2);
    expect(furthest).toBeLessThan(1.5 + 0.1);
  });
});
