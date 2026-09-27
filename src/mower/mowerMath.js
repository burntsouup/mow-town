// @ts-check
import { clamp, wrapAngle } from '../camera/cameraMath.js';

/**
 * Pure handling math for the push mower. No Babylon imports, so it's easy to unit-test.
 *
 * A push mower is heavy: it takes a moment to get rolling, coasts a little when you stop
 * pushing, and turns slowly. So speed and turning both have momentum: each frame they move
 * toward what the controls ask for, by at most a limited amount.
 *
 * Yaw follows the camera's convention: 0 faces +z and positive yaw turns right.
 *
 * @typedef {{ speed: number, yawRate: number }} MowerMotion speed in m/s along the mower's
 *   heading (negative = pulling it back); yawRate in radians per second (positive = right).
 * @typedef {{ throttle: number, turn: number }} MowerControls Each -1..1: throttle forward
 *   (W) or back (S); turn right (D) or left (A).
 * @typedef {{
 *   pushSpeed: number, pullSpeed: number, acceleration: number, braking: number,
 *   turnSpeed: number, turnAcceleration: number,
 * }} HandlingSettings
 */

/**
 * @param {MowerMotion} motion
 * @param {MowerControls} controls
 * @param {HandlingSettings} settings
 * @param {number} dt Seconds since the previous frame.
 * @param {number} [speedFactor] 0..1: slows the mower down, e.g. in thick grass.
 * @returns {MowerMotion}
 */
export function updateMotion(motion, controls, settings, dt, speedFactor = 1) {
  const throttle = clamp(controls.throttle, -1, 1);
  const targetSpeed =
    throttle >= 0 ? throttle * settings.pushSpeed * speedFactor : throttle * settings.pullSpeed;
  // Slowing down (or reversing) uses the brakes; speeding up uses the weaker push.
  const slowingDown =
    Math.abs(targetSpeed) < Math.abs(motion.speed) || targetSpeed * motion.speed < 0;
  const rate = slowingDown ? settings.braking : settings.acceleration;
  const speed = approach(motion.speed, targetSpeed, rate * dt);

  const targetYawRate = clamp(controls.turn, -1, 1) * settings.turnSpeed;
  const yawRate = approach(motion.yawRate, targetYawRate, settings.turnAcceleration * dt);
  return { speed, yawRate };
}

/**
 * Mouse steering: how hard to turn so the mower ends up facing `targetYaw` (where the camera
 * looks). Turns fully when far off, easing off as it lines up so it doesn't overshoot.
 *
 * @param {number} yaw The mower's heading.
 * @param {number} targetYaw
 * @param {number} fullTurnAngle Radians off target at which to turn at full speed.
 * @returns {number} Turn, -1..1 (as if from the A/D keys).
 */
export function steerTowards(yaw, targetYaw, fullTurnAngle) {
  return clamp(wrapAngle(targetYaw - yaw) / fullTurnAngle, -1, 1);
}

/**
 * Moves `value` toward `target` by at most `maxChange`.
 *
 * @param {number} value
 * @param {number} target
 * @param {number} maxChange
 */
function approach(value, target, maxChange) {
  if (Math.abs(target - value) <= maxChange) return target;
  return value + Math.sign(target - value) * maxChange;
}
