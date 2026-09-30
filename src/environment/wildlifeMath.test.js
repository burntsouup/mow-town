import { describe, expect, it } from 'vitest';
import { birdPlacement, butterflyPlacement, wingAngle } from './wildlifeMath.js';

const FLIGHT = { center: { x: 0, z: 0 }, radius: 60, height: 22, speed: 0.05, phase: 1 };

describe('birdPlacement', () => {
  it('keeps the flock on its circle, up in the sky', () => {
    for (let t = 0; t < 200; t += 7) {
      const leader = birdPlacement(t, 0, FLIGHT);
      expect(Math.hypot(leader.x, leader.z)).toBeCloseTo(60, 5);
      expect(leader.y).toBeGreaterThan(18);
      expect(leader.y).toBeLessThan(26);
    }
  });

  it('flies the way it faces', () => {
    const now = birdPlacement(10, 0, FLIGHT);
    const later = birdPlacement(10.5, 0, FLIGHT);
    const moved = Math.atan2(later.x - now.x, later.z - now.z);
    expect(Math.cos(moved - now.heading)).toBeGreaterThan(0.99);
  });

  it('falls in behind the leader in a V, on both sides', () => {
    const t = 30;
    const leader = birdPlacement(t, 0, FLIGHT);
    const left = birdPlacement(t, 1, FLIGHT);
    const right = birdPlacement(t, 2, FLIGHT);
    const ahead = { x: Math.sin(leader.heading), z: Math.cos(leader.heading) };
    for (const bird of [left, right]) {
      const behind = (leader.x - bird.x) * ahead.x + (leader.z - bird.z) * ahead.z;
      expect(behind).toBeGreaterThan(1);
    }
    // One to each side of the leader's path.
    const sideways = (/** @type {{ x: number, z: number }} */ bird) =>
      (bird.x - leader.x) * ahead.z - (bird.z - leader.z) * ahead.x;
    expect(Math.sign(sideways(left))).toBe(-Math.sign(sideways(right)));
  });

  it('can go round the other way', () => {
    const backwards = { ...FLIGHT, speed: -0.05 };
    const now = birdPlacement(10, 0, backwards);
    const later = birdPlacement(10.5, 0, backwards);
    const moved = Math.atan2(later.x - now.x, later.z - now.z);
    expect(Math.cos(moved - now.heading)).toBeGreaterThan(0.99);
  });
});

describe('wingAngle', () => {
  it('flaps within its reach, and sometimes glides', () => {
    let glided = false;
    let flapped = false;
    for (let t = 0; t < 60; t += 0.01) {
      const angle = wingAngle(t, 12, 0.5);
      expect(Math.abs(angle)).toBeLessThanOrEqual(0.8);
      if (Math.abs(angle) > 0.7) flapped = true;
      if (angle > 0.02 && angle < 0.14) glided = true;
    }
    expect(flapped).toBe(true);
    expect(glided).toBe(true);
  });
});

describe('butterflyPlacement', () => {
  const home = { x: 5, y: 0.2, z: -3 };

  it('stays near home, fluttering above the flowers', () => {
    for (let t = 0; t < 300; t += 0.37) {
      const b = butterflyPlacement(t, home, 1.5, 2);
      expect(Math.hypot(b.x - home.x, b.z - home.z)).toBeLessThanOrEqual(1.5 * Math.SQRT2 + 1e-9);
      expect(b.y).toBeGreaterThan(home.y);
      expect(b.y).toBeLessThan(home.y + 1);
    }
  });

  it('wanders: different butterflies go different ways', () => {
    const a = butterflyPlacement(12, home, 1.5, 1);
    const b = butterflyPlacement(12, home, 1.5, 4);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.05);
  });
});
