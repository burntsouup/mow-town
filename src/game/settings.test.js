import { describe, expect, it } from 'vitest';
import { changedSettings, settingsToText, snapshot } from './settings.js';

const defaults = {
  camera: { sensitivity: 0.0025, invertY: false },
  render: { sun: { direction: [-0.4, -1, 0.9] } },
  player: { walkSpeed: 3.5 },
};

describe('snapshot', () => {
  it('is a deep copy that later changes do not affect', () => {
    const settings = structuredClone(defaults);
    const copy = snapshot(settings);
    settings.camera.sensitivity = 1;
    settings.render.sun.direction[0] = 5;
    expect(copy.camera.sensitivity).toBe(0.0025);
    expect(copy.render.sun.direction[0]).toBe(-0.4);
  });
});

describe('changedSettings', () => {
  it('is empty when nothing changed', () => {
    expect(changedSettings(defaults, structuredClone(defaults))).toEqual({});
  });

  it('returns only the changed values, keeping their groups', () => {
    const current = structuredClone(defaults);
    current.camera.sensitivity = 0.003;
    current.player.walkSpeed = 4;
    expect(changedSettings(defaults, current)).toEqual({
      camera: { sensitivity: 0.003 },
      player: { walkSpeed: 4 },
    });
  });

  it('handles booleans, nested groups, and arrays', () => {
    const current = structuredClone(defaults);
    current.camera.invertY = true;
    current.render.sun.direction = [0, -1, 0];
    expect(changedSettings(defaults, current)).toEqual({
      camera: { invertY: true },
      render: { sun: { direction: [0, -1, 0] } },
    });
  });
});

describe('settingsToText', () => {
  it('rounds away floating-point noise from sliders', () => {
    const text = settingsToText({ camera: { sensitivity: 0.30000000000000004 } });
    expect(JSON.parse(text)).toEqual({ camera: { sensitivity: 0.3 } });
  });

  it('is empty when there is nothing to report', () => {
    expect(settingsToText({})).toBe('');
  });
});
