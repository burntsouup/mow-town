import { DynamicTexture, Texture } from '@babylonjs/core';
import { createRandom, createValueNoise, fractalNoise } from '../math/noise.js';

/**
 * Tileable textures for the ground and paths, painted in code with the 2D canvas API (no
 * image files). Each is drawn once, with seeded randomness so it looks the same every load,
 * and repeats across the surface (see Greybox.flat's `tile`).
 */

const SIZE = 256;

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} name
 * @param {(context: CanvasRenderingContext2D, random: () => number) => void} paint
 * @param {number} seed
 */
function paintTexture(scene, name, paint, seed) {
  const texture = new DynamicTexture(name, { width: SIZE, height: SIZE }, scene, true);
  const context = /** @type {CanvasRenderingContext2D} */ (
    /** @type {unknown} */ (texture.getContext())
  );
  paint(context, createRandom(seed));
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8; // stays crisp at low angles
  return texture;
}

/**
 * Soft blotches of lighter and darker color over a base, that wrap around the edges so the
 * tiles join seamlessly.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {number} seed
 * @param {number} strength 0..1: how far the blotches stray from the base.
 * @param {number} scale How many blotches across the tile.
 */
function mottle(context, seed, strength, scale) {
  const noise = createValueNoise(seed);
  const image = context.getImageData(0, 0, SIZE, SIZE);
  const data = image.data;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Blend four offset copies so the pattern wraps at the tile's edges.
      const u = x / SIZE;
      const v = y / SIZE;
      /** @param {number} a @param {number} b */
      const sample = (a, b) => fractalNoise(noise, a * scale, b * scale, 3);
      const n =
        sample(u, v) * (1 - u) * (1 - v) +
        sample(u - 1, v) * u * (1 - v) +
        sample(u, v - 1) * (1 - u) * v +
        sample(u - 1, v - 1) * u * v;
      const shade = 1 + (n - 0.5) * 2 * strength;
      const i = (y * SIZE + x) * 4;
      data[i] = Math.min(255, data[i] * shade);
      data[i + 1] = Math.min(255, data[i + 1] * shade);
      data[i + 2] = Math.min(255, data[i + 2] * shade);
    }
  }
  context.putImageData(image, 0, 0);
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {() => number} random
 * @param {number} count
 * @param {string[]} colors
 * @param {number} size Pixels.
 */
function speckle(context, random, count, colors, size) {
  for (let i = 0; i < count; i++) {
    context.fillStyle = colors[Math.floor(random() * colors.length)];
    const s = size * (0.5 + random());
    context.fillRect(random() * SIZE, random() * SIZE, s, s);
  }
}

/**
 * Poured concrete slabs: a warm light grey, faintly mottled, with a seam around each tile.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createConcreteTexture(scene) {
  return paintTexture(
    scene,
    'concreteTexture',
    (context, random) => {
      context.fillStyle = '#d9d2c5';
      context.fillRect(0, 0, SIZE, SIZE);
      mottle(context, 3, 0.07, 3);
      speckle(context, random, 900, ['#c9c1b3', '#e6e0d5', '#bfb7a8'], 1.5);
      context.fillStyle = '#a79f91';
      context.fillRect(0, 0, SIZE, 3); // seams on two edges; neighbors supply the others
      context.fillRect(0, 0, 3, SIZE);
    },
    41,
  );
}

/**
 * Asphalt: dark, blue-grey, with pale grit.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createAsphaltTexture(scene) {
  return paintTexture(
    scene,
    'asphaltTexture',
    (context, random) => {
      context.fillStyle = '#4a4b52';
      context.fillRect(0, 0, SIZE, SIZE);
      mottle(context, 5, 0.1, 4);
      speckle(context, random, 2500, ['#5d5e66', '#3c3d44', '#6e6c6a'], 1.2);
    },
    43,
  );
}

/**
 * Shredded-bark mulch: warm browns in little flecks.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createMulchTexture(scene) {
  return paintTexture(
    scene,
    'mulchTexture',
    (context, random) => {
      context.fillStyle = '#6b4a33';
      context.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 1800; i++) {
        const shades = ['#7d5738', '#5a3d2a', '#8a6444', '#4d3322'];
        context.fillStyle = shades[Math.floor(random() * shades.length)];
        context.save();
        context.translate(random() * SIZE, random() * SIZE);
        context.rotate(random() * Math.PI);
        context.fillRect(-4, -1, 8 + random() * 6, 2.5);
        context.restore();
      }
    },
    47,
  );
}

/**
 * Other people's lawns (not mowable): short grass seen from a distance, as soft blotches of
 * green with fine speckle.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createGroundTexture(scene) {
  return paintTexture(
    scene,
    'groundTexture',
    (context, random) => {
      context.fillStyle = '#6d9a45';
      context.fillRect(0, 0, SIZE, SIZE);
      mottle(context, 7, 0.12, 2);
      speckle(context, random, 3000, ['#7aa94f', '#618c3d', '#86b35a'], 1.2);
    },
    53,
  );
}

/**
 * Roof shingles, in greys (the roof's material tints them): rows of tabs, each row's
 * bottom edge shaded, and the gaps between tabs staggered row to row. Four rows per tile.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createShinglesTexture(scene) {
  return paintTexture(
    scene,
    'shinglesTexture',
    (context, random) => {
      const rows = 4;
      const tabs = 6;
      const rowHeight = SIZE / rows;
      const tabWidth = SIZE / tabs;
      context.fillStyle = '#e6e6e6';
      context.fillRect(0, 0, SIZE, SIZE);
      for (let row = 0; row < rows; row++) {
        const y = row * rowHeight;
        const offset = (row % 2) * (tabWidth / 2);
        for (let tab = -1; tab <= tabs; tab++) {
          const shade = 215 + Math.floor(random() * 35);
          context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
          context.fillRect(tab * tabWidth + offset + 2, y + 2, tabWidth - 4, rowHeight - 4);
        }
        // The shadow under the row above (v runs up the roof: row 0 is at the bottom).
        const gradient = context.createLinearGradient(0, y + rowHeight - 10, 0, y + rowHeight);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
        context.fillStyle = gradient;
        context.fillRect(0, y + rowHeight - 10, SIZE, 10);
      }
    },
    59,
  );
}
