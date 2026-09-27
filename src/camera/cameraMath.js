// @ts-check

/**
 * Pure math for the third-person camera. No Babylon imports, so it's easy to unit-test.
 *
 * Conventions (same as Babylon.js):
 * - yaw 0 looks toward +z; positive yaw turns right (toward +x)
 * - pitch 0 looks level; positive pitch looks down
 */

/** @typedef {{ x: number, y: number, z: number }} Vec3 */

/**
 * @param {number} yaw
 * @param {number} pitch
 * @returns {Vec3} Unit vector the camera looks along.
 */
export function forwardFromYawPitch(yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  return { x: Math.sin(yaw) * cosPitch, y: -Math.sin(pitch), z: Math.cos(yaw) * cosPitch };
}

/**
 * @param {number} yaw
 * @returns {Vec3} Horizontal unit vector pointing to the camera's right.
 */
export function rightFromYaw(yaw) {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}

/**
 * Turns mouse movement (pixels) into a new yaw/pitch, keeping pitch within limits.
 *
 * @param {number} yaw
 * @param {number} pitch
 * @param {number} dx Horizontal mouse movement; positive = right.
 * @param {number} dy Vertical mouse movement; positive = down.
 * @param {{ sensitivity: number, invertY: boolean, minPitch: number, maxPitch: number }} settings
 */
export function applyMouseLook(yaw, pitch, dx, dy, settings) {
  const vertical = settings.invertY ? -dy : dy;
  return {
    yaw: wrapAngle(yaw + dx * settings.sensitivity),
    pitch: clamp(pitch + vertical * settings.sensitivity, settings.minPitch, settings.maxPitch),
  };
}

/**
 * Where the camera wants to sit relative to the point it orbits: behind it and over the
 * right shoulder, so the player stays left of the crosshair.
 *
 * @param {number} yaw
 * @param {number} pitch
 * @param {number} distance How far back, in meters.
 * @param {number} shoulderOffset How far right, in meters.
 * @returns {Vec3}
 */
export function cameraOffset(yaw, pitch, distance, shoulderOffset) {
  const forward = forwardFromYawPitch(yaw, pitch);
  const right = rightFromYaw(yaw);
  return {
    x: -forward.x * distance + right.x * shoulderOffset,
    y: -forward.y * distance,
    z: -forward.z * distance + right.z * shoulderOffset,
  };
}

/**
 * Moves the camera's distance toward a target. Pulling in is instant (so walls never block
 * the view); moving back out eases smoothly, at the same speed at any frame rate.
 *
 * @param {number} current
 * @param {number} target
 * @param {number} dt Seconds since the previous frame.
 * @param {number} returnSpeed Higher = eases back out faster.
 */
export function approachDistance(current, target, dt, returnSpeed) {
  if (target <= current) return target;
  return current + (target - current) * (1 - Math.exp(-returnSpeed * dt));
}

/**
 * How visible the player should be when the camera is squeezed in close (e.g. backed
 * against a wall), so their body doesn't fill the screen.
 *
 * @param {number} distance Camera distance from the pivot, in meters.
 * @param {number} hiddenBelow Fully invisible at or below this distance.
 * @param {number} solidAbove Fully visible at or above this distance.
 * @returns {number} Opacity from 0 to 1.
 */
export function playerOpacityForDistance(distance, hiddenBelow, solidAbove) {
  return clamp((distance - hiddenBelow) / (solidAbove - hiddenBelow), 0, 1);
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keeps an angle within -π..π so it never grows without bound.
 *
 * @param {number} angle Radians.
 */
export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
