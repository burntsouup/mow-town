// @ts-check

/**
 * Small, seeded randomness helpers. "Seeded" means the same seed always gives the same
 * sequence, so a procedurally generated driveway looks identical every time you load it
 * (and tests can check exact results).
 */

/**
 * Random number generator (the well-known "mulberry32"). Returns numbers in [0, 1).
 *
 * @param {number} seed Any integer.
 */
export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 2D "value noise": smooth random hills and valleys. Nearby points get similar values,
 * which makes it look natural (unlike plain random numbers, which look like TV static).
 * One unit of input is roughly one "blob".
 *
 * @param {number} seed
 * @returns {(x: number, y: number) => number} Values in [0, 1].
 */
export function createValueNoise(seed) {
  const random = createRandom(seed);
  const values = Float32Array.from({ length: 256 }, random);
  // A shuffled lookup table turns a grid corner (ix, iy) into one of the random values.
  const table = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [table[i], table[j]] = [table[j], table[i]];
  }
  /** @param {number} ix @param {number} iy */
  const corner = (ix, iy) => values[table[(table[ix & 255] + iy) & 255]];

  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const sx = fade(x - ix);
    const sy = fade(y - iy);
    const top = lerp(corner(ix, iy), corner(ix + 1, iy), sx);
    const bottom = lerp(corner(ix, iy + 1), corner(ix + 1, iy + 1), sx);
    return lerp(top, bottom, sy);
  };
}

/**
 * Layers several sizes of noise (big blobs plus smaller detail), which looks more natural
 * than a single layer. Also called "fBm".
 *
 * @param {(x: number, y: number) => number} noise From createValueNoise.
 * @param {number} x
 * @param {number} y
 * @param {number} octaves Number of layers; each is half the size and half as strong.
 * @returns {number} Values in [0, 1].
 */
export function fractalNoise(noise, x, y, octaves) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    // The offsets stop every layer from lining up at the origin.
    sum += amplitude * noise(x * frequency + i * 17.3, y * frequency + i * 31.7);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/**
 * 0 below `edge0`, 1 above `edge1`, and a smooth S-curve in between.
 *
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 */
export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** @param {number} a @param {number} b @param {number} t */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Eases 0..1 so the noise has no visible grid seams. @param {number} t */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
