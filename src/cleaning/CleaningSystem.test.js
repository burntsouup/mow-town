import { describe, expect, it } from 'vitest';
import { CleaningSystem } from './CleaningSystem.js';
import { DirtMask } from './DirtMask.js';

/** A stand-in for a CleanableSurface: just enough for CleaningSystem's job bookkeeping. */
function fakeSurface(job, dirt) {
  const mask = new DirtMask(10, 10);
  mask.fill(() => dirt);
  return {
    mesh: {},
    job,
    mask,
    plugin: { highlight: 0 },
    update() {},
    fillWithStartingDirt() {
      mask.fill(() => dirt);
    },
  };
}

function system() {
  const cleaning = new CleaningSystem();
  const driveway = fakeSurface('driveway', 0.5);
  const fence = fakeSurface('backyard', 0.5);
  const patio = fakeSurface('backyard', 0.5);
  for (const surface of [driveway, fence, patio]) cleaning.add(surface);
  return { cleaning, driveway, fence, patio };
}

describe('CleaningSystem jobs', () => {
  it('finds the surfaces of a job', () => {
    const { cleaning, fence, patio } = system();
    expect(cleaning.surfacesFor('backyard')).toEqual([fence, patio]);
  });

  it('measures progress per job', () => {
    const { cleaning, driveway, fence } = system();
    driveway.mask.fadeAll(1);
    expect(cleaning.progressFor('driveway')).toBe(1);
    expect(cleaning.progressFor('backyard')).toBe(0);
    fence.mask.fadeAll(1);
    expect(cleaning.progressFor('backyard')).toBeCloseTo(0.5);
  });

  it('fades away only the finished job’s leftover dirt', () => {
    const { cleaning, driveway, fence } = system();
    cleaning.finishRemaining('driveway');
    for (let i = 0; i < 100; i++) cleaning.update(0.05);
    expect(cleaning.progressFor('driveway')).toBe(1);
    expect(fence.mask.get(5, 5)).toBeCloseTo(0.5, 5);
    expect(cleaning.finishingJob).toBeNull();
    expect(driveway.mask.get(5, 5)).toBe(0);
  });

  it('highlights only the current job’s dirt', () => {
    const { cleaning, driveway, fence, patio } = system();
    cleaning.setHighlight(0.8, 'backyard');
    expect([driveway.plugin.highlight, fence.plugin.highlight, patio.plugin.highlight]).toEqual([
      0, 0.8, 0.8,
    ]);
  });

  it('resets only one job', () => {
    const { cleaning, driveway, fence } = system();
    driveway.mask.fadeAll(1);
    fence.mask.fadeAll(1);
    cleaning.reset('backyard');
    expect(cleaning.progressFor('driveway')).toBe(1);
    expect(fence.mask.get(5, 5)).toBeCloseTo(0.5, 5);
  });
});
