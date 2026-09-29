// @ts-check
import { unionRect } from '../math/rect.js';
import { strokePoses } from './deckPose.js';

/**
 * @typedef {import('../math/rect.js').Rect} Rect
 * @typedef {import('./deckPose.js').DeckPose} DeckPose
 * @typedef {{ width: number, length: number }} Deck The cutting area under the mower, in
 *   meters: width is side to side, length is front to back.
 */

/** Grass within this much of the target height counts as mowed. */
export const MOWED_TOLERANCE = 0.02;
/** Density that shows as the thickest-looking grass (the texture can't store more). */
export const MAX_DENSITY = 3;
/** Strokes stamp the deck at least this often, as a fraction of its smaller side. */
const STAMP_SPACING = 0.5;
/** ...and at least every this many radians while turning. */
const STAMP_TURN = 0.08;

/**
 * The lawn as a grid of grass, one set of values per texel. Pure data: no Babylon, so it's
 * easy to test. The renderer (GrassField) turns it into a texture.
 *
 * Coordinates are lawn-local meters: x runs across the lawn, z along it, from its corner.
 * Texel (0, 0) is that corner; texture u follows x and v follows z.
 *
 * Per texel:
 * - height: a fraction of the tallest grass (config.grass.maxHeight): 1 = full length
 * - mask: 1 where there's lawn at all, 0 on paths and flower beds
 * - density: how thick the grass is (1 = normal). Thick grass is harder work to mow.
 * - mow direction: which way the deck was facing when it last passed over, for stripes
 *
 * Progress is weighted: each texel counts for the grass it had to lose (starting height above
 * the target, times density), so tall, thick patches count for more than scrappy ones.
 */
export class GrassGrid {
  /**
   * @param {{ width: number, depth: number, texelsPerMeter: number, targetHeight: number }} options
   *   Lawn size in meters; targetHeight is the height (0..1) that counts as mowed.
   */
  constructor({ width, depth, texelsPerMeter, targetHeight }) {
    if (!(width > 0 && depth > 0 && texelsPerMeter > 0 && targetHeight >= 0)) {
      throw new Error(
        `GrassGrid: bad options ${JSON.stringify({ width, depth, texelsPerMeter, targetHeight })}`,
      );
    }
    this.texelsPerMeter = texelsPerMeter;
    this.targetHeight = targetHeight;
    this.columns = Math.max(1, Math.round(width * texelsPerMeter));
    this.rows = Math.max(1, Math.round(depth * texelsPerMeter));
    const count = this.columns * this.rows;
    this.height = new Float32Array(count);
    this.startHeight = new Float32Array(count);
    this.mask = new Uint8Array(count);
    this.density = new Float32Array(count);
    /** How much each texel counts toward progress (see the class comment). */
    this.weight = new Float32Array(count);
    /** Mowing direction (a unit vector on the ground), or 0, 0 where never mowed. */
    this.mowX = new Float32Array(count);
    this.mowZ = new Float32Array(count);
    this.totalWeight = 0;
    this.remainingWeight = 0;
    /** @type {Rect | null} Texels changed since the last takeChangedRect(). */
    this.changedRect = null;
  }

