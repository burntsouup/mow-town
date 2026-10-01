import { describe, expect, it } from 'vitest';
import { createRandom } from '../math/noise.js';
import {
  advanceWalk,
  Blinker,
  bodyBob,
  bodyPoint,
  CHEER_TIME,
  cheerPose,
  ellipsoidPoint,
  footLandings,
  footOffset,
  Glancer,
  heldCheerTime,
  limbCurve,
  springStep,
  TUFT_BODY,
} from './tuftMath.js';

const WALK = { stride: 0.2, lift: 0.08 };

describe('the walk cycle', () => {
  it('keeps a planted foot still on the ground while the body walks on', () => {
    let phase = 0.1;
    let body = 0;
    const start = body + footOffset(phase, WALK).forward;
    // Walk in small steps through most of the planted half of the cycle.
    while (phase < Math.PI - 0.1) {
      body += 0.002;
      phase = advanceWalk(phase, 0.002, WALK.stride);
      expect(body + footOffset(phase, WALK).forward).toBeCloseTo(start, 6);
      expect(footOffset(phase, WALK).up).toBe(0);
    }
  });

  it('lifts the foot and swings it forward for the other half', () => {
    const lifted = footOffset(1.5 * Math.PI, WALK);
    expect(lifted.up).toBeCloseTo(0.08);
    expect(lifted.forward).toBeCloseTo(0);
    expect(footOffset(2 * Math.PI - 0.01, WALK).forward).toBeCloseTo(0.2, 2);
  });

  it('flows smoothly from swinging to planting and back', () => {
    for (const edge of [0, Math.PI]) {
      const before = footOffset(edge - 1e-6, WALK);
      const after = footOffset(edge + 1e-6, WALK);
      expect(after.forward).toBeCloseTo(before.forward, 4);
      expect(after.up).toBeCloseTo(before.up, 4);
    }
  });

  it('takes two steps (one full cycle) every four strides of distance', () => {
    expect(advanceWalk(0, 0.8, 0.2)).toBeCloseTo(0);
    expect(advanceWalk(0, 0.4, 0.2)).toBeCloseTo(Math.PI);
    expect(advanceWalk(0.5, -0.1, 0.2)).toBeGreaterThan(0); // stays within 0..2π
  });

  it('bobs the body up twice a cycle, once per step', () => {
    expect(bodyBob(Math.PI / 2)).toBeCloseTo(1);
    expect(bodyBob((3 * Math.PI) / 2)).toBeCloseTo(1);
    expect(bodyBob(0)).toBeCloseTo(0);
  });
});

describe('limbCurve', () => {
  const from = { x: 0, y: 1, z: 0 };
  const to = { x: 0, y: 0, z: 0.4 };

  it('runs exactly from one end to the other', () => {
    const points = limbCurve(from, to, { x: 0.1, y: 0, z: 0 }, 6);
    expect(points).toHaveLength(7);
    expect(points[0]).toEqual(from);
    expect(points[6].z).toBeCloseTo(0.4);
    expect(points[6].y).toBeCloseTo(0);
  });

  it('bows out through the middle by the bend', () => {
    const points = limbCurve(from, to, { x: 0.1, y: 0, z: 0 }, 2);
    expect(points[1].x).toBeCloseTo(0.1);
    expect(points[1].y).toBeCloseTo(0.5);
  });
});

describe('ellipsoidPoint', () => {
  const center = { x: 0, y: 1, z: 0 };
  const radii = { x: 0.4, y: 0.5, z: 0.3 };

  it('lands on the surface, with the normal pointing out', () => {
    const front = ellipsoidPoint(center, radii, { x: 0, y: 0, z: 5 });
    expect(front.point.z).toBeCloseTo(0.3);
    expect(front.normal).toEqual({ x: 0, y: 0, z: 1 });
    const { point, normal } = ellipsoidPoint(center, radii, { x: 1, y: 1, z: 1 });
    const inside = (point.x / 0.4) ** 2 + ((point.y - 1) / 0.5) ** 2 + (point.z / 0.3) ** 2;
    expect(inside).toBeCloseTo(1);
    expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1);
    expect(normal.z).toBeGreaterThan(normal.y); // the flatter side faces more squarely
  });
});

