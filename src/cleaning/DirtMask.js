// @ts-check
import { ellipseReach, forEachTexelInEllipse, toEllipse } from './brushShape.js';
import { fullRect, unionRect } from './rect.js';

/**
 * How dirty each spot of a surface is: a grid of numbers from 0 (clean) to 1 (extremely dirty).
 *
 * This is pure data and math: it knows nothing about 3D, textures, or water. Something else
 * decides where the spray lands and how strong it is, then calls `scrub` or `scrubStroke`.
 *
 * Coordinates are in texels (grid cells): x from 0 to width, y from 0 to height.
 * Texel (i, j) covers the square from (i, j) to (i + 1, j + 1).
 */

/** A texel at or below this much dirt counts as clean for progress. */
export const CLEAN_THRESHOLD = 0.05;
/** Gap between brush stamps along a stroke, as a fraction of how far the brush reaches. */
const STAMP_SPACING = 0.35;
/** Upper limit on stamps per stroke, so a huge jump can't stall a frame. Each stamp is cheap
 * (a brush 5 texels wide touches ~120 texels), so this only matters for teleport-size jumps. */
const MAX_STAMPS_PER_STROKE = 256;

/** Kinds of dirt. Each texel has one; `typeRules` says how each reacts to the spray. */
export const DIRT_TYPE = { grime: 0, moss: 1 };

/**
 * How a dirt type reacts to the spray. The spray's strength at a texel (0..1, lower when far
 * away or at the soft edge of the spot) must be above `minStrength` to lift it at all, and
 * `rate` scales how fast it comes off after that.
 *
 * @typedef {{ minStrength: number, rate: number }} DirtRule
 */

/** @type {DirtRule[]} Indexed by DIRT_TYPE. Grime: anything lifts it. */
const DEFAULT_RULES = [
  { minStrength: 0, rate: 1 },
  { minStrength: 0.7, rate: 0.6 },
];

/**
 * A brush: a circle ({ radius }) or an ellipse ({ radiusX, radiusY, angle }), in texels, plus
 * how hard its edge is (0..1).
 *
 * @typedef {import('./brushShape.js').BrushShape & { hardness: number }} Brush
 */
/** @typedef {{ x: number, y: number }} Point */

