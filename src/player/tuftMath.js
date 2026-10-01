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

/**
 * Which feet touched down as the walk cycle moved on (for footstep puffs and sounds). Foot 0
 * lands as the phase passes 0 (2π), foot 1 half a cycle later, at π (see footOffset).
 *
 * @param {number} previous Phase last frame, 0..2π.
 * @param {number} phase Phase now (it only moves forward, wrapping at 2π).
 * @returns {number[]} The feet that landed, 0 and/or 1.
 */
export function footLandings(previous, phase) {
  if (phase === previous) return [];
  // How far it moved, and whether that passed each foot's landing point.
  const moved = (((phase - previous) % TAU) + TAU) % TAU;
  /** @param {number} at */
  const passed = (at) => {
    const toLanding = (((at - previous) % TAU) + TAU) % TAU;
    return toLanding > 0 && toLanding <= moved;
  };
  const feet = [];
  if (passed(0)) feet.push(0);
  if (passed(Math.PI)) feet.push(1);
  return feet;
}

/**
 * Looking around: every few seconds Tuft glances somewhere new (a little left or right, up
 * or down), easing over. While busy (walking fast, working), the glances shrink toward
 * straight ahead.
 */
export class Glancer {
  /**
   * @param {() => number} random 0..1, e.g. from createRandom (seeded).
   * @param {{ every: [number, number], yaw: number, pitch: number, speed: number }} settings
   *   every: the range of seconds between glances; yaw/pitch: how far it can look, radians;
   *   speed: how quickly the eyes get there.
   */
  constructor(random, settings) {
    this.random = random;
    this.settings = settings;
    this.target = { yaw: 0, pitch: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.untilNext = this.pickWait();
  }

  pickWait() {
    const [min, max] = this.settings.every;
    return min + (max - min) * this.random();
  }

  /**
   * @param {number} dt Seconds since the previous frame.
   * @param {number} calm 1 while idle, down to 0 while busy: how far the glances go.
   * @returns {{ yaw: number, pitch: number }} Where it's looking now, radians.
   */
  update(dt, calm) {
    const { yaw, pitch, speed } = this.settings;
    this.untilNext -= dt;
    if (this.untilNext <= 0) {
      this.untilNext = this.pickWait();
      // Now and then, back to straight ahead.
      const ahead = this.random() < 0.3;
      this.target = ahead
        ? { yaw: 0, pitch: 0 }
        : { yaw: (this.random() * 2 - 1) * yaw, pitch: (this.random() * 2 - 1) * pitch };
    }
    const ease = 1 - Math.exp(-speed * dt);
    this.yaw += (this.target.yaw * calm - this.yaw) * ease;
    this.pitch += (this.target.pitch * calm - this.pitch) * ease;
    return { yaw: this.yaw, pitch: this.pitch };
  }
}

/** Seconds a cheer lasts: two hops, then a wave. */
export const CHEER_TIME = 2.2;

/**
 * Tuft cheering (a job done, an upgrade bought): two happy hops with both arms up, then a
 * wave. A small cheer is one little hop (trying on clothes).
 *
 * @param {number} t Seconds since the cheer started.
 * @param {boolean} big
 * @returns {{ hop: number, arms: number, wave: number, squint: number }} hop: meters off the
 *   ground; arms: 0..1, how far the arms are up; wave: -1..1, the waving hand side to side;
 *   squint: 0..1, eyes scrunched up happily. All 0 once it's over.
 */
export function cheerPose(t, big = true) {
  const time = big ? CHEER_TIME : 0.45;
  if (t < 0 || t >= time) return { hop: 0, arms: 0, wave: 0, squint: 0 };
  const hops = big ? 2 : 1;
  const hopTime = big ? 0.42 : 0.45;
  const height = big ? 0.22 : 0.1;
  const hop = t < hops * hopTime ? height * Math.sin((Math.PI * (t % hopTime)) / hopTime) : 0;
  if (!big) return { hop, arms: 0, wave: 0, squint: Math.sin((Math.PI * t) / time) };
  // Arms fly up, stay up through the hops and the wave, then come down at the end.
  const arms = Math.min(1, t / 0.12, (time - t) / 0.3);
  const waveStart = hops * hopTime;
  const wave = t > waveStart ? Math.sin((t - waveStart) * Math.PI * 2 * 2.2) : 0;
  const squint = Math.min(1, t / 0.1, (time - t) / 0.25);
  return { hop, arms, wave, squint };
}

/** When a big cheer's hops are over and the wave starts (seconds), and two waves' time. */
const WAVE_FROM = 2 * 0.42;
const WAVE_LOOP = 2 / 2.2;

/**
 * Holding a cheer for a photo: after the hops, the arms stay up and the wave goes on and on
 * (the time loops round two waves, so it never reaches the end of the cheer).
 *
 * @param {number} t Seconds since the cheer started.
 */
export function heldCheerTime(t) {
  if (t <= WAVE_FROM + WAVE_LOOP) return t;
  return WAVE_FROM + ((t - WAVE_FROM) % WAVE_LOOP);
}

/** Tuft's body: an egg this big (half-widths, meters), its middle this far up from its base. */
export const TUFT_BODY = { center: { x: 0, y: 0.5, z: 0 }, radii: { x: 0.42, y: 0.5, z: 0.4 } };

/**
 * A point on Tuft's body in a given direction from its middle, and which way the surface
 * faces there. Not a perfect egg, which looked like a ball: it's a soft gumdrop, fullest a
 * little below the middle, narrower at the top and flatter underneath, with a few gentle
 * lumps (the same on both sides) so the outline is organic.
 *
 * @param {Vec3} direction Any length.
 * @returns {{ point: Vec3, normal: Vec3 }}
 */
export function bodyPoint(direction) {
  const at = (/** @type {Vec3} */ d) => {
    const length = Math.hypot(d.x, d.y, d.z);
    const x = d.x / length;
    const y = d.y / length;
    const z = d.z / length;
    // Smooth curves only (bumps shaped like bells): a kink anywhere shows up as a crease.
    const girth =
      1 + 0.12 * Math.exp(-((y + 0.3) ** 2) / 0.2) - 0.2 * Math.exp(-((y - 1) ** 2) / 0.35);
    const height = 1 + 0.03 * y - 0.06 * y * y;
    const lumps = 1 + 0.028 * Math.sin(4 * z + 2 * y + 0.6) + 0.02 * Math.sin(6 * x * x + 3 * y);
    const { radii, center } = TUFT_BODY;
    const rx = radii.x * girth * lumps;
    const ry = radii.y * height * lumps;
    const rz = radii.z * girth * lumps;
    const scale = 1 / Math.hypot(x / rx, y / ry, z / rz);
    return { x: center.x + x * scale, y: center.y + y * scale, z: center.z + z * scale };
  };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  const point = at(d);
  // The normal, from two tiny steps across the surface.
  const helper = Math.abs(d.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const t1 = normalize(cross(d, helper));
  const t2 = cross(d, t1);
  const e = 1e-4;
  const p1 = at({ x: d.x + t1.x * e, y: d.y + t1.y * e, z: d.z + t1.z * e });
  const p2 = at({ x: d.x + t2.x * e, y: d.y + t2.y * e, z: d.z + t2.z * e });
  let normal = normalize(
    cross(
      { x: p1.x - point.x, y: p1.y - point.y, z: p1.z - point.z },
      { x: p2.x - point.x, y: p2.y - point.y, z: p2.z - point.z },
    ),
  );
  const out = {
    x: point.x - TUFT_BODY.center.x,
    y: point.y - TUFT_BODY.center.y,
    z: point.z - TUFT_BODY.center.z,
  };
  if (normal.x * out.x + normal.y * out.y + normal.z * out.z < 0) {
    normal = { x: -normal.x, y: -normal.y, z: -normal.z };
  }
  return { point, normal };
}

/**
 * One step of a springy wobble: `value` is pulled toward `target` and overshoots a little,
 * like jelly settling. Stable at any frame rate (it takes small steps inside a big frame).
 *
 * @param {{ value: number, velocity: number }} state
 * @param {number} target
 * @param {number} dt Seconds.
 * @param {{ stiffness: number, damping: number }} settings stiffness: how hard it pulls
 *   (higher = quicker wobble); damping: how fast the wobble dies away.
 * @returns {{ value: number, velocity: number }}
 */
export function springStep(state, target, dt, { stiffness, damping }) {
  let { value, velocity } = state;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    velocity += (stiffness * (target - value) - damping * velocity) * h;
    value += velocity * h;
  }
  return { value, velocity };
}

/** @param {Vec3} a @param {Vec3} b */
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** @param {Vec3} v */
function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
