import { describe, expect, it } from 'vitest';
import { lerpPose, strokePoses } from './deckPose.js';

describe('lerpPose', () => {
  it('blends position and heading', () => {
    const pose = lerpPose({ x: 0, z: 0, yaw: 0 }, { x: 2, z: 4, yaw: 1 }, 0.5);
    expect(pose.x).toBeCloseTo(1);
    expect(pose.z).toBeCloseTo(2);
    expect(pose.yaw).toBeCloseTo(0.5);
  });

  it('turns the short way around', () => {
    const pose = lerpPose({ x: 0, z: 0, yaw: 3 }, { x: 0, z: 0, yaw: -3 }, 0.5);
    expect(Math.abs(pose.yaw)).toBeCloseTo(Math.PI);
  });
});

describe('strokePoses', () => {
  it('ends exactly at the destination', () => {
    const to = { x: 1, z: 0, yaw: 0.2 };
    const poses = strokePoses({ x: 0, z: 0, yaw: 0 }, to, 0.1, 0.1);
    expect(poses.at(-1)).toEqual(to);
  });

  it('spaces poses no further apart than asked', () => {
    const poses = strokePoses({ x: 0, z: 0, yaw: 0 }, { x: 1, z: 0, yaw: 0 }, 0.3, 1);
    expect(poses).toHaveLength(4);
    expect(poses[0].x).toBeCloseTo(0.25);
  });

  it('adds poses for turning on the spot, too', () => {
    const poses = strokePoses({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 0, yaw: 1 }, 0.3, 0.25);
    expect(poses).toHaveLength(4);
  });

  it('always returns at least one pose, even when standing still', () => {
    expect(strokePoses({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 0, yaw: 0 }, 0.1, 0.1)).toHaveLength(1);
  });

  it('caps the count so a teleport stays cheap', () => {
    expect(strokePoses({ x: 0, z: 0, yaw: 0 }, { x: 1e6, z: 0, yaw: 0 }, 0.1, 0.1)).toHaveLength(
      200,
    );
  });
});
