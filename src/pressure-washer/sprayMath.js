// @ts-check

/**
 * Pure math for the pressure washer's spray. No Babylon imports, so it's easy to unit-test.
 */

/** @typedef {{ x: number, y: number, z: number }} Vec3 */

/**
 * How the spray behaves at a distance from the nozzle. Up close it's a tight, full-strength
 * spot. Further away the fan spreads wider but weakens, until it stops cleaning at maxRange.
 *
 * @param {number} distance Meters from the nozzle to where the water lands.
 * @param {{ nozzleRadius: number, spreadPerMeter: number, fullStrengthRange: number, maxRange: number }} settings
 * @returns {{ radius: number, strength: number }} Spot radius in meters; strength 0..1.
 */
export function sprayAtDistance(distance, settings) {
  const { nozzleRadius, spreadPerMeter, fullStrengthRange, maxRange } = settings;
  const d = Math.max(0, distance);
  const radius = nozzleRadius + spreadPerMeter * d;
  let strength = 1;
  if (d >= maxRange) strength = 0;
  else if (d > fullStrengthRange)
    strength = 1 - (d - fullStrengthRange) / (maxRange - fullStrengthRange);
  return { radius, strength };
}

/**
 * Which way the spray gun should point to hit what the crosshair is on.
 *
 * The crosshair ray starts at the camera, but water comes out of the gun, so we aim the gun
 * at the crosshair's target. If that target is too close to the gun, or behind it, pointing
 * at it would look wrong, so we fall back to the camera's own direction.
 *
 * @param {Vec3} from The gun's position.
 * @param {Vec3} target What the crosshair is on.
 * @param {Vec3} fallback The camera's forward direction (a unit vector).
 * @param {number} minDistance Closer targets than this use the fallback.
 * @returns {Vec3} A unit vector.
 */
export function aimDirection(from, target, fallback, minDistance) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dz = target.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < minDistance) return { ...fallback };
  const direction = { x: dx / length, y: dy / length, z: dz / length };
  const agreesWithCamera =
    direction.x * fallback.x + direction.y * fallback.y + direction.z * fallback.z;
  return agreesWithCamera > 0 ? direction : { ...fallback };
}

/**
 * Distance on the ground plane (ignoring height), e.g. to check if the player is in reach.
 *
 * @param {Vec3} a
 * @param {Vec3} b
 */
export function groundDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * The two axes of the flat fan of water, both at right angles to the spray direction.
 * "Horizontal" means the wide side runs left-right as seen from the camera; turning the fan
 * (Q) swaps them.
 *
 * @param {Vec3} sprayDirection Unit vector the water travels along.
 * @param {Vec3} cameraRight Unit vector to the camera's right.
 * @param {boolean} vertical Whether the fan is turned upright.
 * @returns {{ wide: Vec3, thin: Vec3 }} Unit vectors.
 */
export function fanAxes(sprayDirection, cameraRight, vertical) {
  const d = sprayDirection;
  // The camera's right, minus any part pointing along the spray: level with the view.
  const along = dot(cameraRight, d);
  let side = normalize({
    x: cameraRight.x - d.x * along,
    y: cameraRight.y - d.y * along,
    z: cameraRight.z - d.z * along,
  });
  if (!side) side = normalize(cross({ x: 0, y: 1, z: 0 }, d)) ?? { x: 1, y: 0, z: 0 };
  const up = cross(d, side); // at right angles to both, completing the fan's frame
  return vertical ? { wide: up, thin: side } : { wide: side, thin: up };
}

/**
 * Where a flat fan of water lands on a flat surface: an ellipse in the surface's own
 * coordinates (meters along its u and v directions).
 *
 * The fan's cross-section keeps the same area as a round spot of `radius`, just squashed by
 * `flatness`. Hitting the surface at an angle stretches the footprint (like a flashlight on
 * the floor), spreading the same water more thinly. `density` says how thinly (1 = head-on),
 * so the cleaning amount can be scaled to match.
 *
 * @param {{
 *   sprayDirection: Vec3, wide: Vec3, thin: Vec3,
 *   normal: Vec3, uAxis: Vec3, vAxis: Vec3,
 *   radius: number, flatness: number, maxStretch: number,
 * }} options All vectors are unit length; radius in meters; flatness 0..1 (thin ÷ wide).
 * @returns {{ radiusX: number, radiusY: number, angle: number, density: number }}
 *   radii in meters; angle of radiusX from the surface's u direction, in radians.
 */
export function sprayFootprint(options) {
  const { sprayDirection: d, wide, thin, normal, uAxis, vAxis } = options;
  const { radius, flatness, maxStretch } = options;
  const wideRadius = radius / Math.sqrt(flatness);
  const thinRadius = radius * Math.sqrt(flatness);

  // Follow each fan axis along the spray until it meets the surface.
  const facing = dot(d, normal);
  const safeFacing = Math.sign(facing || -1) * Math.max(Math.abs(facing), 1e-4);
  /** @param {Vec3} axis @param {number} length */
  const onSurface = (axis, length) => {
    const k = dot(axis, normal) / safeFacing;
    const x = (axis.x - d.x * k) * length;
    const y = (axis.y - d.y * k) * length;
    const z = (axis.z - d.z * k) * length;
    return [x * uAxis.x + y * uAxis.y + z * uAxis.z, x * vAxis.x + y * vAxis.y + z * vAxis.z];
  };
  const [a0, a1] = onSurface(wide, wideRadius);
  const [b0, b1] = onSurface(thin, thinRadius);

  // Those two stretched axes still outline an ellipse, but may no longer be at right angles;
  // find its true main axes (the eigenvectors of a 2×2 matrix).
  const m11 = a0 * a0 + b0 * b0;
  const m12 = a0 * a1 + b0 * b1;
  const m22 = a1 * a1 + b1 * b1;
  const half = (m11 + m22) / 2;
  const spread = Math.sqrt(Math.max(0, half * half - (m11 * m22 - m12 * m12)));
  const cap = radius * maxStretch;
  const radiusX = Math.min(cap, Math.sqrt(half + spread));
  const radiusY = Math.min(cap, Math.sqrt(Math.max(1e-8, half - spread)));
  const angle = 0.5 * Math.atan2(2 * m12, m11 - m22);
  const density = Math.min(1, (radius * radius) / (radiusX * radiusY));
  return { radiusX, radiusY, angle, density };
}

/** @param {Vec3} a @param {Vec3} b */
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** @param {Vec3} v @returns {Vec3 | null} null for a (near-)zero vector. */
function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z);
  return length < 1e-6 ? null : { x: v.x / length, y: v.y / length, z: v.z / length };
}
