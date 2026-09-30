// @ts-check

/**
 * A recording of everything that cut a lawn since it last grew back, one step per 60 Hz
 * cutting tick, so the whole mow can be played back later: the timelapse. Cutting is
 * deterministic, so replaying the same steps on the grown-back lawn makes exactly the same
 * lawn again. Pure: no Babylon.
 *
 * Steps are what the cutters gave the grid, in lawn-local meters. Ticks where nothing moved,
 * or that were nowhere near this lawn, aren't kept, so the replay skips the waiting around.
 *
 * @typedef {import('./deckPose.js').DeckPose} DeckPose
 * @typedef {import('./GrassGrid.js').Deck} Deck
 * @typedef {{ x: number, z: number }} Point
 * @typedef {{ x: number, z: number, yaw: number }} Pose A world pose.
 * @typedef {{ player: Pose, mower: Pose | null }} Actors Where Tuft and the parked mower
 *   were (world poses), for the replay to show them.
 * @typedef {{ inner: boolean, edges: boolean }} FinishParts See GrassGrid.shrinkRemaining.
 * @typedef {{ kind: 'deck', from: DeckPose | null, to: DeckPose, deck: Deck, cutTo: number }
 *   | { kind: 'trim', from: Point | null, to: Point, radius: number, cutTo: number,
 *     actors: Actors | null }
 *   | { kind: 'finish', parts: FinishParts }} CutStep deck: the mower (from null = a fresh
 *   stroke); trim: the string trimmer; finish: the leftovers shrinking away when a job's done.
 */

/** Steps recorded per second of cutting (one per tick, see DeckCutter). */
export const STEPS_PER_SECOND = 60;

export class CutRecording {
  /**
   * @param {{ width: number, depth: number }} size The lawn, in meters.
   * @param {number} [margin] Meters round the lawn that still count as near it.
   */
  constructor(size, margin = 1) {
    this.size = size;
    this.margin = margin;
    /** @type {Actors | null} Who's trimming this frame (set before trimming). */
    this.actors = null;
    this.clear();
  }

  /** Starts afresh (the lawn grew back). */
  clear() {
    /** @type {CutStep[]} */
    this.steps = [];
    this.fromScratch = true; // false once the lawn changed in a way we can't replay
  }

  /** The lawn was changed some way that can't be replayed (mowed all at once, on loading). */
  spoil() {
    this.steps = [];
    this.fromScratch = false;
  }

  /** Whether there's a whole mow, from the grown-back lawn, to replay. */
  get canReplay() {
    return this.fromScratch && this.steps.length > 0;
  }

  /** Seconds of cutting recorded. */
  get seconds() {
    return this.steps.length / STEPS_PER_SECOND;
  }

  /**
   * @param {DeckPose | null} from
   * @param {DeckPose} to
   * @param {Deck} deck
   * @param {number} cutTo
   */
  addDeck(from, to, deck, cutTo) {
    if (!this.isNear(to, deck.width) || (from && samePlace(from, to))) return;
    const size = { width: deck.width, length: deck.length };
    this.steps.push({ kind: 'deck', from, to, deck: size, cutTo });
  }

  /**
   * @param {Point | null} from
   * @param {Point} to
   * @param {number} radius
   * @param {number} cutTo
   */
  addTrim(from, to, radius, cutTo) {
    if (!this.isNear(to, radius) || (from && samePlace(from, to))) return;
    this.steps.push({ kind: 'trim', from, to, radius, cutTo, actors: this.actors });
  }

  /** @param {FinishParts} parts */
  addFinish(parts) {
    this.steps.push({ kind: 'finish', parts: { ...parts } });
  }

  /**
   * @param {Point} point Lawn-local meters.
   * @param {number} reach How far the tool reaches from it.
   */
  isNear(point, reach) {
    const pad = this.margin + reach;
    const { width, depth } = this.size;
    return point.x > -pad && point.x < width + pad && point.z > -pad && point.z < depth + pad;
  }
}

/**
 * Cuts a grid just the way the recorded step did.
 *
 * @param {import('./GrassGrid.js').GrassGrid} grid
 * @param {CutStep} step
 * @returns {number} Grass cut (see GrassGrid.cutDeck); 0 for finishing off.
 */
export function replayStep(grid, step) {
  if (step.kind === 'deck') {
    return step.from
      ? grid.cutStroke(step.from, step.to, step.deck, step.cutTo)
      : grid.cutDeck(step.to, step.deck, step.cutTo);
  }
  if (step.kind === 'trim') {
    return step.from
      ? grid.cutCircleStroke(step.from, step.to, step.radius, step.cutTo)
      : grid.cutCircle(step.to.x, step.to.z, step.radius, step.cutTo);
  }
  grid.shrinkRemaining(Infinity, step.parts);
  return 0;
}

/**
 * How many times faster than life to play a recording back: fast enough that it takes
 * about `duration` seconds, but within limits, so a quick job isn't a blur and a long one
 * isn't a crawl.
 *
 * @param {number} seconds Seconds recorded.
 * @param {{ duration: number, minSpeed: number, maxSpeed: number }} settings
 */
export function replaySpeed(seconds, { duration, minSpeed, maxSpeed }) {
  return Math.min(maxSpeed, Math.max(minSpeed, seconds / duration));
}

/**
 * @param {Point & { yaw?: number }} a
 * @param {Point & { yaw?: number }} b
 */
function samePlace(a, b) {
  return a.x === b.x && a.z === b.z && (a.yaw ?? 0) === (b.yaw ?? 0);
}
