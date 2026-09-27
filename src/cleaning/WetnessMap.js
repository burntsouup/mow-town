// @ts-check
import { ellipseReach, forEachTexelInEllipse, toEllipse } from './brushShape.js';
import { fullRect, unionRect } from './rect.js';

/**
 * How wet each spot of a surface is: 0 (dry) to 1 (soaked). Uses the same grid as the
 * surface's DirtMask. Spraying soaks the area under the spray; everything then dries at a
 * steady rate. Pure data and math, like DirtMask.
 */

/** Gap between soak stamps along a stroke, as a fraction of the radius. */
const STAMP_SPACING = 0.5;
const MAX_STAMPS_PER_STROKE = 128;

export class WetnessMap {
  /**
   * @param {number} width Texels across.
   * @param {number} height Texels down.
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.wetness = new Float32Array(width * height);
    /** @type {import('./rect.js').Rect | null} Everywhere that might still be wet. */
    this.wetRect = null;
    /** @type {import('./rect.js').Rect | null} The part changed since last taken. */
    this.changedRect = null;
    // Starts fully dry, so drying has nothing to do until the first soak.
    this.secondsSinceSoak = Number.POSITIVE_INFINITY;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  get(x, y) {
    return this.wetness[y * this.width + x];
  }

  /**
   * Soaks an area: fully wet in the middle, with a soft edge. Never makes a spot drier.
   *
   * @param {number} centerX Texels.
   * @param {number} centerY Texels.
   * @param {number | import('./brushShape.js').BrushShape} shape A radius, or a circle/ellipse.
   * @param {number} [intensity] How wet the middle gets, 0..1. Default 1 (soaked).
   */
  soak(centerX, centerY, shape, intensity = 1) {
    const ellipse = toEllipse(typeof shape === 'number' ? { radius: shape } : shape);
    const { wetness } = this;
    /** @param {number} i @param {number} t */
    const wet = (i, t) => {
      const soaked = (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4) * intensity;
      if (soaked > wetness[i]) wetness[i] = soaked;
    };
    const bounds = forEachTexelInEllipse(this.width, this.height, centerX, centerY, ellipse, wet);
    if (!bounds) return;
    this.wetRect = unionRect(this.wetRect, bounds);
    this.changedRect = unionRect(this.changedRect, bounds);
    this.secondsSinceSoak = 0;
  }

  /**
   * Soaks along a line, so a fast sweep leaves a continuous wet trail.
   *
   * @param {{ x: number, y: number }} from
   * @param {{ x: number, y: number }} to
   * @param {number | import('./brushShape.js').BrushShape} shape A radius, or a circle/ellipse.
   */
  soakStroke(from, to, shape) {
    const ellipse = toEllipse(typeof shape === 'number' ? { radius: shape } : shape);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const reach = ellipseReach(ellipse, dx, dy);
    const stamps = Math.min(
      MAX_STAMPS_PER_STROKE,
      Math.max(1, Math.ceil(Math.hypot(dx, dy) / (reach * STAMP_SPACING))),
    );
    for (let s = 1; s <= stamps; s++) {
      const t = s / stamps;
      this.soak(from.x + dx * t, from.y + dy * t, ellipse);
    }
  }

  /**
   * A thin line of water running from a point, like a drip trickling down a wall. It fades
   * from `startWetness` to `endWetness` along its length.
   *
   * @param {{ x: number, y: number }} from Texels.
   * @param {{ x: number, y: number }} direction Unit vector in texels (which way is "down").
   * @param {number} length Texels.
   * @param {number} width Texels.
   * @param {number} startWetness
   * @param {number} endWetness
   */
  trickle(from, direction, length, width, startWetness, endWetness) {
    const steps = Math.max(1, Math.ceil(length / (width * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const wet = startWetness + (endWetness - startWetness) * t;
      this.soak(from.x + direction.x * length * t, from.y + direction.y * length * t, width, wet);
    }
  }

  /**
   * Dries everything a little. A fully soaked spot is dry after `dryTime` seconds.
   *
   * @param {number} dt Seconds since the previous frame.
   * @param {number} dryTime Seconds for a soaked spot to dry completely.
   */
  dry(dt, dryTime) {
    // Everything is already dry: skip the work entirely.
    const wet = this.wetRect;
    if (!wet || this.secondsSinceSoak >= dryTime) return;
    this.secondsSinceSoak += dt;
    const amount = dt / dryTime;
    const { wetness, width } = this;
    // Only the area that was soaked can be wet, so only look there.
    for (let y = wet.minY; y <= wet.maxY; y++) {
      for (let i = y * width + wet.minX, end = y * width + wet.maxX; i <= end; i++) {
        if (wetness[i] > 0) wetness[i] = Math.max(0, wetness[i] - amount);
      }
    }
    this.changedRect = unionRect(this.changedRect, wet);
    // A soaked spot dries in dryTime, so by now everything is dry.
    if (this.secondsSinceSoak >= dryTime) this.wetRect = null;
  }

  /**
   * The part of the grid that changed since the last call (or null).
   *
   * @returns {import('./rect.js').Rect | null}
   */
  takeChangedRect() {
    const rect = this.changedRect;
    this.changedRect = null;
    return rect;
  }

  /** Whether the wetness changed since the last call (and forget the changes). */
  takeChanges() {
    return this.takeChangedRect() !== null;
  }

  /** Instantly dries everything (e.g. when restarting a job). */
  dryCompletely() {
    this.wetness.fill(0);
    this.secondsSinceSoak = Number.POSITIVE_INFINITY;
    this.wetRect = null;
    this.changedRect = fullRect(this.width, this.height);
  }
}
