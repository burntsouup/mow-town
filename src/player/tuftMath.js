// @ts-check

/**
 * Pure math for animating Tuft without a skeleton: where the feet go as you walk (planted on
 * the ground, then lifted and swung forward), how the body bobs, and the curve of a noodle
 * limb. Also: points on Tuft's egg-shaped body, and when to blink.
 *
 * @typedef {{ x: number, y: number, z: number }} Vec3
 */

const TAU = Math.PI * 2;

/**
 * Moves the walk cycle on by how far you walked. One cycle is two steps: each foot spends
 * half of it planted (sliding back under the body as fast as the body moves forward, so it
 * stays put on the ground) and half swinging forward.
 *
 * @param {number} phase Radians, 0..2π.
 * @param {number} distance Meters walked since last time.
 * @param {number} stride Meters a foot travels either side of its hip.
 */
export function advanceWalk(phase, distance, stride) {
  const next = phase + (distance * Math.PI) / (2 * stride);
  return ((next % TAU) + TAU) % TAU;
}

/**
 * Where a foot is, relative to its hip: forward along the way you're walking, and up.
 *
 * @param {number} phase This foot's phase (the other foot is half a cycle, π, behind).
 * @param {{ stride: number, lift: number }} settings Meters.
 * @returns {{ forward: number, up: number }}
 */
export function footOffset(phase, { stride, lift }) {
  const p = ((phase % TAU) + TAU) % TAU;
  if (p < Math.PI) return { forward: stride * (1 - (2 * p) / Math.PI), up: 0 }; // planted
  const swing = p - Math.PI;
  return { forward: -stride * Math.cos(swing), up: lift * Math.sin(swing) };
}

/**
 * How high the body is lifted in the walk cycle, 0..1: highest while a foot is planted
 * right underneath, lowest as the other foot lands.
 *
 * @param {number} phase
 */
export function bodyBob(phase) {
  return Math.abs(Math.sin(phase));
}

/**
 * A soft curve for a noodle arm or leg, from `from` to `to`, bowed by `bend` at its middle
 * (a quadratic Bézier: the middle of the curve passes through the middle of the line plus
 * `bend`).
 *
 * @param {Vec3} from
 * @param {Vec3} to
 * @param {Vec3} bend
 * @param {number} segments How many straight pieces to draw it with.
 * @returns {Vec3[]} segments + 1 points.
 */
export function limbCurve(from, to, bend, segments) {
  const control = {
    x: (from.x + to.x) / 2 + bend.x * 2,
    y: (from.y + to.y) / 2 + bend.y * 2,
    z: (from.z + to.z) / 2 + bend.z * 2,
  };
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    points.push({
      x: a * from.x + b * control.x + c * to.x,
      y: a * from.y + b * control.y + c * to.y,
      z: a * from.z + b * control.z + c * to.z,
    });
  }
  return points;
}

/**
 * The point on an egg-shaped (ellipsoid) body in a given direction from its middle, and
 * which way the surface faces there. For sticking eyes and arms onto Tuft.
 *
 * @param {Vec3} center
 * @param {Vec3} radii Half the body's width, height and depth.
 * @param {Vec3} direction Any length.
 * @returns {{ point: Vec3, normal: Vec3 }}
 */
export function ellipsoidPoint(center, radii, direction) {
  const scale = 1 / Math.hypot(direction.x / radii.x, direction.y / radii.y, direction.z / radii.z);
  const offset = { x: direction.x * scale, y: direction.y * scale, z: direction.z * scale };
  const n = {
    x: offset.x / (radii.x * radii.x),
    y: offset.y / (radii.y * radii.y),
    z: offset.z / (radii.z * radii.z),
  };
  const length = Math.hypot(n.x, n.y, n.z);
  return {
    point: { x: center.x + offset.x, y: center.y + offset.y, z: center.z + offset.z },
    normal: { x: n.x / length, y: n.y / length, z: n.z / length },
  };
}

/**
 * Blinking: every few seconds (at random), the eyes close for a moment.
 */
export class Blinker {
  /**
   * @param {() => number} random 0..1, e.g. from createRandom (seeded).
   * @param {{ every: [number, number], closedFor: number }} settings every: the range of
   *   seconds between blinks; closedFor: seconds the eyes stay shut.
   */
  constructor(random, settings) {
    this.random = random;
    this.settings = settings;
    this.untilNext = this.pickWait();
    this.closedLeft = 0;
  }

  pickWait() {
    const [min, max] = this.settings.every;
    return min + (max - min) * this.random();
  }

  /**
   * @param {number} dt Seconds since the previous frame.
   * @returns {number} How open the eyes are, 0 (shut) to 1.
   */
  update(dt) {
    if (this.closedLeft > 0) {
      this.closedLeft -= dt;
      if (this.closedLeft <= 0) this.untilNext = this.pickWait();
      return 0;
    }
    this.untilNext -= dt;
    if (this.untilNext <= 0) {
      this.closedLeft = this.settings.closedFor;
      return 0;
    }
    return 1;
  }
}
