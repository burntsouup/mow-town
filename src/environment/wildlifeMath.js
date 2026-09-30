// @ts-check

/**
 * Pure math for the little lives around the neighborhood: birds flying round in loose V's,
 * wings flapping (with a glide now and then), and butterflies wandering about the flower
 * beds. Positions come straight from the time, so there's nothing to simulate or keep.
 *
 * @typedef {{ x: number, y: number, z: number, heading: number }} Placement heading: which
 *   way it's going (radians round the vertical, 0 = +z).
 */

/**
 * @typedef {{ center: { x: number, z: number }, radius: number, height: number,
 *   speed: number, phase: number }} Flight A flock's circuit: a wide circle (meters) at
 *   a height, going round at `speed` (radians per second; negative goes the other way).
 */

/**
 * Where one bird of a flock is: the flock flies its circle, rising and dipping a little;
 * birds fall in behind the leader in a loose V, each bobbing on its own.
 *
 * @param {number} t Seconds.
 * @param {number} index Which bird (0 leads).
 * @param {Flight} flight
 * @returns {Placement}
 */
export function birdPlacement(t, index, flight) {
  const angle = flight.phase + t * flight.speed;
  const around = Math.sign(flight.speed) || 1;
  // Heading along the circle (the tangent), the way it's going round.
  const forward = { x: -Math.sin(angle) * around, z: Math.cos(angle) * around };
  const side = { x: forward.z, z: -forward.x };
  // The V: 0, then pairs further back on either side.
  const rank = Math.ceil(index / 2);
  const wing = index === 0 ? 0 : index % 2 ? 1 : -1;
  const back = rank * 1.6;
  const across = wing * rank * 1.3;
  const bob = Math.sin(t * 2.3 + index * 1.7) * 0.25;
  return {
    x: flight.center.x + Math.cos(angle) * flight.radius - forward.x * back + side.x * across,
    y: flight.height + Math.sin(t * 0.4 + flight.phase) * 2 + bob,
    z: flight.center.z + Math.sin(angle) * flight.radius - forward.z * back + side.z * across,
    heading: Math.atan2(forward.x, forward.z),
  };
}

/**
 * How far a wing is raised (radians, + up): flapping, and every so often a glide with the
 * wings held out, nearly still.
 *
 * @param {number} t Seconds.
 * @param {number} rate Flaps per second × 2π.
 * @param {number} phase So neighbors don't flap in step.
 * @param {number} [reach] Biggest angle, radians.
 */
export function wingAngle(t, rate, phase, reach = 0.8) {
  const gliding = Math.sin(t * 0.45 + phase) > 0.55;
  const flap = Math.sin(t * rate + phase);
  return gliding ? 0.08 + 0.05 * flap : reach * flap;
}

/**
 * Where a butterfly is: wandering in loops round a spot (a flower bed), never further than
 * `range` away, fluttering up and down as it goes.
 *
 * @param {number} t Seconds.
 * @param {{ x: number, y: number, z: number }} home
 * @param {number} range Meters.
 * @param {number} seed Makes each butterfly wander its own way.
 * @returns {Placement}
 */
export function butterflyPlacement(t, home, range, seed) {
  /** @param {number} time */
  const at = (time) => ({
    x:
      home.x +
      range * (0.6 * Math.sin(time * 0.37 + seed) + 0.4 * Math.sin(time * 0.91 + seed * 2.1)),
    z:
      home.z +
      range * (0.6 * Math.cos(time * 0.29 + seed * 1.3) + 0.4 * Math.sin(time * 0.77 + seed)),
  });
  const now = at(t);
  const soon = at(t + 0.05);
  return {
    x: now.x,
    y: home.y + 0.35 + 0.25 * Math.sin(t * 1.7 + seed) + 0.08 * Math.sin(t * 7.3 + seed * 3),
    z: now.z,
    heading: Math.atan2(soon.x - now.x, soon.z - now.z),
  };
}
