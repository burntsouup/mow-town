// @ts-check
import { createRandom } from '../math/noise.js';

/**
 * Noise for giving a lawn natural variety: bigger and smaller patches of lighter, darker,
 * yellower and bluer grass. It's baked into a small texture that
 * tiles (its right edge runs on into its left, and its top into its bottom), so the grass
 * shader can repeat it over any lawn without seams. Pure, so it's tested.
 */

/**
 * Smooth value noise that repeats every `period` units in both directions.
 *
 * @param {number} seed
 * @param {number} period Whole number of blobs before it repeats.
 * @returns {(x: number, y: number) => number} Values in [0, 1].
 */
export function tileableNoise(seed, period) {
  const random = createRandom(seed);
  const values = Float32Array.from({ length: period * period }, random);
  const wrap = (/** @type {number} */ i) => ((i % period) + period) % period;
  const corner = (/** @type {number} */ ix, /** @type {number} */ iy) =>
    values[wrap(iy) * period + wrap(ix)];
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const sx = fade(x - ix);
    const sy = fade(y - iy);
    const top = corner(ix, iy) + (corner(ix + 1, iy) - corner(ix, iy)) * sx;
    const bottom = corner(ix, iy + 1) + (corner(ix + 1, iy + 1) - corner(ix, iy + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}

/**
 * The lawn's variety texture: `size` × `size` RGBA bytes, tiling. Each channel is its own
 * noise: red, big patches (a few across); green, medium ones; blue, small mottling; alpha,
 * another layer of big patches (spare, for anything else that grows in patches).
 *
 * @param {number} size Pixels across (and down).
 * @param {number} seed
 * @returns {Uint8Array}
 */
export function grassVariationData(size, seed) {
  const layers = [
    { noise: tileableNoise(seed, 4), cells: 4, octaves: 3 },
    { noise: tileableNoise(seed + 1, 12), cells: 12, octaves: 2 },
    { noise: tileableNoise(seed + 2, 40), cells: 40, octaves: 1 },
    { noise: tileableNoise(seed + 3, 5), cells: 5, octaves: 2 },
  ];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      layers.forEach(({ noise, cells, octaves }, channel) => {
        // Octaves double in frequency: still whole numbers of blobs, so they tile too.
        let sum = 0;
        let weight = 0;
        for (let o = 0; o < octaves; o++) {
          const scale = (cells * 2 ** o) / size;
          const amplitude = 0.5 ** o;
          sum += amplitude * sampleOctave(noise, cells, 2 ** o, x * scale, y * scale);
          weight += amplitude;
        }
        data[(y * size + x) * 4 + channel] = Math.round((sum / weight) * 255);
      });
    }
  }
  return data;
}

/**
 * One octave of a tiling noise at a higher frequency: the noise repeats every `cells`, so
 * `cells × multiple` units still wrap exactly.
 *
 * @param {(x: number, y: number) => number} noise
 * @param {number} cells
 * @param {number} multiple
 * @param {number} x
 * @param {number} y
 */
function sampleOctave(noise, cells, multiple, x, y) {
  // Fold the higher-frequency coordinates back into one period of the base noise, shifted
  // per octave so the layers don't line up.
  const shift = multiple * 1.37;
  return noise((x % cells) + shift, (y % cells) + shift);
}

/** @param {number} t */
function fade(t) {
  return t * t * (3 - 2 * t);
}
