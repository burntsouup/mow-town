import { DynamicTexture } from '@babylonjs/core';

/**
 * Small textures for particle effects, drawn in code with the 2D canvas API so we don't
 * need any image files yet.
 */

/**
 * A soft white dot (bright center, fading to transparent), used for every particle.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createSoftDotTexture(scene) {
  const size = 64;
  const texture = new DynamicTexture('softDotTexture', { width: size, height: size }, scene, false);
  const context = texture.getContext();
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.75)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

/**
 * A thin white sliver with soft ends, like a snipped bit of grass blade. Particles tint it.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createSliverTexture(scene) {
  const size = 32;
  const texture = new DynamicTexture('sliverTexture', { width: size, height: size }, scene, false);
  const context = texture.getContext();
  context.clearRect(0, 0, size, size);
  const gradient = context.createLinearGradient(0, 4, 0, size - 4);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.25, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.75, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(size / 2 - 3, 4, 6, size - 8);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}
