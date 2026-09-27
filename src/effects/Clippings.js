import { Color4, ParticleSystem, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import { createSliverTexture } from './effectTextures.js';

/**
 * Grass clippings flying out of the mower's side chute, tumbling as they fall. The more grass
 * the deck is cutting, the more clippings come out.
 */
export class Clippings {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('@babylonjs/core').AbstractMesh} chute Clippings shoot out of this mesh's
   *   +x side (directions below are in its own space, so they turn with the mower).
   */
  constructor(scene, chute) {
    const settings = config.effects;
    const clippings = new ParticleSystem('clippings', 2000, scene);
    clippings.particleTexture = createSliverTexture(scene);
    clippings.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    clippings.updateSpeed = 1 / 60; // one update step per frame = real seconds
    clippings.emitter = chute;
    clippings.minEmitBox = new Vector3(0, -0.02, -0.07);
    clippings.maxEmitBox = new Vector3(0.06, 0.02, 0.07);
    clippings.direction1 = new Vector3(1, 0.15, -0.5);
    clippings.direction2 = new Vector3(1, 0.9, 0.5);
    clippings.minEmitPower = 1.2;
    clippings.maxEmitPower = 2.6;
    clippings.gravity = new Vector3(0, -5, 0); // lighter than a stone: they flutter down
    clippings.minLifeTime = 0.35;
    clippings.maxLifeTime = 1;
    clippings.minSize = 0.05;
    clippings.maxSize = 0.09;
    clippings.minInitialRotation = 0;
    clippings.maxInitialRotation = Math.PI * 2;
    clippings.minAngularSpeed = -10;
    clippings.maxAngularSpeed = 10;
    clippings.color1 = Color4.FromHexString(`${settings.clippingColors[0]}ff`);
    clippings.color2 = Color4.FromHexString(`${settings.clippingColors[1]}ff`);
    clippings.colorDead = Color4.FromHexString(`${settings.clippingColors[1]}00`);
    clippings.emitRate = 0;
    clippings.start();
    this.system = clippings;
  }

  /** @param {number} cutRate Grass cut per second (see GrassGrid.cutDeck). */
  update(cutRate) {
    const { clippingsPerCut, maxClippingsRate } = config.effects;
    this.system.emitRate = Math.min(maxClippingsRate, cutRate * clippingsPerCut);
  }
}
