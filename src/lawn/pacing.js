// @ts-check
import { wrapAngle } from '../camera/cameraMath.js';
import { grassSpeedFactor, steerTowards, updateMotion } from '../mower/mowerMath.js';
import { DeckCutter } from './DeckCutter.js';
import { GrassGrid } from './GrassGrid.js';

/**
 * A pacing check: a tidy "good player" bot mows the lawn in straight back-and-forth rows,
 * using the real handling (mowerMath.js), the real grass (thick patches slow it down) and the
 * real cutting, and we time how long it takes to finish. It drives straight through
 * obstacles and turns on the spot, so it's a best case: real players take longer.
 *
 * Each row only runs as far as there's lawn under it, so an L-shaped lawn gets short rows
 * where it narrows (the bot then drives across the gap to the next row's far end, like you
 * would). That works as long as the rows only get shorter as it goes, as they do here.
 *
 * @typedef {import('./GrassGrid.js').Deck} Deck
 * @typedef {import('../mower/mowerMath.js').HandlingSettings & {
 *   grassSlowdown: number, minSpeedFactor: number, mouseFullTurnAngle: number,
 * }} MowerSettings
 * @typedef {{
 *   area: { width: number, depth: number, heightAt: (x: number, z: number) => number,
 *     densityAt?: (x: number, z: number) => number },
 *   texelsPerMeter: number, cutHeight: number, mower: MowerSettings, deck: Deck,
 *   overlap: number, along?: 'x' | 'z', completeAt?: number, maxSeconds?: number,
 * }} PacingOptions overlap: meters each row overlaps the last; along: which way rows run.
 */

const DT = 1 / 60;

/**
 * @param {PacingOptions} options
 * @returns {{ seconds: number, progress: number, rows: number, turningSeconds: number,
 *   grid: GrassGrid }} grid: the lawn as the bot left it.
 */
export function simulateRows(options) {
  const { area, mower, deck, cutHeight, along = 'x', completeAt = 0.98 } = options;
  const maxSeconds = options.maxSeconds ?? 1800;
  const grid = new GrassGrid({
    ...area,
    texelsPerMeter: options.texelsPerMeter,
    targetHeight: cutHeight,
  });
  grid.fill(area.heightAt, area.densityAt);
  const cutter = new DeckCutter(grid);

  // Rows run along `along`; `across` is the other axis.
  const rowLength = along === 'x' ? area.width : area.depth;
  const crossLength = along === 'x' ? area.depth : area.width;
  const spacing = deck.width - options.overlap;
  const rows = Math.max(1, Math.ceil((crossLength - deck.width) / spacing) + 1);
  const rowAt = (/** @type {number} */ row) =>
    Math.min(deck.width / 2 + row * spacing, crossLength - deck.width / 2);
  // Where each row's lawn starts and ends, as positions for the middle of the deck.
  const spans = Array.from({ length: rows }, (_, row) =>
    rowSpan(grid, along, rowAt(row), deck, rowLength),
  );
  /** Heading for travelling +along (row 0) or -along (row 1). */
  const headingFor = (/** @type {number} */ row) => {
    const forward = row % 2 === 0 ? 0 : Math.PI; // +z : -z
    return along === 'z' ? forward : wrapAngle(forward + Math.PI / 2); // +x : -x
  };
  /** @param {number} position along the row @param {number} cross */
  const poseAt = (position, cross, /** @type {number} */ yaw) =>
    along === 'x' ? { x: position, z: cross, yaw } : { x: cross, z: position, yaw };

  let row = 0;
  let position = spans[0].start;
  let cross = rowAt(0);
  let yaw = headingFor(0);
  let motion = { speed: 0, yawRate: 0 };
  /** @type {'push' | 'turn'} */
  let phase = 'push';
  let turnFrom = 0;
  let time = 0;
  let turningSeconds = 0;

  while (time < maxSeconds && grid.progress < completeAt) {
    const from = poseAt(position, cross, yaw);
    const direction = row % 2 === 0 ? 1 : -1;
    /** @type {{ throttle: number, turn: number }} */
    let controls;
    if (phase === 'push') {
      const { start, end } = spans[row];
      const remaining = direction > 0 ? end - position : position - start;
      const brakingDistance = (motion.speed * motion.speed) / (2 * mower.braking);
      controls = { throttle: remaining > brakingDistance + 0.02 ? 1 : 0, turn: 0 };
      if (remaining <= 0.01 || (controls.throttle === 0 && motion.speed <= 0.01)) {
        if (row + 1 >= rows) break;
        phase = 'turn';
        turnFrom = cross;
        row++;
      }
    } else {
      turningSeconds += DT;
      const target = headingFor(row);
      controls = { throttle: 0, turn: steerTowards(yaw, target, mower.mouseFullTurnAngle) };
      const done = 1 - Math.abs(wrapAngle(target - yaw)) / Math.PI; // 0..1 through the turn
      cross = turnFrom + (rowAt(row) - turnFrom) * done; // shuffle over to the next row
      if (Math.abs(wrapAngle(target - yaw)) < 0.01 && Math.abs(motion.yawRate) < 0.05) {
        yaw = target;
        cross = rowAt(row);
        phase = 'push';
      }
    }
    const factor = grassSpeedFactor(grid.workAhead(from, deck, cutHeight), mower);
    motion = updateMotion(motion, controls, mower, DT, factor);
    yaw = wrapAngle(yaw + motion.yawRate * DT);
    if (phase === 'push') position += motion.speed * DT * (row % 2 === 0 ? 1 : -1);
    cutter.update(DT, from, poseAt(position, cross, yaw), deck, cutHeight);
    time += DT;
  }
  return { seconds: time, progress: grid.progress, rows, turningSeconds, grid };
}

/**
 * How far along a row there's lawn under the deck's swath, as the positions the middle of the
 * deck has to reach to cut it all.
 *
 * @param {GrassGrid} grid
 * @param {'x' | 'z'} along
 * @param {number} cross Where the row is, across (meters).
 * @param {Deck} deck
 * @param {number} rowLength
 */
function rowSpan(grid, along, cross, deck, rowLength) {
  const t = grid.texelsPerMeter;
  const [crossCount, alongCount] =
    along === 'x' ? [grid.rows, grid.columns] : [grid.columns, grid.rows];
  const from = Math.max(0, Math.floor((cross - deck.width / 2) * t));
  const to = Math.min(crossCount - 1, Math.ceil((cross + deck.width / 2) * t) - 1);
  let first = alongCount;
  let last = -1;
  for (let c = from; c <= to; c++) {
    for (let a = 0; a < alongCount; a++) {
      const i = along === 'x' ? c * grid.columns + a : a * grid.columns + c;
      if (!grid.mask[i]) continue;
      first = Math.min(first, a);
      last = Math.max(last, a);
    }
  }
  const half = deck.length / 2;
  if (last < 0) return { start: half, end: half };
  const start = Math.max(half, first / t + half);
  const end = Math.min(rowLength - half, (last + 1) / t - half);
  return { start, end: Math.max(start, end) };
}
