import { describe, expect, it } from 'vitest';
import {
  applyMouseLook,
  approachDistance,
  cameraOffset,
  forwardFromYawPitch,
  playerOpacityForDistance,
  rightFromYaw,
  wrapAngle,
} from './cameraMath.js';

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (v) => Math.sqrt(dot(v, v));

const settings = { sensitivity: 0.01, invertY: false, minPitch: -0.9, maxPitch: 1.2 };

describe('forwardFromYawPitch', () => {
  it('looks toward +z at yaw 0, pitch 0', () => {
    const f = forwardFromYawPitch(0, 0);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(1);
  });

  it('turns toward +x for positive yaw', () => {
    expect(forwardFromYawPitch(Math.PI / 2, 0).x).toBeCloseTo(1);
  });

  it('looks down for positive pitch', () => {
    expect(forwardFromYawPitch(0, 0.5).y).toBeLessThan(0);
  });

  it('always returns a unit vector', () => {
    expect(length(forwardFromYawPitch(1.3, -0.7))).toBeCloseTo(1);
  });
});

describe('rightFromYaw', () => {
  it('points toward +x at yaw 0', () => {
    expect(rightFromYaw(0).x).toBeCloseTo(1);
  });

  it('is perpendicular to forward at any yaw and pitch', () => {
    for (const yaw of [0, 0.8, 2, -2.5]) {
      expect(dot(rightFromYaw(yaw), forwardFromYawPitch(yaw, 0.4))).toBeCloseTo(0);
    }
  });
});

describe('applyMouseLook', () => {
  it('turns right when the mouse moves right', () => {
    expect(applyMouseLook(0, 0, 10, 0, settings).yaw).toBeCloseTo(0.1);
  });

  it('looks down when the mouse moves down', () => {
    expect(applyMouseLook(0, 0, 0, 10, settings).pitch).toBeCloseTo(0.1);
  });

  it('flips vertical look when invertY is on', () => {
    expect(applyMouseLook(0, 0, 0, 10, { ...settings, invertY: true }).pitch).toBeCloseTo(-0.1);
  });

  it('clamps pitch to the limits', () => {
    expect(applyMouseLook(0, 0, 0, 10_000, settings).pitch).toBe(settings.maxPitch);
    expect(applyMouseLook(0, 0, 0, -10_000, settings).pitch).toBe(settings.minPitch);
  });

  it('keeps yaw within -π..π', () => {
    const { yaw } = applyMouseLook(3, 0, 100, 0, settings); // 3 + 1 = 4 rad
    expect(yaw).toBeCloseTo(4 - 2 * Math.PI);
  });
});

describe('cameraOffset', () => {
  it('sits behind the pivot, over the right shoulder', () => {
    const yaw = 0.7;
    const offset = cameraOffset(yaw, 0.3, 3, 0.5);
    expect(dot(offset, forwardFromYawPitch(yaw, 0.3))).toBeCloseTo(-3);
    expect(dot(offset, rightFromYaw(yaw))).toBeCloseTo(0.5);
  });

  it('rises above the pivot when looking down', () => {
    expect(cameraOffset(0, 0.5, 3, 0).y).toBeGreaterThan(0);
  });
});

describe('approachDistance', () => {
  it('snaps in immediately when something is in the way', () => {
    expect(approachDistance(3, 1, 0.016, 6)).toBe(1);
  });

  it('eases back out gradually', () => {
    const next = approachDistance(1, 3, 0.016, 6);
    expect(next).toBeGreaterThan(1);
    expect(next).toBeLessThan(3);
  });

  it('eases out at the same speed regardless of frame rate', () => {
    const oneStep = approachDistance(1, 3, 0.1, 6);
    const twoSteps = approachDistance(approachDistance(1, 3, 0.05, 6), 3, 0.05, 6);
    expect(twoSteps).toBeCloseTo(oneStep, 10);
  });
});

describe('playerOpacityForDistance', () => {
  it('is solid when far, hidden when very close, and fades in between', () => {
    expect(playerOpacityForDistance(3, 0.7, 1.4)).toBe(1);
    expect(playerOpacityForDistance(0.5, 0.7, 1.4)).toBe(0);
    expect(playerOpacityForDistance(1.05, 0.7, 1.4)).toBeCloseTo(0.5);
  });
});

describe('wrapAngle', () => {
  it('leaves small angles alone and wraps large ones', () => {
    expect(wrapAngle(1)).toBeCloseTo(1);
    expect(wrapAngle(2 * Math.PI + 0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(-2 * Math.PI - 0.5)).toBeCloseTo(-0.5);
  });
});
