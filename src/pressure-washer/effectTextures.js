import { DynamicTexture, Texture } from '@babylonjs/core';
import { createRandom } from '../cleaning/noise.js';

/**
 * Small textures for the water effects, drawn in code with the 2D canvas API so we don't
 * need any image files yet.
 */

/**
 * A soft white dot (bright center, fading to transparent), used for every particle.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createDropletTexture(scene) {
  const size = 64;
  const texture = new DynamicTexture('dropletTexture', { width: size, height: size }, scene, false);
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
 * Semi-transparent white with brighter streaks running lengthwise. Scrolled along the water
 * beam, it makes the water look like it's rushing out of the nozzle.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createStreakTexture(scene) {
  const width = 64;
  const height = 256;
  const texture = new DynamicTexture('streakTexture', { width, height }, scene, true);
  const context = texture.getContext();
  context.clearRect(0, 0, width, height);
  context.fillStyle = 'rgba(255, 255, 255, 0.3)';
  context.fillRect(0, 0, width, height);

  const random = createRandom(3);
  for (let i = 0; i < 70; i++) {
    const x = random() * width;
    const streakWidth = 1 + random() * 2.5;
    const y = random() * height;
    const length = 40 + random() * 160;
    context.fillStyle = `rgba(255, 255, 255, ${0.3 + random() * 0.6})`;
    // Draw twice, one texture-height apart, so streaks wrap seamlessly when scrolled.
    context.fillRect(x, y, streakWidth, length);
    context.fillRect(x, y - height, streakWidth, length);
  }
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.hasAlpha = true;
  texture.update();
  return texture;
}
