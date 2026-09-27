import { Color4, ParticleSystem, Vector3 } from '@babylonjs/core';
import { createSoftDotTexture } from '../effects/effectTextures.js';

/**
 * The "job complete" sparkle: a burst of glinting particles rising gently off a mesh.
 */
export class Celebration {
  /** @param {import('@babylonjs/core').Scene} scene */
  constructor(scene) {
    const sparkles = new ParticleSystem('celebrationSparkles', 600, scene);
    sparkles.particleTexture = createSoftDotTexture(scene);
    sparkles.blendMode = ParticleSystem.BLENDMODE_ADD; // glowing highlights
    sparkles.updateSpeed = 1 / 60; // one update step per frame = real seconds
    sparkles.color1 = new Color4(1, 0.95, 0.75, 1);
    sparkles.color2 = new Color4(0.8, 0.95, 1, 1);
    sparkles.colorDead = new Color4(1, 1, 1, 0);
    sparkles.minSize = 0.03;
    sparkles.maxSize = 0.1;
    sparkles.minLifeTime = 0.8;
    sparkles.maxLifeTime = 1.8;
    sparkles.minEmitPower = 0.4;
    sparkles.maxEmitPower = 1.2;
    sparkles.direction1 = new Vector3(-0.2, 1, -0.2);
    sparkles.direction2 = new Vector3(0.2, 1, 0.2);
    sparkles.gravity = new Vector3(0, -0.4, 0);
    sparkles.emitter = new Vector3();
    this.sparkles = sparkles;
  }

  /**
   * @param {import('@babylonjs/core').AbstractMesh} mesh Sparkles appear all over this.
   */
  play(mesh) {
    const box = mesh.getBoundingInfo().boundingBox;
    const sparkles = this.sparkles;
    sparkles.emitter = box.centerWorld.clone();
    sparkles.minEmitBox = box.extendSizeWorld.scale(-1);
    sparkles.maxEmitBox = box.extendSizeWorld.clone();
    sparkles.manualEmitCount = 350; // one burst, then stop
    sparkles.start();
  }
}