  /**
   * Sets up every texel from functions of its center, in lawn-local meters.
   *
   * @param {(x: number, z: number) => number} heightAt Starting height (0..1), 0 for no lawn.
   * @param {(x: number, z: number) => number} [densityAt] Grass thickness (1 = normal).
   */
  fill(heightAt, densityAt = () => 1) {
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const i = row * this.columns + column;
        const x = (column + 0.5) / this.texelsPerMeter;
        const z = (row + 0.5) / this.texelsPerMeter;
        const height = heightAt(x, z);
        this.startHeight[i] = Math.min(1, Math.max(0, height));
        this.mask[i] = height > 0 ? 1 : 0;
        this.density[i] = this.mask[i] ? Math.max(0, densityAt(x, z)) : 0;
      }
    }
    this.reset();
  }

  /** Grows all the grass back to how it started. */
  reset() {
    this.height.set(this.startHeight);
    this.mowX.fill(0);
    this.mowZ.fill(0);
    let total = 0;
    for (let i = 0; i < this.height.length; i++) {
      const excess = this.startHeight[i] - this.targetHeight - MOWED_TOLERANCE;
      this.weight[i] = this.mask[i] && excess > 0 ? excess * this.density[i] : 0;
      total += this.weight[i];
    }
    this.totalWeight = total;
    this.remainingWeight = total;
    this.markChanged(this.fullRect());
  }

  /** Fraction of the lawn mowed (weighted), 0..1. */
  get progress() {
    if (this.totalWeight <= 0) return 1;
    return Math.min(1, Math.max(0, 1 - this.remainingWeight / this.totalWeight));
  }

  /** @param {number} i Texel index. */
  isMowed(i) {
    return this.height[i] <= this.targetHeight + MOWED_TOLERANCE;
  }

  /**
   * Cuts the grass under the deck (a rectangle centered on the pose) down to `cutTo`, and
   * records the mowing direction there.
   *
   * @param {DeckPose} pose
   * @param {Deck} deck
   * @param {number} cutTo Height to cut down to (0..1).
   * @returns {number} How much grass was cut, in square meters of full-height, normal-density
   *   grass (so 1 m² of full grass cut to 0.3 gives 0.7).
   */
  cutDeck(pose, deck, cutTo) {
    const cutHeight = Math.fround(cutTo); // heights are stored as 32-bit floats
    const forwardX = Math.sin(pose.yaw);
    const forwardZ = Math.cos(pose.yaw);
    let cut = 0;
    const rect = this.forEachTexelIn(pose, deck.width, deck.length, (i) => {
      if (!this.mask[i]) return;
      const height = this.height[i];
      if (height > cutHeight) {
        const wasMowed = this.isMowed(i);
        cut += (height - cutHeight) * this.density[i];
        this.height[i] = cutHeight;
        if (!wasMowed && this.isMowed(i)) this.remainingWeight -= this.weight[i];
      }
      this.mowX[i] = forwardX;
      this.mowZ[i] = forwardZ;
    });
    if (rect) this.markChanged(rect);
    return cut / (this.texelsPerMeter * this.texelsPerMeter);
  }

  /**
   * How hard the grass just in front of the deck is to push through: the average grass there
   * above `cutTo`, times its density, where full-length, normal grass is 1 and short (or no)
   * grass is 0. Thick patches go above 1.
   *
   * @param {DeckPose} pose
   * @param {Deck} deck
   * @param {number} cutTo
   */
  workAhead(pose, deck, cutTo) {
    const strip = 0.1; // meters in front of the deck
    const reach = deck.length / 2 + strip / 2;
    const ahead = {
      x: pose.x + Math.sin(pose.yaw) * reach,
      z: pose.z + Math.cos(pose.yaw) * reach,
      yaw: pose.yaw,
    };
    let work = 0;
    let count = 0;
    this.forEachTexelIn(ahead, deck.width, strip, (i) => {
      count++;
      if (this.mask[i]) work += Math.max(0, this.height[i] - cutTo) * this.density[i];
    });
    return count > 0 ? work / count / Math.max(1 - cutTo, 0.01) : 0;
  }

  /**
   * Calls `visit` with the index of every texel whose center is inside a rectangle centered
   * on the pose (width across its heading, length along it).
   *
   * @param {DeckPose} pose
   * @param {number} width
   * @param {number} length
   * @param {(i: number) => void} visit
   * @returns {Rect | null} The texels that were checked, or null if none (off the grid).
   */
  forEachTexelIn(pose, width, length, visit) {
    const t = this.texelsPerMeter;
    const forwardX = Math.sin(pose.yaw);
    const forwardZ = Math.cos(pose.yaw);
    // "right" = (forwardZ, -forwardX)
    const halfWidth = width / 2;
    const halfLength = length / 2;
    // How far the rotated rectangle reaches along x and z.
    const reachX = Math.abs(forwardZ) * halfWidth + Math.abs(forwardX) * halfLength;
    const reachZ = Math.abs(forwardX) * halfWidth + Math.abs(forwardZ) * halfLength;
    // Texels whose centers ((index + 0.5) / t) could be inside.
    const minX = Math.max(0, Math.ceil((pose.x - reachX) * t - 0.5));
    const maxX = Math.min(this.columns - 1, Math.floor((pose.x + reachX) * t - 0.5));
    const minY = Math.max(0, Math.ceil((pose.z - reachZ) * t - 0.5));
    const maxY = Math.min(this.rows - 1, Math.floor((pose.z + reachZ) * t - 0.5));
    if (minX > maxX || minY > maxY) return null;
    for (let row = minY; row <= maxY; row++) {
      const dz = (row + 0.5) / t - pose.z;
      for (let column = minX; column <= maxX; column++) {
        const dx = (column + 0.5) / t - pose.x;
        const along = dx * forwardX + dz * forwardZ;
        const side = dx * forwardZ - dz * forwardX;
        if (Math.abs(along) <= halfLength && Math.abs(side) <= halfWidth) {
          visit(row * this.columns + column);
        }
      }
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Cuts along the deck's path from one pose to the next, stamping it often enough that
   * even a fast-moving or turning mower leaves no gaps. `from` itself was already cut.
   *
   * @param {DeckPose} from
   * @param {DeckPose} to
   * @param {Deck} deck
   * @param {number} cutTo
   * @returns {number} Grass cut (see cutDeck).
   */
  cutStroke(from, to, deck, cutTo) {
    const spacing = Math.min(deck.width, deck.length) * STAMP_SPACING;
    let cut = 0;
    for (const pose of strokePoses(from, to, spacing, STAMP_TURN)) {
      cut += this.cutDeck(pose, deck, cutTo);
    }
    return cut;
  }

  /**
   * Cuts long grass inside a circle (the string trimmer's spinning line) down to `cutTo`.
   * Grass that's already mowed is left alone, so trimming over neat stripes doesn't smudge
   * them, and trimmed grass gets no mowing direction (no stripes).
   *
   * @param {number} x Center, in lawn-local meters.
   * @param {number} z
   * @param {number} radius Meters.
   * @param {number} cutTo Height to cut down to (0..1).
   * @returns {number} Grass cut (see cutDeck).
   */
  cutCircle(x, z, radius, cutTo) {
    const cutHeight = Math.fround(cutTo);
    const t = this.texelsPerMeter;
    const minX = Math.max(0, Math.ceil((x - radius) * t - 0.5));
    const maxX = Math.min(this.columns - 1, Math.floor((x + radius) * t - 0.5));
    const minY = Math.max(0, Math.ceil((z - radius) * t - 0.5));
    const maxY = Math.min(this.rows - 1, Math.floor((z + radius) * t - 0.5));
    if (minX > maxX || minY > maxY) return 0;
    const radiusSquared = radius * radius;
    let cut = 0;
    for (let row = minY; row <= maxY; row++) {
      const dz = (row + 0.5) / t - z;
      for (let column = minX; column <= maxX; column++) {
        const dx = (column + 0.5) / t - x;
        const i = row * this.columns + column;
        if (dx * dx + dz * dz > radiusSquared || !this.mask[i] || this.isMowed(i)) continue;
        if (this.height[i] <= cutHeight) continue;
        cut += (this.height[i] - cutHeight) * this.density[i];
        this.height[i] = cutHeight;
        if (this.isMowed(i)) this.remainingWeight -= this.weight[i];
      }
    }
    this.markChanged({ minX, minY, maxX, maxY });
    return cut / (t * t);
  }

  /**
   * Cuts along a line of circles from one point to the next, close enough together to leave
   * no gaps. `from` itself was already cut.
   *
   * @param {{ x: number, z: number }} from
   * @param {{ x: number, z: number }} to
   * @param {number} radius
   * @param {number} cutTo
   * @returns {number} Grass cut (see cutDeck).
   */
  cutCircleStroke(from, to, radius, cutTo) {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(distance / (radius * STAMP_SPACING)));
    let cut = 0;
    for (let step = 1; step <= steps; step++) {
      const f = step / steps;
      cut += this.cutCircle(
        from.x + (to.x - from.x) * f,
        from.z + (to.z - from.z) * f,
        radius,
        cutTo,
      );
    }
    return cut;
  }

  /**
   * Shortens every uncut texel by up to `amount`, but never below the target height. Called
   * each frame for a moment when a job completes, so the last tufts shrink away.
   *
   * @param {number} amount
   * @returns {boolean} True while any grass is still above the target.
   */
  shrinkRemaining(amount) {
    const floor = Math.fround(this.targetHeight); // heights are stored as 32-bit floats
    let anyLeft = false;
    for (let i = 0; i < this.height.length; i++) {
      if (!this.mask[i] || this.height[i] <= floor) continue;
      const wasMowed = this.isMowed(i);
      this.height[i] = Math.max(floor, this.height[i] - amount);
      if (!wasMowed && this.isMowed(i)) this.remainingWeight -= this.weight[i];
      if (this.height[i] > floor) anyLeft = true;
    }
    this.markChanged(this.fullRect());
    return anyLeft;
  }

  /** @returns {Rect} */
  fullRect() {
    return { minX: 0, minY: 0, maxX: this.columns - 1, maxY: this.rows - 1 };
  }

  /** @param {Rect} rect */
  markChanged(rect) {
    this.changedRect = unionRect(this.changedRect, rect);
  }

  /** The texels changed since the last call (or null), and starts tracking afresh. */
  takeChangedRect() {
    const rect = this.changedRect;
    this.changedRect = null;
    return rect;
  }

  /**
   * Packs a rectangle of the grid into RGBA bytes for the GPU, row by row: red = height,
   * green and blue = mowing direction x and z (mapped from -1..1 to 0..255, so 128 = none),
   * alpha = 0 where there's no lawn, else 128 (normal density) up to 255 (MAX_DENSITY).
   *
   * @param {Uint8Array} target At least (rect width × height × 4) bytes.
   * @param {Rect} rect
   */
  writeTexels(target, rect) {
    let o = 0;
    for (let row = rect.minY; row <= rect.maxY; row++) {
      const start = row * this.columns;
      for (let i = start + rect.minX, end = start + rect.maxX; i <= end; i++) {
        // `(v * 255 + 0.5) | 0` rounds 0..1 to 0..255, a little faster than Math.round.
        target[o++] = (this.height[i] * 255 + 0.5) | 0;
        target[o++] = ((this.mowX[i] * 0.5 + 0.5) * 255 + 0.5) | 0;
        target[o++] = ((this.mowZ[i] * 0.5 + 0.5) * 255 + 0.5) | 0;
        const thick = Math.min(1, Math.max(0, (this.density[i] - 1) / (MAX_DENSITY - 1)));
        target[o++] = this.mask[i] ? (128 + thick * 127 + 0.5) | 0 : 0;
      }
    }
  }
}
