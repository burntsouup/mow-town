import { describe, expect, it } from 'vitest';
import { aerialView, blendViews, RevealTimeline } from './revealMath.js';

describe('aerialView', () => {
  const settings = { height: 14, distance: 10, swing: 0.3 };

  it('looks down at the lawn from above the street side', () => {
    const view = aerialView({ x: 2, z: 5 }, settings, 0);
    expect(view.position).toEqual({ x: 2, y: 14, z: -5 });
    expect(view.target).toEqual({ x: 2, y: 0, z: 5 });
  });

  it('swings around the lawn, staying the same distance away', () => {
    const view = aerialView({ x: 0, z: 0 }, settings, 0.5);
    expect(view.position.x).toBeGreaterThan(0);
    expect(Math.hypot(view.position.x, view.position.z)).toBeCloseTo(10);
  });
});

describe('blendViews', () => {
  it('moves both the position and what it looks at', () => {
    const a = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 10 } };
    const b = { position: { x: 10, y: 20, z: 0 }, target: { x: 0, y: 0, z: 0 } };
    expect(blendViews(a, b, 0.5)).toEqual({
      position: { x: 5, y: 10, z: 0 },
      target: { x: 0, y: 0, z: 5 },
    });
  });
});

describe('RevealTimeline', () => {
  const DT = 1 / 60;
  /** @param {RevealTimeline} timeline @param {number} seconds */
  const run = (timeline, seconds) => {
    let blend = 0;
    for (let t = 0; t < seconds - 1e-9; t += DT) blend = timeline.update(DT);
    return blend;
  };

  it('does nothing until started', () => {
    const timeline = new RevealTimeline({ flyTime: 2, holdTime: 3 });
    expect(timeline.update(DT)).toBe(0);
    expect(timeline.isActive).toBe(false);
  });

  it('flies up, holds, flies back down, then ends', () => {
    const timeline = new RevealTimeline({ flyTime: 2, holdTime: 3 });
    timeline.start();
    expect(run(timeline, 1)).toBeCloseTo(0.5, 1);
    expect(run(timeline, 2)).toBe(1); // 3 s in: holding
    expect(run(timeline, 2.5)).toBeLessThan(1); // 5.5 s: on the way back
    expect(timeline.isActive).toBe(true);
    run(timeline, 1.6);
    expect(timeline.isActive).toBe(false);
    expect(timeline.duration).toBe(7);
  });

  it('flies straight back from wherever it is when skipped', () => {
    const timeline = new RevealTimeline({ flyTime: 2, holdTime: 3 });
    timeline.start();
    run(timeline, 1); // halfway up
    timeline.skip();
    run(timeline, 1.05);
    expect(timeline.isActive).toBe(false);
  });
});
