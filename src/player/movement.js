// @ts-check
import { wrapAngle } from '../camera/cameraMath.js';

/**
 * Pure movement math for the player. No Babylon imports, so it's easy to unit-test.
 * Directions are on the ground plane: x = right, z = forward (same as Babylon).
 */

/** @typedef {{ x: number, z: number }} Vec2 */

/**
 * Reads WASD / arrow keys into a direction the player wants to move, relative to the camera.
 * Diagonals are scaled down so moving diagonally isn't faster than moving straight.
 *
 * Uses physical key positions (KeyboardEvent.code), so it also works on AZERTY/Dvorak.
 *
 * @param {(code: string) => boolean} isDown
 * @returns {Vec2} x = strafe right, z = forward; length 0 or 1.
 */
export function moveInputFromKeys(isDown) {
  const x = axis(isDown('KeyD') || isDown('ArrowRight'), isDown('KeyA') || isDown('ArrowLeft'));
  const z = axis(isDown('KeyW') || isDown('ArrowUp'), isDown('KeyS') || isDown('ArrowDown'));
  const length = Math.hypot(x, z);
  return length > 0 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}

/**
 * Converts camera-relative input into a world direction, so "forward" always means
 * "the way the camera is looking".
 *
 * @param {Vec2} move From moveInputFromKeys.
 * @param {number} cameraYaw
 * @returns {Vec2}
 */
export function cameraRelativeMove(move, cameraYaw) {
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  // forward = (sin, cos), right = (cos, -sin); see cameraMath.js
  return { x: move.x * cos + move.z * sin, z: -move.x * sin + move.z * cos };
}

/**
 * Moves a velocity toward a target velocity by at most `maxChange`. Used for acceleration
 * and braking: a larger maxChange feels snappier, a smaller one feels heavier.
 *
 * @param {Vec2} current
 * @param {Vec2} target
 * @param {number} maxChange
 * @returns {Vec2}
 */
export function moveTowards(current, target, maxChange) {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxChange || distance === 0) return { x: target.x, z: target.z };
  const scale = maxChange / distance;
  return { x: current.x + dx * scale, z: current.z + dz * scale };
}

/**
 * Smoothly turns toward a target angle, always the short way around.
 * Same speed at any frame rate.
 *
 * @param {number} currentYaw
 * @param {number} targetYaw
 * @param {number} turnSpeed Higher = snappier turning.
 * @param {number} dt Seconds since the previous frame.
 */
export function turnTowards(currentYaw, targetYaw, turnSpeed, dt) {
  const difference = wrapAngle(targetYaw - currentYaw);
  return wrapAngle(currentYaw + difference * (1 - Math.exp(-turnSpeed * dt)));
}

/**
 * The yaw that faces along a direction on the ground.
 *
 * @param {Vec2} direction
 */
export function yawFromDirection(direction) {
  return Math.atan2(direction.x, direction.z);
}

/**
 * @param {boolean} positive
 * @param {boolean} negative
 */
function axis(positive, negative) {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}
