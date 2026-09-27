import { config } from '../config.js';
import { sprayFootprint } from '../pressure-washer/sprayMath.js';

/**
 * The water as it leaves the nozzle: which way it goes, how its flat fan is turned, how big
 * the spot would be head-on (meters), and how hard it hits (0..1).
 *
 * @typedef {{
 *   sprayDirection: Vec3, wide: Vec3, thin: Vec3, radius: number, strength: number,
 * }} SprayShape
 * @typedef {{ x: number, y: number, z: number }} Vec3
 */

/**
 * @typedef {{ removed: number, toughRemoved: number, resisted: number }} SprayResult
 *   removed: all dirt removed; toughRemoved: the part that was tough dirt (moss);
 *   resisted: how many tough texels the spray was too weak to lift.
 */

/**
 * Knows every cleanable surface and applies spray hits to them.
 *
 * The pressure washer raycasts into the scene and hands the hit to `spray()`. This class
 * turns that into dirt removal, continuing the stroke from last frame's hit so fast sweeps
 * leave no gaps.
 */
export class CleaningSystem {
  constructor() {
    /** @type {Map<import('@babylonjs/core').AbstractMesh, import('./CleanableSurface.js').CleanableSurface>} */
    this.surfaces = new Map();
    /** @type {{ surface: import('./CleanableSurface.js').CleanableSurface, point: { x: number, y: number } } | null} */
    this.lastHit = null;
    /** The job whose leftover dirt is fading away after completing, or null. */
    this.finishingJob = /** @type {string | null} */ (null);
  }

  /**
   * The surfaces that belong to a job.
   *
   * @param {string} job
   */
  surfacesFor(job) {
    return [...this.surfaces.values()].filter((surface) => surface.job === job);
  }

  /** @param {import('./CleanableSurface.js').CleanableSurface} surface */
  add(surface) {
    this.surfaces.set(surface.mesh, surface);
  }

  /**
   * @param {import('@babylonjs/core').PickingInfo | null} hit Where the spray landed.
   * @param {number} dt Seconds since the previous frame.
   * @param {SprayShape} spray
   * @returns {SprayResult} What happened this frame (all zero if it missed every surface).
   */
  spray(hit, dt, spray) {
    const surface = hit?.hit && hit.pickedMesh ? this.surfaces.get(hit.pickedMesh) : undefined;
    const uv = surface ? hit?.getTextureCoordinates() : null;
    if (!surface || !uv) {
      this.lastHit = null; // the stroke is broken; don't draw a line across the gap
      return { removed: 0, toughRemoved: 0, resisted: 0 };
    }

    const settings = config.cleaning;
    const point = surface.uvToTexel(uv.x, uv.y);
    const from = this.lastHit?.surface === surface ? this.lastHit.point : point;

    // Lay the flat fan of water onto this surface as an ellipse (in texels).
    const footprint = sprayFootprint({
      ...spray,
      ...surface.axes,
      flatness: config.washer.fanFlatness,
      maxStretch: config.washer.maxStretch,
    });
    const brush = {
      radiusX: surface.metersToTexels(footprint.radiusX),
      radiusY: surface.metersToTexels(footprint.radiusY),
      angle: footprint.angle,
      hardness: settings.brushHardness,
    };
    // Spread thinner when it lands at an angle: same water, more area.
    const amount = settings.cleanRate * dt * footprint.density;
    const { mask } = surface;
    mask.toughRemoved = 0;
    mask.resistedTexels = 0;
    const removed = mask.scrubStroke(from, point, amount, brush, spray.strength);
    // Water spreads a little beyond where it cleans.
    const spread = settings.wetSpread;
    surface.wetness.soakStroke(from, point, {
      radiusX: brush.radiusX * spread,
      radiusY: brush.radiusY * spread,
      angle: brush.angle,
    });
    // On upright surfaces, some of it trickles down.
    if (surface.down && Math.random() < settings.dripChance) {
      const { down } = surface;
      const sideways = (Math.random() - 0.5) * 2 * Math.max(brush.radiusX, brush.radiusY);
      const start = { x: point.x - down.y * sideways, y: point.y + down.x * sideways };
      const [shortest, longest] = settings.dripLength;
      const length = surface.metersToTexels(shortest + Math.random() * (longest - shortest));
      const width = surface.metersToTexels(settings.dripWidth);
      surface.wetness.trickle(start, down, length, width, 1, 0.5);
    }
    this.lastHit = { surface, point };
    return { removed, toughRemoved: mask.toughRemoved, resisted: mask.resistedTexels };
  }

  /** Call when the spray stops, so the next spray starts a fresh stroke. */
  stopSpraying() {
    this.lastHit = null;
  }

  /**
   * Fraction of a job's dirt that has been cleaned, 0..1. Weighted by how dirty each spot
   * started, like DirtMask.progress.
   *
   * @param {string} job
   */
  progressFor(job) {
    let dirtyWeight = 0;
    let cleanedWeight = 0;
    let allClean = true;
    for (const { mask } of this.surfacesFor(job)) {
      dirtyWeight += mask.dirtyWeight;
      cleanedWeight += mask.cleanedWeight;
      if (mask.cleanedCount !== mask.dirtyCount) allClean = false;
    }
    return allClean ? 1 : cleanedWeight / dirtyWeight;
  }

  /** @param {number} dt Seconds since the previous frame. */
  update(dt) {
    if (this.finishingJob) {
      // Fade out every leftover speck of the job together; stop once nothing is left.
      let removed = 0;
      const amount = dt / config.job.finishFadeTime;
      for (const { mask } of this.surfacesFor(this.finishingJob)) removed += mask.fadeAll(amount);
      if (removed === 0) this.finishingJob = null;
    }
    // Dry every surface a little and send any changes to the GPU.
    for (const surface of this.surfaces.values()) surface.update(dt);
  }

  /**
   * Starts the finishing flourish: all of a job's remaining dirt fades away over a moment.
   *
   * @param {string} job
   */
  finishRemaining(job) {
    this.finishingJob = job;
  }

  /**
   * Highlights the dirt left on one job's surfaces (and none elsewhere).
   *
   * @param {number} amount 0..1: how strongly.
   * @param {string} job
   */
  setHighlight(amount, job) {
    for (const surface of this.surfaces.values()) {
      surface.plugin.highlight = surface.job === job ? amount : 0;
    }
  }

  /**
   * Puts a job's dirt back, for another go.
   *
   * @param {string} job
   */
  reset(job) {
    if (this.finishingJob === job) this.finishingJob = null;
    this.lastHit = null;
    for (const surface of this.surfacesFor(job)) surface.fillWithStartingDirt();
  }
}