describe('Blinker', () => {
  it('blinks every few seconds, shut for a moment', () => {
    const blinker = new Blinker(() => 0.5, { every: [2, 4], closedFor: 0.12 });
    const open = [];
    for (let t = 0; t < 7; t += 0.01) open.push(blinker.update(0.01));
    const closedFrames = open.filter((o) => o === 0).length;
    expect(open.slice(0, 250).every((o) => o === 1)).toBe(true); // first blink at ~3 s
    expect(closedFrames).toBeGreaterThanOrEqual(12 * 2 - 2);
    expect(closedFrames).toBeLessThan(40);
  });
});

describe('bodyPoint (the gumdrop body)', () => {
  const size = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
    const { point } = bodyPoint({ x, y, z });
    return Math.hypot(point.x, point.y - TUFT_BODY.center.y, point.z);
  };

  it('is fuller a little below the middle and narrower on top than a plain egg', () => {
    const egg = (/** @type {number} */ y) =>
      ellipsoidPoint(TUFT_BODY.center, TUFT_BODY.radii, { x: 1, y, z: 0 }).point.x;
    expect(bodyPoint({ x: 1, y: -0.3, z: 0 }).point.x).toBeGreaterThan(egg(-0.3) * 1.04);
    expect(bodyPoint({ x: 1, y: 1.2, z: 0 }).point.x).toBeLessThan(egg(1.2) * 0.95);
  });

  it('is flatter underneath than on top', () => {
    expect(size(0, -1, 0)).toBeLessThan(size(0, 1, 0));
  });

  it('is the same on both sides', () => {
    const left = bodyPoint({ x: -0.4, y: 0.3, z: 0.8 });
    const right = bodyPoint({ x: 0.4, y: 0.3, z: 0.8 });
    expect(left.point.x).toBeCloseTo(-right.point.x);
    expect(left.point.y).toBeCloseTo(right.point.y);
    expect(left.normal.x).toBeCloseTo(-right.normal.x);
  });

  it('has smooth, outward, unit normals, even along the middle line', () => {
    let previous = null;
    for (let x = -0.2; x <= 0.2; x += 0.02) {
      const { point, normal } = bodyPoint({ x, y: 0.1, z: 1 });
      expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1);
      const out = { x: point.x, y: point.y - TUFT_BODY.center.y, z: point.z };
      expect(normal.x * out.x + normal.y * out.y + normal.z * out.z).toBeGreaterThan(0);
      if (previous) {
        const turn = normal.x * previous.x + normal.y * previous.y + normal.z * previous.z;
        expect(turn).toBeGreaterThan(0.99); // no creases between neighbors
      }
      previous = normal;
    }
  });
});

describe('springStep', () => {
  const settings = { stiffness: 120, damping: 9 };
  const run = (/** @type {number} */ dt, /** @type {number} */ seconds) => {
    let state = { value: 0, velocity: 0 };
    let peak = 0;
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      state = springStep(state, 1, dt, settings);
      peak = Math.max(peak, state.value);
    }
    return { ...state, peak };
  };

  it('settles on the target, overshooting a little on the way, like jelly', () => {
    const settled = run(1 / 60, 3);
    expect(settled.value).toBeCloseTo(1, 3);
    expect(settled.peak).toBeGreaterThan(1.05);
    expect(settled.peak).toBeLessThan(1.6);
  });

  it('comes out about the same at any frame rate', () => {
    expect(run(1 / 30, 0.2).value).toBeCloseTo(run(1 / 144, 0.2).value, 1);
  });
});

describe('bodyPoint smoothness', () => {
  it('has no crease around the middle (the normals turn evenly up the front)', () => {
    /** @type {number[]} */
    const turns = [];
    let previous = null;
    for (let y = -0.2; y <= 0.2; y += 0.01) {
      const { normal } = bodyPoint({ x: 0.3, y, z: 1 });
      if (previous) {
        turns.push(
          Math.acos(
            Math.min(1, normal.x * previous.x + normal.y * previous.y + normal.z * previous.z),
          ),
        );
      }
      previous = normal;
    }
    // A crease would show up as one step turning much more than its neighbors.
    for (let i = 1; i < turns.length; i++) {
      expect(Math.abs(turns[i] - turns[i - 1])).toBeLessThan(0.004);
    }
  });
});

