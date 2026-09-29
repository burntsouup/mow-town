import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { frontLawn } from '../environment/frontYardLayout.js';
import { stripeNeatness } from './neatness.js';
import { simulateRows } from './pacing.js';

/** @param {Partial<import('./pacing.js').PacingOptions>} overrides */
function mowFrontLawn(overrides = {}) {
  return simulateRows({
    area: frontLawn(),
    texelsPerMeter: config.grass.texelsPerMeter,
    cutHeight: config.grass.cutHeight,
    mower: config.mower,
    deck: config.mower.deck,
    overlap: 0.08, // a tidy player overlaps each row by a few centimeters
    ...overrides,
  });
}

/** The tidy runs, shared by the tests below (each takes a moment to simulate). */
const tidyRuns = {
  x: /** @type {ReturnType<typeof simulateRows> | undefined} */ (undefined),
  z: /** @type {ReturnType<typeof simulateRows> | undefined} */ (undefined),
};
/** @param {'x' | 'z'} along */
const tidyRun = (along) => (tidyRuns[along] ??= mowFrontLawn({ along }));

/** @param {number} seconds */
const minutes = (seconds) => (seconds / 60).toFixed(1);

describe('pacing (front lawn, best case)', () => {
  // A guard against tuning changes that make the lawn a slog (or over in a flash). Real
  // players take longer than this bot: expect roughly 1.5×.
  it('a tidy player can finish the lawn in 3 to 5.5 minutes', () => {
    const lengthwise = tidyRun('x');
    const crosswise = tidyRun('z');
    console.info(
      `Pacing: long rows ${minutes(lengthwise.seconds)} min (${lengthwise.rows} rows, ` +
        `${minutes(lengthwise.turningSeconds)} min turning), short rows ` +
        `${minutes(crosswise.seconds)} min (${crosswise.rows} rows)`,
    );
    for (const run of [lengthwise, crosswise]) {
      expect(run.progress).toBeGreaterThanOrEqual(0.98);
      expect(run.seconds).toBeGreaterThan(180);
      expect(run.seconds).toBeLessThan(330);
    }
  });

  it('leaves gaps when rows do not overlap', () => {
    const sloppy = mowFrontLawn({ overlap: -0.1, maxSeconds: 600 });
    expect(sloppy.progress).toBeLessThan(0.98);
  });

  it("gives a tidy player's rows a top neatness score, even around the obstacles", () => {
    for (const along of /** @type {const} */ (['x', 'z'])) {
      const { grid } = tidyRun(along);
      expect(stripeNeatness(grid, config.money.neatnessPatch)).toBeGreaterThan(
        config.money.tipFull,
      );
    }
  });
});