export class DirtMask {
  /**
   * @param {number} width Texels across.
   * @param {number} height Texels down.
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.dirt = new Float32Array(width * height);
    /** How dirty each texel was at the start: its "worth" toward progress. */
    this.startingDirt = new Float32Array(width * height);
    /** The kind of dirt on each texel (a DIRT_TYPE value). */
    this.type = new Uint8Array(width * height);
    /** How each dirt type reacts to the spray. Replace to tune (e.g. from config). */
    this.typeRules = DEFAULT_RULES;
    /** Running totals for feedback; whoever reads them resets them to 0. */
    this.toughRemoved = 0; // dirt removed from tough types (e.g. moss)
    this.resistedTexels = 0; // tough texels the spray was too weak to lift
    /** Texels that started dirty (above CLEAN_THRESHOLD). */
    this.dirtyCount = 0;
    /** How many of those have been cleaned so far. */
    this.cleanedCount = 0;
    /** Total starting dirt of the texels that started dirty. */
    this.dirtyWeight = 0;
    /** Total starting dirt of the texels cleaned so far. */
    this.cleanedWeight = 0;
    /** @type {import('./rect.js').Rect | null} The part changed since last taken. */
    this.changedRect = null;
  }

  /**
   * 0 when nothing has been cleaned yet, 1 when everything that was dirty is clean.
   *
   * Weighted by starting dirt: cleaning an oil stain (1.0) counts four times as much as the
   * same area of light film (0.25). A texel only counts once it's fully clean.
   */
  get progress() {
    if (this.cleanedCount === this.dirtyCount) return 1; // exact, despite float rounding
    return this.cleanedWeight / this.dirtyWeight;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  get(x, y) {
    return this.dirt[y * this.width + x];
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  getType(x, y) {
    return this.type[y * this.width + x];
  }

  /**
   * Sets the starting dirt (and dirt type) everywhere and resets progress.
   *
   * @param {(x: number, y: number) => number} dirtAt Called with each texel's column and row.
   * @param {(x: number, y: number) => number} [typeAt] A DIRT_TYPE per texel (default grime).
   */
  fill(dirtAt, typeAt = () => DIRT_TYPE.grime) {
    this.dirtyCount = 0;
    this.cleanedCount = 0;
    this.dirtyWeight = 0;
    this.cleanedWeight = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const value = Math.min(1, Math.max(0, dirtAt(x, y)));
        const i = y * this.width + x;
        this.dirt[i] = value;
        this.startingDirt[i] = value;
        this.type[i] = typeAt(x, y);
        if (value > CLEAN_THRESHOLD) {
          this.dirtyCount++;
          this.dirtyWeight += value;
        }
      }
    }
    this.changedRect = fullRect(this.width, this.height);
  }

  /**
   * Records that texel `i` just became clean. Dirt only ever goes down, so this happens at
   * most once per texel.
   *
   * @param {number} i
   */
  markCleaned(i) {
    this.cleanedCount++;
    this.cleanedWeight += this.startingDirt[i];
  }

  /**
   * One stamp of the brush: removes up to `amount` dirt under its center, less toward its edge.
   *
   * @param {number} centerX
   * @param {number} centerY
   * @param {number} amount Dirt removed at the center at full strength (cleaning rate × dt).
   * @param {Brush} brush
   * @param {number} [strength] Spray strength 0..1 (weaker when far away). Default 1.
   * @returns {number} Total dirt actually removed (useful for feedback like splatter).
   */
  scrub(centerX, centerY, amount, brush, strength = 1) {
    const { hardness } = brush;
    let removed = 0;
    const ellipse = toEllipse(brush);
    const bounds = forEachTexelInEllipse(
      this.width,
      this.height,
      centerX,
      centerY,
      ellipse,
      (i, t) => {
        const before = this.dirt[i];
        if (before === 0) return;
        // How hard the water hits this texel: weaker far away and at the spot's soft edge.
        const force = strength * brushFalloff(t, hardness);
        const rule = this.typeRules[this.type[i]];
        if (force <= rule.minStrength) {
          this.resistedTexels++; // too weak to lift this kind of dirt
          return;
        }
        const effect = ((force - rule.minStrength) / (1 - rule.minStrength)) * rule.rate;
        const after = Math.max(0, before - amount * effect);
        this.dirt[i] = after;
        removed += before - after;
        if (rule.minStrength > 0) this.toughRemoved += before - after;
        if (before > CLEAN_THRESHOLD && after <= CLEAN_THRESHOLD) this.markCleaned(i);
      },
    );

    if (removed > 0) this.changedRect = unionRect(this.changedRect, bounds);
    return removed;
  }

  /**
   * Drags the brush from one point to another, as when the spray sweeps between frames.
   *
   * Without this, a quick sweep would only clean where the spray happened to be on each
   * frame, leaving a dotted line. The `amount` is shared across the stamps, so the total
   * cleaning depends on how long you spray, not on how fast you move.
   *
   * @param {Point} from Where the spray was last frame (already cleaned then).
   * @param {Point} to Where the spray is now.
   * @param {number} amount Dirt removed at the center over the whole stroke, at full strength.
   * @param {Brush} brush
   * @param {number} [strength] Spray strength 0..1. Default 1.
   * @returns {number} Total dirt actually removed.
   */
  scrubStroke(from, to, amount, brush, strength = 1) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    // Space stamps by how far the brush reaches in the direction of travel, so a thin
    // ellipse moving sideways still leaves no gaps.
    const reach = ellipseReach(toEllipse(brush), dx, dy);
    const stamps = Math.min(
      MAX_STAMPS_PER_STROKE,
      Math.max(1, Math.ceil(length / (reach * STAMP_SPACING))),
    );
    let removed = 0;
    for (let s = 1; s <= stamps; s++) {
      const t = s / stamps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      removed += this.scrub(x, y, amount / stamps, brush, strength);
    }
    return removed;
  }

  /**
   * Removes up to `amount` dirt from every texel at once. Used for the finishing flourish
   * that clears leftover specks when a job completes.
   *
   * @param {number} amount
   * @returns {number} Total dirt actually removed.
   */
  fadeAll(amount) {
    const { dirt } = this;
    let removed = 0;
    for (let i = 0; i < dirt.length; i++) {
      const before = dirt[i];
      if (before === 0) continue;
      const after = Math.max(0, before - amount);
      dirt[i] = after;
      removed += before - after;
      if (before > CLEAN_THRESHOLD && after <= CLEAN_THRESHOLD) this.markCleaned(i);
    }
    if (removed > 0) this.changedRect = fullRect(this.width, this.height);
    return removed;
  }

  /**
   * The part of the grid that changed since the last call (or null), so the renderer
   * re-uploads only that part.
   *
   * @returns {import('./rect.js').Rect | null}
   */
  takeChangedRect() {
    const rect = this.changedRect;
    this.changedRect = null;
    return rect;
  }

  /** Whether anything changed since the last call (and forget the changes). */
  takeChanges() {
    return this.takeChangedRect() !== null;
  }
}

/**
 * Brush strength at a distance from its center: full strength out to `hardness`, then a
 * smooth fade to zero at the edge. A high hardness gives the crisp "cleaning line" look.
 *
 * @param {number} t Distance from center divided by radius, 0..1.
 * @param {number} hardness 0..1.
 */
function brushFalloff(t, hardness) {
  if (t <= hardness) return 1;
  const s = (t - hardness) / (1 - hardness);
  return 1 - s * s * (3 - 2 * s);
}
