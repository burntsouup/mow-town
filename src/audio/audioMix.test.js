import { describe, expect, it } from 'vitest';
import { engineSound, smoothTowards } from './audioMix.js';

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

describe('engineSound', () => {
  const settings = {
    bogDepth: 0.35,
    spinUp: 3,
    recover: 2,
    bog: 6,
    spinDown: 2,
    engineIdle: 0.1,
    engineWorking: 0.2,
    cutting: 0.3,
  };
  const DT = 1 / 60;
  /** Runs the engine for a while. */
  const run = (rpm, state, seconds) => {
    let result = { rpm, engine: 0, cutting: 0 };
    for (let t = 0; t < seconds - 1e-9; t += DT)
      result = engineSound(result.rpm, state, settings, DT);
    return result;
  };

  it('is silent and stopped until the mower is running', () => {
    expect(engineSound(0, { running: false, load: 0 }, settings, DT)).toEqual({
      rpm: 0,
      engine: 0,
      cutting: 0,
    });
  });

  it('spins up over a moment when started, then idles at full speed', () => {
    expect(run(0, { running: true, load: 0 }, 0.1).rpm).toBeLessThan(0.5);
    const idle = run(0, { running: true, load: 0 }, 5);
    expect(idle.rpm).toBeCloseTo(1, 2);
    expect(idle.engine).toBeCloseTo(0.1, 2);
    expect(idle.cutting).toBe(0);
  });

  it('bogs down under load, gets louder, and makes a cutting sound', () => {
    const working = run(1, { running: true, load: 1 }, 3);
    expect(working.rpm).toBeCloseTo(0.65, 2);
    expect(working.engine).toBeCloseTo(0.2, 2);
    expect(working.cutting).toBeCloseTo(0.3);
  });

  it('bogs quickly but recovers more slowly', () => {
    const bogged = run(1, { running: true, load: 1 }, 0.2).rpm;
    const recovered = run(0.65, { running: true, load: 0 }, 0.2).rpm;
    expect(1 - bogged).toBeGreaterThan(recovered - 0.65);
  });

  it('winds down and falls silent when let go', () => {
    const stopping = run(1, { running: false, load: 0 }, 0.3);
    expect(stopping.rpm).toBeGreaterThan(0.2);
    expect(stopping.cutting).toBe(0);
    expect(run(1, { running: false, load: 0 }, 5).engine).toBe(0);
  });

  it('clamps loads beyond full', () => {
    expect(run(1, { running: true, load: 7 }, 3).rpm).toBeCloseTo(0.65, 2);
  });
});
