// @ts-check
import { unionRect } from '../math/rect.js';

/** @typedef {import('../math/rect.js').Rect} Rect */

/**
 * The lawn as a grid of grass heights, one value per texel. Pure data: no Babylon, so it's
 * easy to test. The renderer (GrassField) turns it into a texture.
 *
 * Coordinates are lawn-local meters: x runs across the lawn, z along it, from its corner.
 * Texel (0, 0) is that corner; texture u follows x and v follows z.
 *
 * Heights are fractions of the tallest grass (config.grass.maxHeight): 1 = full length,
 * 0 = bare ground.
 */
export class GrassGrid {
  /**
   * @param {{ width: number, depth: number, texelsPerMeter: number }} size Lawn size in meters.
   */
  constructor({ width, depth, texelsPerMeter }) {
    if (!(width > 0 && depth > 0 && texelsPerMeter > 0)) {
      throw new Error(`GrassGrid: bad size ${JSON.stringify({ width, depth, texelsPerMeter })}`);
    }
    this.texelsPerMeter = texelsPerMeter;
    this.columns = Math.max(1, Math.round(width * texelsPerMeter));
    this.rows = Math.max(1, Math.round(depth * texelsPerMeter));
    const count = this.columns * this.rows;
    this.height = new Float32Array(count);
    /** 1 where there's lawn, 0 where there isn't (a path, a flower bed). */
    this.mask = new Uint8Array(count);
    /** @type {Rect | null} Texels changed since the last takeChangedRect(). */
    this.changedRect = null;
  }

  /**
   * Sets up every texel from a function of its center, in lawn-local meters.
   *
   * @param {(x: number, z: number) => number} heightAt Starting height (0..1), or 0 for no lawn.
   */
  fill(heightAt) {
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const i = row * this.columns + column;
        const height = heightAt(
          (column + 0.5) / this.texelsPerMeter,
          (row + 0.5) / this.texelsPerMeter,
        );
        this.height[i] = Math.min(1, Math.max(0, height));
        this.mask[i] = height > 0 ? 1 : 0;
      }
    }
    this.markChanged({ minX: 0, minY: 0, maxX: this.columns - 1, maxY: this.rows - 1 });
  }

  /**
   * Cuts a round patch down to `cutTo` (debug brush for the rendering spike).
   *
   * @param {number} x Center, lawn-local meters.
   * @param {number} z
   * @param {number} radius Meters.
   * @param {number} cutTo Height to cut down to (0..1).
   */
  cutCircle(x, z, radius, cutTo) {
    const t = this.texelsPerMeter;
    const minX = Math.max(0, Math.floor((x - radius) * t));
    const maxX = Math.min(this.columns - 1, Math.ceil((x + radius) * t));
    const minY = Math.max(0, Math.floor((z - radius) * t));
    const maxY = Math.min(this.rows - 1, Math.ceil((z + radius) * t));
    if (minX > maxX || minY > maxY) return;
    const radiusSquared = radius * radius;
    for (let row = minY; row <= maxY; row++) {
      const dz = (row + 0.5) / t - z;
      for (let column = minX; column <= maxX; column++) {
        const dx = (column + 0.5) / t - x;
        if (dx * dx + dz * dz > radiusSquared) continue;
        const i = row * this.columns + column;
        if (this.mask[i] && this.height[i] > cutTo) this.height[i] = cutTo;
      }
    }
    this.markChanged({ minX, minY, maxX, maxY });
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
   * alpha = lawn mask. (Green and blue are reserved for the mowing direction.)
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
        target[o++] = 128;
        target[o++] = 128;
        target[o++] = this.mask[i] ? 255 : 0;
      }
    }
  }
}
