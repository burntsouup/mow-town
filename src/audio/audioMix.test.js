import { describe, expect, it } from 'vitest';
import { engineSound, smoothTowards, trimmerSound } from './audioMix.js';

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

describe('trimmerSound', () => {
  const settings = {
    idleSpeed: 0.4,
    revUp: 6,
    revDown: 3,
    bogDepth: 0.2,
    idle: 0.05,
    full: 0.15,
    cutting: 0.2,
  };
  const DT = 1 / 60;
  /** Runs the trimmer for a while. */
  const run = (rpm, state, seconds) => {
    let result = { rpm, engine: 0, cutting: 0 };
    for (let t = 0; t < seconds - 1e-9; t += DT)
      result = trimmerSound(result.rpm, state, settings, DT);
    return result;
  };
  const carried = { out: true, throttle: false, load: 0 };

  it('is silent while put away', () => {
    expect(run(0, { out: false, throttle: true, load: 1 }, 1)).toEqual({
      rpm: 0,
      engine: 0,
      cutting: 0,
    });
  });

  it('idles quietly while carried', () => {
    const idle = run(0, carried, 3);
    expect(idle.rpm).toBeCloseTo(0.4, 2);
    expect(idle.engine).toBeCloseTo(0.05, 2);
    expect(idle.cutting).toBe(0);
  });

  it('revs up and gets loud with the trigger held, quickly', () => {
    expect(run(0.4, { ...carried, throttle: true }, 0.5).rpm).toBeGreaterThan(0.9);
    const full = run(0.4, { ...carried, throttle: true }, 3);
    expect(full.rpm).toBeCloseTo(1, 2);
    expect(full.engine).toBeCloseTo(0.15, 2);
  });

  it('drops a little and makes a cutting sound while the line cuts', () => {
    const cutting = run(1, { out: true, throttle: true, load: 1 }, 3);
    expect(cutting.rpm).toBeCloseTo(0.8, 2);
    expect(cutting.cutting).toBeCloseTo(0.2);
  });

  it('winds down and falls silent when put away', () => {
    const stopping = run(1, { out: false, throttle: false, load: 0 }, 0.1);
    expect(stopping.engine).toBeGreaterThan(0);
    expect(run(1, { out: false, throttle: false, load: 0 }, 5).engine).toBe(0);
  });
});
