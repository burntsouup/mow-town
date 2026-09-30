// @ts-check

/**
 * Pure math for the sky: its colors in any direction (the sky shader does the same sums on
 * the GPU, and tests check them here), and the shapes of the puffy clouds painted for it.
 *
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {[number, number, number]} RGB 0..1 each (can go over 1 at the sun).
 */

/**
 * The sky's color looking in a direction: horizon color low down, fading to the zenith
 * color overhead (quickly at first, like the real sky), a warm glow round the sun and the
 * sun's disc itself. Below the horizon it stays the horizon color, which is also the fog's,
 * so the ground fades seamlessly into it.
 *
 * @param {Vec3} direction Unit length.
 * @param {Vec3} toSun Unit length.
 * @param {{ zenith: RGB, horizon: RGB, glow: RGB, sunSize: number }} sky sunSize: the disc's
 *   angular radius, radians.
 * @returns {RGB}
 */
export function skyColor(direction, toSun, { zenith, horizon, glow, sunSize }) {
  const up = Math.max(0, direction.y);
  const t = Math.pow(up, 0.45);
  const facing = direction.x * toSun.x + direction.y * toSun.y + direction.z * toSun.z;
  const around = Math.max(0, facing);
  const halo = Math.pow(around, 8) * 0.35 + Math.pow(around, 90) * 0.6;
  const disc = smoothstep(Math.cos(sunSize * 1.35), Math.cos(sunSize), facing);
  return /** @type {RGB} */ (
    [0, 1, 2].map((i) => horizon[i] + (zenith[i] - horizon[i]) * t + glow[i] * halo + 1.6 * disc)
  );
}

/**
 * The blobs that make up one puffy cumulus cloud, in a box twice as wide as it is tall
 * (x: 0..1 across, y: 0..1 down, like a canvas; radii in heights): big heaps sitting on a
 * flat bottom, highest in the middle, with smaller puffs on top of them (the "cauliflower").
 *
 * @param {() => number} random 0..1, seeded.
 * @param {number} heaps How many big heaps.
 * @returns {{ x: number, y: number, radius: number }[]} Every blob fits inside the box.
 */
export function cloudBlobs(random, heaps) {
  const base = 0.86; // where the flat bottom is
  /** @type {{ x: number, y: number, radius: number }[]} */
  const blobs = [];
  /** Keeps a blob inside the box (x spans 2 heights, so x ± radius / 2). */
  const fit = (/** @type {{ x: number, y: number, radius: number }} */ b) => {
    const radius = Math.min(b.radius, b.y - 0.01, 0.99 - b.y, (b.x - 0.005) * 2, (0.995 - b.x) * 2);
    return { ...b, radius: Math.max(0.01, radius) };
  };
  for (let i = 0; i < heaps; i++) {
    const x = 0.2 + 0.6 * (heaps > 1 ? i / (heaps - 1) : 0.5) + (random() - 0.5) * 0.06;
    const middle = 1 - Math.abs(x - 0.5) * 2; // 1 in the middle, 0 at the ends
    const radius = 0.17 + 0.2 * middle * (0.75 + 0.5 * random());
    // Heaps sit on the base line (their bottoms dip just below it, and get cut flat).
    const heap = fit({ x, y: base - radius * 0.7, radius });
    blobs.push(heap);
    // A couple of smaller puffs on top of each heap.
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1;
      blobs.push(
        fit({
          x: heap.x + side * heap.radius * (0.15 + 0.2 * random()),
          y: heap.y - heap.radius * (0.45 + 0.25 * random()),
          radius: heap.radius * (0.45 + 0.2 * random()),
        }),
      );
    }
  }
  return blobs;
}

/**
 * A ring of rolling hills round the world, far off: a strip from the foot of the hills (at
 * `radius`, below the ground) up to their crests (further out, at heights that rise and fall
 * with `noise`), shaded from the haze at the foot to the hills' own color at the top.
 *
 * @param {{ radius: number, depth: number, height: number, steps: number,
 *   noise: (angle: number) => number, foot: number[], top: number[] }} options radius: where
 *   the foot is (meters from the middle); depth: how much further out the crests are;
 *   height: the tallest crest (meters); noise: 0..1 for each angle round (radians); foot,
 *   top: RGB colors.
 * @returns {{ positions: number[], colors: number[], indices: number[] }}
 */
export function hillRing({ radius, depth, height, steps, noise, foot, top }) {
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const colors = [];
  /** @type {number[]} */
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    const crest = height * (0.35 + 0.65 * noise(angle));
    const out = radius + depth * (0.6 + 0.4 * noise(angle + 1.3));
    positions.push(c * radius, -2, s * radius, c * out, crest, s * out);
    colors.push(foot[0], foot[1], foot[2], 1, top[0], top[1], top[2], 1);
    if (i < steps) {
      const a = i * 2;
      // Seen from the middle, looking out (Babylon's front faces wind clockwise).
      indices.push(a, a + 3, a + 1, a, a + 2, a + 3);
    }
  }
  return { positions, colors, indices };
}

/**
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 */
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
