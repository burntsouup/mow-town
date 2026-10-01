// @ts-check

/**
 * Photo mode's looks: a few color treatments, like an instant camera's film. Each is a list
 * of CSS filter steps, so the live view can use the browser's own CSS filter on the canvas
 * (free: the browser does it as it draws the page), and a saved picture gets the same colors
 * from the color matrices here: the CSS Filter Effects spec defines each filter as one.
 *
 * @typedef {'brightness' | 'contrast' | 'saturate' | 'sepia' | 'grayscale'} StepKind
 * @typedef {{ kind: StepKind, amount: number }} Step
 * @typedef {{ id: string, name: string, steps: Step[] }} Look
 * @typedef {number[]} ColorMatrix 3 rows of 4 (red, green and blue in, then an offset), row
 *   by row: each output color is a mix of the input colors, for colors from 0 to 1.
 */

/** @type {Look[]} */
export const LOOKS = [
  { id: 'natural', name: 'Natural', steps: [] },
  {
    id: 'golden',
    name: 'Golden hour',
    steps: [
      { kind: 'sepia', amount: 0.3 },
      { kind: 'saturate', amount: 1.35 },
      { kind: 'contrast', amount: 1.05 },
      { kind: 'brightness', amount: 1.04 },
    ],
  },
  {
    id: 'retro',
    name: 'Retro',
    steps: [
      { kind: 'sepia', amount: 0.4 },
      { kind: 'saturate', amount: 0.8 },
      { kind: 'contrast', amount: 0.85 },
      { kind: 'brightness', amount: 1.08 },
    ],
  },
  {
    id: 'mono',
    name: 'Black & white',
    steps: [
      { kind: 'grayscale', amount: 1 },
      { kind: 'contrast', amount: 1.15 },
      { kind: 'brightness', amount: 1.04 },
    ],
  },
];

/**
 * The look as a CSS `filter` value, for the live view.
 *
 * @param {Look} look
 */
export function cssFilter(look) {
  if (look.steps.length === 0) return 'none';
  return look.steps.map(({ kind, amount }) => `${kind}(${amount})`).join(' ');
}

/**
 * The look as one color matrix (its steps, one after another).
 *
 * @param {Look} look
 * @returns {ColorMatrix}
 */
export function lookMatrix(look) {
  return look.steps.reduce((matrix, step) => combine(stepMatrix(step), matrix), IDENTITY);
}

/**
 * Recolors RGBA pixels (as from a canvas) with a color matrix, in place.
 *
 * @param {Uint8ClampedArray} pixels
 * @param {ColorMatrix} m
 */
export function applyMatrix(pixels, m) {
  const offset = [m[3] * 255, m[7] * 255, m[11] * 255];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // (A Uint8ClampedArray rounds and clamps to 0..255 by itself.)
    pixels[i] = m[0] * r + m[1] * g + m[2] * b + offset[0];
    pixels[i + 1] = m[4] * r + m[5] * g + m[6] * b + offset[1];
    pixels[i + 2] = m[8] * r + m[9] * g + m[10] * b + offset[2];
  }
}

/**
 * Applies a color matrix to one color (0..1 each), not clamped.
 *
 * @param {ColorMatrix} m
 * @param {number[]} color Red, green, blue.
 */
export function transform(m, [r, g, b]) {
  return [0, 1, 2].map((row) => {
    const at = row * 4;
    return m[at] * r + m[at + 1] * g + m[at + 2] * b + m[at + 3];
  });
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/**
 * One filter's matrix, from the Filter Effects spec.
 *
 * @param {Step} step
 * @returns {ColorMatrix}
 */
function stepMatrix({ kind, amount }) {
  if (kind === 'brightness') return [amount, 0, 0, 0, 0, amount, 0, 0, 0, 0, amount, 0];
  if (kind === 'contrast') {
    const shift = 0.5 - 0.5 * amount;
    return [amount, 0, 0, shift, 0, amount, 0, shift, 0, 0, amount, shift];
  }
  if (kind === 'saturate') {
    const s = amount;
    // prettier-ignore
    return [
      0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0,
    ];
  }
  const s = 1 - Math.min(1, Math.max(0, amount)); // how much of the original stays
  if (kind === 'sepia') {
    // prettier-ignore
    return [
      0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0,
      0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0,
      0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s, 0,
    ];
  }
  // prettier-ignore
  return [
    0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0,
    0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0,
    0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s, 0,
  ];
}

/**
 * The matrix for doing `first`, then `second`.
 *
 * @param {ColorMatrix} second
 * @param {ColorMatrix} first
 * @returns {ColorMatrix}
 */
function combine(second, first) {
  const out = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 4; column++) {
      let sum = column === 3 ? second[row * 4 + 3] : 0;
      for (let k = 0; k < 3; k++) sum += second[row * 4 + k] * first[k * 4 + column];
      out.push(sum);
    }
  }
  return out;
}
