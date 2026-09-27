import { DynamicTexture, Texture } from '@babylonjs/core';
import { createRandom } from '../cleaning/noise.js';

/**
 * Surface detail textures drawn in code with the 2D canvas API (no image files yet). They're
 * neutral greys: the material's color tints them, and dirt blends over them.
 */

/**
 * Vertical fence boards with dark gaps between them, wood grain, and the odd knot. One tile
 * covers `boardsPerTile` boards; repeat it along the fence with `uScale`.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {{ boardWidth: number, gap: number, boardsPerTile: number, seed: number }} layout
 *   Board and gap widths in meters (the same numbers the dirt pattern uses).
 */
export function createBoardTexture(scene, { boardWidth, gap, boardsPerTile, seed }) {
  if (!(boardWidth > 0 && gap >= 0 && boardsPerTile > 0)) {
    throw new Error(`createBoardTexture: bad layout ${JSON.stringify({ boardWidth, gap })}`);
  }
  const width = 512;
  const height = 512;
  const texture = new DynamicTexture('boardTexture', { width, height }, scene, true);
  const context = texture.getContext();
  const random = createRandom(seed);
  const pixelsPerMeter = width / (boardWidth * boardsPerTile);
  const gapPixels = Math.max(2, Math.round(gap * pixelsPerMeter));
  const boardPixels = boardWidth * pixelsPerMeter;

  context.fillStyle = 'rgb(70, 70, 70)'; // the gaps (seen between boards)
  context.fillRect(0, 0, width, height);
  for (let b = 0; b < boardsPerTile; b++) {
    const left = Math.round(b * boardPixels) + gapPixels;
    const right = Math.round((b + 1) * boardPixels);
    const shade = 200 + Math.floor(random() * 40); // boards vary a little
    context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    context.fillRect(left, 0, right - left, height);
    // Grain: faint lines running up the board.
    for (let g = 0; g < 14; g++) {
      const x = left + random() * (right - left);
      context.fillStyle = `rgba(0, 0, 0, ${0.04 + random() * 0.06})`;
      context.fillRect(x, 0, 1 + random() * 1.5, height);
    }
    // Now and then, a knot.
    if (random() < 0.5) {
      context.fillStyle = 'rgba(0, 0, 0, 0.18)';
      context.beginPath();
      context.ellipse(
        left + (right - left) * (0.3 + random() * 0.4),
        random() * height,
        3 + random() * 3,
        6 + random() * 6,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.update();
  return texture;
}

/**
 * Square pavers in a running bond with sandy joints, each paver a slightly different shade.
 * One tile covers `columns` × `rows` pavers (rows must be even, for the offset rows to line
 * up); repeat it with uScale/vScale. Laid out exactly like `paverAt` in dirtPatterns.js.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {{ size: number, joint: number, columns: number, rows: number, seed: number }} layout
 *   Paver size and joint width in meters.
 */
export function createPaverTexture(scene, { size, joint, columns, rows, seed }) {
  if (!(size > 0 && joint >= 0 && columns > 0 && rows > 0 && rows % 2 === 0)) {
    throw new Error(`createPaverTexture: bad layout ${JSON.stringify({ size, joint, rows })}`);
  }
  const module = size + joint;
  const width = 512;
  const pixelsPerMeter = width / (columns * module);
  const height = Math.round(rows * module * pixelsPerMeter);
  const texture = new DynamicTexture('paverTexture', { width, height }, scene, true);
  const context = texture.getContext();
  const random = createRandom(seed);
  /** Canvas y grows downward, but texture v grows upward, so flip. @param {number} meters */
  const canvasY = (meters) => height - meters * pixelsPerMeter;

  context.fillStyle = 'rgb(125, 122, 115)'; // sandy joints
  context.fillRect(0, 0, width, height);
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : module / 2;
    for (let column = -1; column <= columns; column++) {
      const left = (column * module - offset + joint) * pixelsPerMeter;
      const top = canvasY((row + 1) * module);
      const shade = 190 + Math.floor(random() * 45);
      context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      context.fillRect(left, top, size * pixelsPerMeter, size * pixelsPerMeter);
      // A light speckle, like stone aggregate.
      for (let s = 0; s < 40; s++) {
        context.fillStyle = `rgba(0, 0, 0, ${0.05 + random() * 0.08})`;
        context.fillRect(
          left + random() * size * pixelsPerMeter,
          top + random() * size * pixelsPerMeter,
          1.5,
          1.5,
        );
      }
    }
  }
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.update();
  return texture;
}
