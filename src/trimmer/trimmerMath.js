// @ts-check

/**
 * Pure math for the string trimmer: where you're aiming, and where its head goes. No Babylon
 * imports, so it's easy to test.
 *
 * @typedef {{ x: number, z: number }} Point A spot on the ground, in world meters.
 * @typedef {{ x: number, y: number, z: number }} Vec3
 */

/**
 * Where the view meets the ground (y = 0). Looking level or up never meets it (and far away
 * isn't useful either), so then it's a point `far` meters out along the view.
 *
 * @param {Vec3} origin The camera's position.
 * @param {Vec3} direction Unit vector the camera looks along.
 * @param {number} far Meters.
 * @returns {Point}
 */
export function groundAim(origin, direction, far) {
  if (direction.y < -1e-4) {
    const distance = -origin.y / direction.y;
    if (distance <= far) {
      return { x: origin.x + direction.x * distance, z: origin.z + direction.z * distance };
    }
  }
  const flat = Math.hypot(direction.x, direction.z) || 1;
  return { x: origin.x + (direction.x / flat) * far, z: origin.z + (direction.z / flat) * far };
}

/**
 * Keeps the head within arm's reach: toward the aim, but between `min` and `max` meters from
 * the player's feet.
 *
 * @param {Point} feet
 * @param {Point} aim
 * @param {{ min: number, max: number }} reach
 * @param {number} facingYaw Which way to reach if the aim is right at your feet.
 * @returns {Point}
 */
export function withinReach(feet, aim, reach, facingYaw) {
  const dx = aim.x - feet.x;
  const dz = aim.z - feet.z;
  const distance = Math.hypot(dx, dz);
  const [dirX, dirZ] =
    distance > 1e-6 ? [dx / distance, dz / distance] : [Math.sin(facingYaw), Math.cos(facingYaw)];
  const clamped = Math.min(reach.max, Math.max(reach.min, distance));
  return { x: feet.x + dirX * clamped, z: feet.z + dirZ * clamped };
}

/**
 * Sweeps the head toward where it should be: quickly at first, easing in, but never faster
 * than your arms can swing it.
 *
 * @param {Point} head
 * @param {Point} target
 * @param {number} dt Seconds since the previous frame.
 * @param {{ follow: number, maxSpeed: number }} settings follow: higher = snappier;
 *   maxSpeed in meters per second.
 * @returns {Point}
 */
export function sweepTowards(head, target, dt, settings) {
  const dx = target.x - head.x;
  const dz = target.z - head.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-9) return { x: target.x, z: target.z };
  const eased = distance * (1 - Math.exp(-settings.follow * dt));
  const step = Math.min(eased, settings.maxSpeed * dt);
  return { x: head.x + (dx / distance) * step, z: head.z + (dz / distance) * step };
}
