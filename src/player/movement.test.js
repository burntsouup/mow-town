import { describe, expect, it } from 'vitest';
import {
  cameraRelativeMove,
  moveInputFromKeys,
  moveTowards,
  turnTowards,
  yawFromDirection,
} from './movement.js';

/** Fake keyboard: only the listed keys are held. */
const keys =
  (...held) =>
  (code) =>
    held.includes(code);

describe('moveInputFromKeys', () => {
  it('returns zero with no keys held', () => {
    expect(moveInputFromKeys(keys())).toEqual({ x: 0, z: 0 });
  });

  it('maps W to forward and D to right', () => {
    expect(moveInputFromKeys(keys('KeyW'))).toEqual({ x: 0, z: 1 });
    expect(moveInputFromKeys(keys('KeyD'))).toEqual({ x: 1, z: 0 });
  });

  it('supports arrow keys', () => {
    expect(moveInputFromKeys(keys('ArrowUp', 'ArrowLeft')).x).toBeLessThan(0);
  });

  it('does not move faster diagonally', () => {
    const { x, z } = moveInputFromKeys(keys('KeyW', 'KeyD'));
    expect(Math.hypot(x, z)).toBeCloseTo(1);
  });

  it('cancels out opposite keys', () => {
    expect(moveInputFromKeys(keys('KeyW', 'KeyS'))).toEqual({ x: 0, z: 0 });
  });
});

describe('cameraRelativeMove', () => {
  it('moves toward +z for forward when the camera looks toward +z', () => {
    const world = cameraRelativeMove({ x: 0, z: 1 }, 0);
    expect(world.x).toBeCloseTo(0);
    expect(world.z).toBeCloseTo(1);
  });

  it('moves toward +x for forward when the camera looks toward +x', () => {
    const world = cameraRelativeMove({ x: 0, z: 1 }, Math.PI / 2);
    expect(world.x).toBeCloseTo(1);
    expect(world.z).toBeCloseTo(0);
  });

  it('moves to the camera’s right for strafe right', () => {
    // Camera looking toward +x: its right is -z.
    const world = cameraRelativeMove({ x: 1, z: 0 }, Math.PI / 2);
    expect(world.x).toBeCloseTo(0);
    expect(world.z).toBeCloseTo(-1);
  });

  it('keeps the input length', () => {
    const world = cameraRelativeMove({ x: Math.SQRT1_2, z: Math.SQRT1_2 }, 2.1);
    expect(Math.hypot(world.x, world.z)).toBeCloseTo(1);
  });
});

describe('moveTowards', () => {
  it('limits how much the velocity changes in one step', () => {
    const next = moveTowards({ x: 0, z: 0 }, { x: 0, z: 10 }, 2);
    expect(next).toEqual({ x: 0, z: 2 });
  });

  it('lands exactly on the target without overshooting', () => {
    expect(moveTowards({ x: 0, z: 9 }, { x: 0, z: 10 }, 2)).toEqual({ x: 0, z: 10 });
  });

  it('reaches full speed in speed / acceleration seconds', () => {
    const acceleration = 30;
    const dt = 1 / 60;
    let velocity = { x: 0, z: 0 };
    let frames = 0;
    while (velocity.z < 6 && frames < 1000) {
      velocity = moveTowards(velocity, { x: 0, z: 6 }, acceleration * dt);
      frames++;
    }
    expect(frames * dt).toBeCloseTo(6 / acceleration, 1);
  });
});

describe('turnTowards', () => {
  it('turns part of the way each frame', () => {
    const yaw = turnTowards(0, 1, 10, 1 / 60);
    expect(yaw).toBeGreaterThan(0);
    expect(yaw).toBeLessThan(1);
  });

  it('takes the short way around', () => {
    // From just below +π to just above -π is a tiny turn, not a full spin.
    const yaw = turnTowards(3.0, -3.0, 10, 1 / 60);
    expect(Math.abs(yaw)).toBeGreaterThan(3.0);
  });

  it('turns at the same speed regardless of frame rate', () => {
    const oneStep = turnTowards(0, 1, 10, 0.1);
    const twoSteps = turnTowards(turnTowards(0, 1, 10, 0.05), 1, 10, 0.05);
    expect(twoSteps).toBeCloseTo(oneStep, 10);
  });
});

describe('yawFromDirection', () => {
  it('matches the camera convention (0 = +z, π/2 = +x)', () => {
    expect(yawFromDirection({ x: 0, z: 1 })).toBeCloseTo(0);
    expect(yawFromDirection({ x: 1, z: 0 })).toBeCloseTo(Math.PI / 2);
  });
});