describe('footLandings', () => {
  it('reports each foot as it touches down, once per step', () => {
    const landed = [];
    let phase = 0.05;
    for (let i = 0; i < 400; i++) {
      const next = advanceWalk(phase, 0.004, WALK.stride);
      for (const foot of footLandings(phase, next)) {
        landed.push(foot);
        // It's planted (not lifted) right after landing.
        const own = foot === 0 ? next : next + Math.PI;
        expect(footOffset(own, WALK).up).toBe(0);
      }
      phase = next;
    }
    // 400 × 4 mm = 1.6 m of walking: 4 steps (each foot moves 0.4 m per stride).
    expect(landed).toEqual([1, 0, 1, 0]);
  });

  it('reports nothing while standing still', () => {
    expect(footLandings(1, 1)).toEqual([]);
  });

  it('catches both feet in one long frame', () => {
    expect(footLandings(Math.PI * 0.9, Math.PI * 0.1).sort()).toEqual([0, 1]);
  });
});

describe('Glancer', () => {
  const settings = {
    every: /** @type {[number, number]} */ ([1, 2]),
    yaw: 0.5,
    pitch: 0.2,
    speed: 6,
  };

  it('looks around now and then, within its range', () => {
    const glancer = new Glancer(createRandom(4), settings);
    const yaws = new Set();
    for (let i = 0; i < 60 * 20; i++) {
      const { yaw, pitch } = glancer.update(1 / 60, 1);
      expect(Math.abs(yaw)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(pitch)).toBeLessThanOrEqual(0.2);
      if (i % 60 === 0) yaws.add(yaw.toFixed(2));
    }
    expect(yaws.size).toBeGreaterThan(4); // it didn't stare at one spot
  });

  it('keeps its eyes ahead while busy', () => {
    const glancer = new Glancer(createRandom(4), settings);
    for (let i = 0; i < 60 * 10; i++) {
      const { yaw, pitch } = glancer.update(1 / 60, 0);
      expect(Math.abs(yaw)).toBeLessThan(1e-9);
      expect(Math.abs(pitch)).toBeLessThan(1e-9);
    }
  });
});

describe('cheerPose', () => {
  it('hops twice, off the ground and back, then waves', () => {
    const hops = [];
    let wasUp = false;
    let waved = false;
    for (let t = 0; t < CHEER_TIME; t += 0.01) {
      const pose = cheerPose(t);
      expect(pose.hop).toBeGreaterThanOrEqual(0);
      const up = pose.hop > 0.02;
      if (up && !wasUp) hops.push(t);
      wasUp = up;
      if (Math.abs(pose.wave) > 0.9) waved = true;
    }
    expect(hops).toHaveLength(2);
    expect(waved).toBe(true);
    expect(cheerPose(0.3).arms).toBe(1); // hooray
  });

  it('is back to normal once it’s over (or before it starts)', () => {
    for (const t of [-1, CHEER_TIME, CHEER_TIME + 5]) {
      expect(cheerPose(t)).toEqual({ hop: 0, arms: 0, wave: 0, squint: 0 });
    }
    expect(cheerPose(CHEER_TIME - 0.001).arms).toBeLessThan(0.01); // arms come down smoothly
  });

  it('does a single little hop for a small cheer, no waving', () => {
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => cheerPose(i * 0.01, false).hop));
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(0.15);
    expect(cheerPose(0.2, false).wave).toBe(0);
    expect(cheerPose(0.5, false).hop).toBe(0);
  });
});

describe('heldCheerTime', () => {
  it('runs the cheer as usual, then keeps the arms up and waving for as long as you like', () => {
    expect(heldCheerTime(0.3)).toBe(0.3); // the hops play out
    for (const t of [2, 5, 60.7, 3600]) {
      const held = heldCheerTime(t);
      expect(cheerPose(held).arms).toBe(1);
      expect(cheerPose(held).hop).toBe(0);
    }
    // ...and the wave moves smoothly round the loop.
    const loop = 2 / 2.2;
    const before = cheerPose(0.84 + loop - 1e-6).wave;
    const after = cheerPose(heldCheerTime(0.84 + loop + 1e-6)).wave;
    expect(Math.abs(after - before)).toBeLessThan(0.01);
  });
});
