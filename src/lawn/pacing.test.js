import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { frontLawn } from '../environment/frontYardLayout.js';
import { nextDoorLawn } from '../environment/nextDoorLayout.js';
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

// These simulate whole lawns, row by row: a few seconds each, more on a busy machine.
const SLOW = { timeout: 30_000 };

describe('pacing (front lawn, best case)', SLOW, () => {
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

  it('goes about 30% faster with the 30-inch deck from the sale stand', () => {
    const { width, length } = config.shop.wideDeck;
    const wide = mowFrontLawn({ deck: { width, length } });
    const narrow = tidyRun('x');
    console.info(
      `Pacing: 30-inch deck ${minutes(wide.seconds)} min (${wide.rows} rows), ` +
        `${Math.round((1 - wide.seconds / narrow.seconds) * 100)}% faster`,
    );
    expect(wide.progress).toBeGreaterThanOrEqual(0.98);
    expect(wide.seconds).toBeLessThan(narrow.seconds * 0.8);
    expect(stripeNeatness(wide.grid, config.money.neatnessPatch)).toBeGreaterThan(
      config.money.tipFull,
    );
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

describe("pacing (the Parkers' lawn next door, best case)", SLOW, () => {
  const { width, length } = config.shop.wideDeck;
  /** @param {import('./GrassGrid.js').Deck} deck @param {'x' | 'z'} along */
  const mowNextDoor = (deck, along) =>
    simulateRows({
      area: nextDoorLawn(),
      texelsPerMeter: config.grass.texelsPerMeter,
      cutHeight: config.grass.cutHeight,
      mower: config.mower,
      deck,
      overlap: 0.08,
      along,
    });

  // Sized so that, with the 30-inch deck, it takes about as long as the front lawn did with
  // the 22-inch one: the upgrade lets you take on more in the same time.
  it('takes a tidy player 3 to 5.5 minutes with the 30-inch deck, and longer without', () => {
    const wideRows = mowNextDoor({ width, length }, 'x');
    const wideColumns = mowNextDoor({ width, length }, 'z');
    const narrow = mowNextDoor(config.mower.deck, 'x');
    console.info(
      `Pacing next door: 30-inch ${minutes(wideRows.seconds)} min across, ` +
        `${minutes(wideColumns.seconds)} min up and down; 22-inch ${minutes(narrow.seconds)} min`,
    );
    for (const run of [wideRows, wideColumns]) {
      expect(run.progress).toBeGreaterThanOrEqual(0.98);
      expect(run.seconds).toBeGreaterThan(180);
      expect(run.seconds).toBeLessThan(330);
      expect(stripeNeatness(run.grid, config.money.neatnessPatch)).toBeGreaterThan(
        config.money.tipFull,
      );
    }
    expect(narrow.seconds).toBeGreaterThan(wideRows.seconds * 1.25);
  });
});
