import { describe, expect, it } from 'vitest';
import { applyMatrix, cssFilter, lookMatrix, LOOKS, transform } from './looks.js';

/** @param {import('./looks.js').Step[]} steps */
const matrixOf = (steps) => lookMatrix({ id: 'test', name: 'Test', steps });
/** @param {number[]} a @param {number[]} b */
const close = (a, b) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 3));

describe('looks', () => {
  it('leaves colors alone for the natural look', () => {
    close(transform(lookMatrix(LOOKS[0]), [0.2, 0.5, 0.9]), [0.2, 0.5, 0.9]);
    expect(cssFilter(LOOKS[0])).toBe('none');
  });

  it('matches the CSS filters, as the spec defines them', () => {
    // grayscale(1): everything goes to its brightness (pure red's is 0.2126).
    close(
      transform(matrixOf([{ kind: 'grayscale', amount: 1 }]), [1, 0, 0]),
      [0.2126, 0.2126, 0.2126],
    );
    // sepia(1): white turns a warm cream (blue drops to 0.937; the rest clamps on screen).
    close(transform(matrixOf([{ kind: 'sepia', amount: 1 }]), [1, 1, 1]), [1.351, 1.203, 0.937]);
    // saturate(0) is grey too, with its slightly different weights.
    close(transform(matrixOf([{ kind: 'saturate', amount: 0 }]), [1, 0, 0]), [0.213, 0.213, 0.213]);
    // brightness scales; contrast pushes away from the middle grey.
    close(transform(matrixOf([{ kind: 'brightness', amount: 0.5 }]), [0.8, 0.4, 0]), [0.4, 0.2, 0]);
    close(transform(matrixOf([{ kind: 'contrast', amount: 2 }]), [0.25, 0.5, 0.75]), [0, 0.5, 1]);
  });

  it('applies the steps in order, like CSS does', () => {
    const brighterThenContrast = matrixOf([
      { kind: 'brightness', amount: 2 },
      { kind: 'contrast', amount: 2 },
    ]);
    const contrastThenBrighter = matrixOf([
      { kind: 'contrast', amount: 2 },
      { kind: 'brightness', amount: 2 },
    ]);
    close(transform(brighterThenContrast, [0.25, 0.25, 0.25]), [0.5, 0.5, 0.5]);
    close(transform(contrastThenBrighter, [0.25, 0.25, 0.25]), [0, 0, 0]);
  });

  it('writes each look as a CSS filter, in the same order', () => {
    const mono = LOOKS.find((look) => look.id === 'mono');
    expect(mono && cssFilter(mono)).toBe('grayscale(1) contrast(1.15) brightness(1.04)');
  });

  it('recolors canvas pixels, clamped to 0..255, leaving alpha alone', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 128, 64, 128, 192, 255]);
    applyMatrix(pixels, matrixOf([{ kind: 'sepia', amount: 1 }]));
    expect(Array.from(pixels.slice(0, 4))).toEqual([255, 255, 239, 128]);
    const grey = matrixOf([{ kind: 'grayscale', amount: 1 }]);
    const again = new Uint8ClampedArray([64, 128, 192, 255]);
    applyMatrix(again, grey);
    expect(again[0]).toBe(again[1]);
    expect(again[1]).toBe(again[2]);
  });
});
