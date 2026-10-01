// @ts-check
import { clamp } from './cameraMath.js';

/**
 * Pure math for the aerial "reveal" shot: when the lawn is done, the camera flies up and
 * back to show off the stripes, swings slowly across the lawn, then flies back down.
 *
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{ position: Vec3, target: Vec3 }} View Where a camera is and what it looks at.
 * @typedef {{ height: number, distance: number, swing: number }} AerialSettings Meters up
 *   and back (toward the street) from the lawn's middle; swing is radians either side.
 */

/**
 * The aerial view of the lawn, from the street side, turned `angle` radians around it.
 *
 * @param {{ x: number, z: number }} center Middle of the lawn.
 * @param {AerialSettings} settings
 * @param {number} angle 0 = straight out from the street.
 * @returns {View}
 */
export function aerialView(center, settings, angle) {
  return {
    position: {
      x: center.x + Math.sin(angle) * settings.distance,
      y: settings.height,
      z: center.z - Math.cos(angle) * settings.distance,
    },
    target: { x: center.x, y: 0, z: center.z },
  };
}

/**
 * The angle for aerialView that looks along a lawn's stripes, where they show best (grass
 * leaning toward you looks darker, away lighter; seen from the side, it all looks the
 * same). A checkerboard shows best looking diagonally across both passes. Stays within
 * `maxTurn` of straight out from the street, so the view stays over the street side.
 *
 * @param {{ latest: number | null, earlier: number | null }} axes See stripeAxes in
 *   lawn/patterns.js: radians from +x toward +z, or null.
 * @param {number} maxTurn Radians.
 * @returns {number} 0 if there are no stripes to show.
 */
export function stripeViewAngle({ latest, earlier }, maxTurn) {
  if (latest === null) return 0;
  const looks = earlier === null ? [latest] : [latest + Math.PI / 4, latest - Math.PI / 4];
  // aerialView at angle θ looks along (-sin θ, cos θ), which is the axis at θ + π/2.
  const turns = looks.map((axis) => {
    const turn = axis - Math.PI / 2;
    return turn - Math.PI * Math.round(turn / Math.PI); // an axis repeats every π
  });
  const nearest = turns.reduce((best, turn) => (Math.abs(turn) < Math.abs(best) ? turn : best));
  return clamp(nearest, -maxTurn, maxTurn);
}

/**
 * @param {View} a
 * @param {View} b
 * @param {number} t 0 = a, 1 = b.
 * @returns {View}
 */
export function blendViews(a, b, t) {
  /** @param {Vec3} p @param {Vec3} q */
  const lerp = (p, q) => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
    z: p.z + (q.z - p.z) * t,
  });
  return { position: lerp(a.position, b.position), target: lerp(a.target, b.target) };
}

/**
 * The reveal's timing: fly up (flyTime), hold the aerial view (holdTime, or longer, say for
 * a timelapse), fly back down (flyTime). It can be cut short, in which case it flies
 * straight back from wherever it is.
 */
export class RevealTimeline {
  /** @param {{ flyTime: number, holdTime: number }} timing Seconds. */
  constructor(timing) {
    this.timing = timing;
    this.progress = 0; // 0 = the player's view, 1 = fully aerial (before easing)
    this.held = 0;
    this.hold = timing.holdTime; // seconds to hold this time round
    this.time = 0; // seconds since it started
    this.isActive = false;
    this.isReturning = false;
  }

  /** @param {number} [holdTime] Seconds to hold the aerial view (default: the usual). */
  start(holdTime = this.timing.holdTime) {
    this.isActive = true;
    this.isReturning = false;
    this.held = 0;
    this.hold = holdTime;
    this.time = 0;
  }

  /** True once it's all the way up (and until it heads back down). */
  get isOverhead() {
    return this.isActive && !this.isReturning && this.progress >= 1;
  }

  /** Head back down now. */
  skip() {
    this.isReturning = true;
  }

  /** Total length of an uninterrupted reveal, in seconds. */
  get duration() {
    return this.timing.flyTime * 2 + this.hold;
  }

  /**
   * @param {number} dt
   * @returns {number} How aerial the view is, 0..1, eased so it starts and stops gently.
   */
  update(dt) {
    if (!this.isActive) return 0;
    this.time += dt;
    const step = dt / Math.max(this.timing.flyTime, 1e-3);
    if (!this.isReturning) {
      this.progress = Math.min(1, this.progress + step);
      if (this.progress >= 1) {
        this.held += dt;
        if (this.held >= this.hold) this.isReturning = true;
      }
    } else {
      this.progress = Math.max(0, this.progress - step);
      if (this.progress <= 0) this.isActive = false;
    }
    const t = clamp(this.progress, 0, 1);
    return t * t * (3 - 2 * t);
  }
}
