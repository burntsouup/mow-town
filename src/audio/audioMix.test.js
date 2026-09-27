import { describe, expect, it } from 'vitest';
import { audioMix, smoothTowards } from './audioMix.js';

const settings = {
  humIdle: 0.05,
  humSpraying: 0.1,
  hiss: 0.2,
  impact: 0.3,
  strip: 0.4,
  fullStripRate: 300,
};
const idle = { equipped: false, spraying: false, hitting: false, strength: 0, dirtRate: 0 };

describe('audioMix', () => {
  it('is silent before you pick up the washer', () => {
    expect(audioMix(idle, settings)).toEqual({ hum: 0, hiss: 0, impact: 0, strip: 0 });
  });

  it('idles the engine once equipped, and revs it while spraying', () => {
    expect(audioMix({ ...idle, equipped: true }, settings).hum).toBe(0.05);
    expect(audioMix({ ...idle, equipped: true, spraying: true }, settings).hum).toBe(0.1);
  });

  it('hisses while spraying, but only makes impact noise when the water hits something', () => {
    const intoTheSky = audioMix({ ...idle, equipped: true, spraying: true }, settings);
    expect(intoTheSky.hiss).toBe(0.2);
    expect(intoTheSky.impact).toBe(0);
    const onTheGround = audioMix(
      { ...idle, equipped: true, spraying: true, hitting: true, strength: 1 },
      settings,
    );
    expect(onTheGround.impact).toBeCloseTo(0.3);
  });

  it('makes a louder impact up close (full strength) than far away', () => {
    const state = { ...idle, equipped: true, spraying: true, hitting: true };
    const close = audioMix({ ...state, strength: 1 }, settings).impact;
    const far = audioMix({ ...state, strength: 0.1 }, settings).impact;
    expect(close).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('scales the stripping sound with dirt removed, up to a limit', () => {
    const state = { ...idle, equipped: true, spraying: true, hitting: true, strength: 1 };
    expect(audioMix({ ...state, dirtRate: 0 }, settings).strip).toBe(0);
    expect(audioMix({ ...state, dirtRate: 150 }, settings).strip).toBeCloseTo(0.2);
    expect(audioMix({ ...state, dirtRate: 3000 }, settings).strip).toBeCloseTo(0.4);
  });

  it('never strips when not spraying, even if a stale dirt rate lingers', () => {
    expect(audioMix({ ...idle, equipped: true, dirtRate: 500 }, settings).strip).toBe(0);
  });
});

describe('smoothTowards', () => {
  it('moves part of the way toward the target', () => {
    const next = smoothTowards(0, 10, 0.016, 10);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
  });

  it('is frame-rate independent', () => {
    const oneStep = smoothTowards(0, 10, 0.1, 10);
    const twoSteps = smoothTowards(smoothTowards(0, 10, 0.05, 10), 10, 0.05, 10);
    expect(twoSteps).toBeCloseTo(oneStep, 10);
  });
});
