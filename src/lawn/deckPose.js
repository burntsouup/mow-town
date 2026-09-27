// @ts-check
import { wrapAngle } from '../camera/cameraMath.js';

/**
 * Where the mower deck is: a position on the lawn (lawn-local meters, see GrassGrid) and the
 * direction it faces. yaw 0 faces +z; forward is (sin yaw, cos yaw), like the player.
 *
 * @typedef {{ x: number, z: number, yaw: number }} DeckPose
 */

/**
 * The pose a fraction `t` of the way from `a` to `b`, turning the short way around.
 *
 * @param {DeckPose} a
 * @param {DeckPose} b
 * @param {number} t 0..1
 * @returns {DeckPose}
 */
export function lerpPose(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: wrapAngle(a.yaw + wrapAngle(b.yaw - a.yaw) * t),
  };
}

/**
 * Evenly spaced poses along a stroke from `from` to `to` (not including `from` itself), close
 * enough together that stamping the deck at each one leaves no gaps.
 *
 * @param {DeckPose} from
 * @param {DeckPose} to
 * @param {number} maxStep Longest gap between poses, in meters.
 * @param {number} maxTurn Largest turn between poses, in radians.
 * @returns {DeckPose[]} At least one pose; the last one is `to`.
 */
export function strokePoses(from, to, maxStep, maxTurn) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const turn = Math.abs(wrapAngle(to.yaw - from.yaw));
  // Capped, so a teleport can't freeze the game with millions of stamps.
  const count = Math.min(
    200,
    Math.max(1, Math.ceil(distance / maxStep), Math.ceil(turn / maxTurn)),
  );
  const poses = [];
  for (let i = 1; i < count; i++) poses.push(lerpPose(from, to, i / count));
  poses.push({ x: to.x, z: to.z, yaw: to.yaw });
  return poses;
}
