import { Color4, ParticleSystem, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import { createSliverTexture, createSoftDotTexture } from './effectTextures.js';

/**
 * Little puffs where Tuft's feet land: a soft cloud of dust on paths, a few flicked-up bits
 * of grass on a lawn.
 */
export class Footsteps {
  /** @param {import('@babylonjs/core').Scene} scene */
  constructor(scene) {
    const settings = config.effects.footsteps;
    const dust = new ParticleSystem('footDust', 200, scene);
    dust.particleTexture = createSoftDotTexture(scene);
    dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    dust.updateSpeed = 1 / 60;
    dust.minEmitBox = new Vector3(-0.06, 0, -0.08);
    dust.maxEmitBox = new Vector3(0.06, 0.02, 0.08);
    dust.direction1 = new Vector3(-1, 0.2, -1);
    dust.direction2 = new Vector3(1, 0.6, 1);
    dust.minEmitPower = 0.15;
    dust.maxEmitPower = 0.45;
    dust.gravity = new Vector3(0, 0.2, 0); // drifts up as it fades
    dust.minLifeTime = 0.35;
    dust.maxLifeTime = 0.6;
    dust.minSize = 0.07;
    dust.maxSize = 0.14;
    dust.addSizeGradient(0, 0.6);
    dust.addSizeGradient(1, 1.5); // spreads out
    dust.color1 = Color4.FromHexString(`${settings.dustColor}${settings.dustAlpha}`);
    dust.color2 = dust.color1;
    dust.colorDead = Color4.FromHexString(`${settings.dustColor}00`);
    dust.emitRate = 0;
    dust.start();

    const colors = config.effects.clippingColors;
    const grass = new ParticleSystem('footGrass', 200, scene);
    grass.particleTexture = createSliverTexture(scene);
    grass.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    grass.updateSpeed = 1 / 60;
    grass.minEmitBox = new Vector3(-0.07, 0.02, -0.09);
    grass.maxEmitBox = new Vector3(0.07, 0.05, 0.09);
    grass.direction1 = new Vector3(-1, 0.8, -1);
    grass.direction2 = new Vector3(1, 1.6, 1);
    grass.minEmitPower = 0.4;
    grass.maxEmitPower = 0.9;
    grass.gravity = new Vector3(0, -5, 0);
    grass.minLifeTime = 0.25;
    grass.maxLifeTime = 0.45;
    grass.minSize = 0.03;
    grass.maxSize = 0.05;
    grass.minInitialRotation = 0;
    grass.maxInitialRotation = Math.PI * 2;
    grass.minAngularSpeed = -12;
    grass.maxAngularSpeed = 12;
    grass.color1 = Color4.FromHexString(`${colors[0]}ff`);
    grass.color2 = Color4.FromHexString(`${colors[1]}ff`);
    grass.colorDead = Color4.FromHexString(`${colors[1]}00`);
    grass.emitRate = 0;
    grass.start();

    this.systems = { path: dust, grass };
  }

  /**
   * @param {Vector3} at Where the foot landed (world).
   * @param {'grass' | 'path'} surface
   * @param {number} strength 0..1: a gentle step to a running stomp.
   */
  puff(at, surface, strength) {
    const system = this.systems[surface];
    const count = config.effects.footsteps[surface === 'grass' ? 'grassBits' : 'dustPuffs'];
    system.emitter = at.clone();
    system.manualEmitCount = Math.max(1, Math.round(count * (0.5 + 0.5 * strength)));
  }
}
