import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Quaternion,
  StandardMaterial,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import { config } from '../config.js';
import { createDropletTexture, createStreakTexture } from './effectTextures.js';

/** Particle systems count time in "update steps"; 1/60 makes one step = one real frame. */
const REAL_TIME = 1 / 60;
const GRAVITY = new Vector3(0, -9.81, 0);

/**
 * Everything you see when spraying: the water beam, and particles where it lands.
 *
 * - beam: a flat fan of rushing water from the nozzle to the impact point
 * - core: a thin bright jet right out of the nozzle
 * - splash: white droplets bouncing off the surface
 * - mist: soft, slow puffs hanging around the impact
 * - splatter: brown droplets, only while dirt is actually coming off
 */
export class SprayEffects {
  /** @param {import('@babylonjs/core').Scene} scene */
  constructor(scene) {
    const droplet = createDropletTexture(scene);
    this.streaks = createStreakTexture(scene);
    this.beam = createFadingCone(scene, 'sprayBeam', {
      nearWidth: 0.05,
      nearAlpha: 0.75,
      farAlpha: 0.12,
    });
    const beamMaterial = /** @type {StandardMaterial} */ (this.beam.material);
    beamMaterial.emissiveTexture = this.streaks;
    beamMaterial.opacityTexture = this.streaks;
    this.core = createFadingCone(scene, 'sprayCore', { nearWidth: 1, nearAlpha: 0.8, farAlpha: 0 });

    /** Where the water lands; every particle system emits from here. */
    this.impactPoint = new Vector3();
    this.splash = createParticles(scene, 'splash', droplet, 1200, {
      colors: [new Color4(0.8, 0.9, 1, 0.95), new Color4(1, 1, 1, 0.75), new Color4(1, 1, 1, 0)],
      size: [0.02, 0.06],
      life: [0.25, 0.55],
      power: [1.5, 4],
      gravity: GRAVITY,
    });
    this.mist = createParticles(scene, 'mist', droplet, 150, {
      colors: [new Color4(1, 1, 1, 0.18), new Color4(0.9, 0.95, 1, 0.1), new Color4(1, 1, 1, 0)],
      size: [0.3, 0.8],
      life: [0.9, 1.6],
      power: [0.2, 0.6],
      gravity: new Vector3(0, 0.25, 0), // mist drifts upward a little
    });
    this.mist.direction1.set(-1, 0.2, -1);
    this.mist.direction2.set(1, 1, 1);
    this.splatter = createParticles(scene, 'splatter', droplet, 600, {
      colors: [
        new Color4(0.33, 0.27, 0.2, 1),
        new Color4(0.45, 0.37, 0.27, 0.9),
        new Color4(0.3, 0.25, 0.2, 0),
      ],
      size: [0.015, 0.04],
      life: [0.3, 0.7],
      power: [1.5, 3.5],
      gravity: GRAVITY,
    });
    // Splatter colors for plain grime, and for moss (tinted in between by how much is moss).
    this.grimeSplatter = [this.splatter.color1.clone(), this.splatter.color2.clone()];
    this.mossSplatter = [new Color4(0.3, 0.4, 0.15, 1), new Color4(0.42, 0.5, 0.22, 0.9)];
    for (const system of [this.splash, this.mist, this.splatter]) {
      system.emitter = this.impactPoint;
      system.start();
    }

    // Reused every frame.
    this.lookTarget = new Vector3();
    this.reflected = new Vector3();
    this.beamForward = new Vector3();
    this.beamSide = new Vector3();
    this.beamUp = new Vector3();
    this.beam.rotationQuaternion = new Quaternion();
  }

  /**
   * @param {{
   *   nozzle: Vector3,
   *   direction: Vector3,
   *   wide: { x: number, y: number, z: number },
   *   distance: number,
   *   radius: number,
   *   strength: number,
   *   hitNormal: Vector3 | null,
   *   dirtRate: number,
   *   mossShare: number,
   * }} spray hitNormal is null when the water didn't hit anything; mossShare is how much of
   *   the dirt coming off is moss (0..1).
   */
  show({ nozzle, direction, wide, distance, radius, strength, hitNormal, dirtRate, mossShare }) {
    const settings = config.effects;

    // Beam: a flat fan along the fan's wide axis (the same shape that cleans), wobbling slightly.
    const wobble = distance * 0.012;
    this.lookTarget.copyFrom(direction).scaleInPlace(distance).addInPlace(nozzle);
    this.lookTarget.x += (Math.random() - 0.5) * wobble;
    this.lookTarget.y += (Math.random() - 0.5) * wobble;
    this.impactPoint.copyFrom(this.lookTarget);
    orientFan(
      this.beam,
      nozzle,
      this.lookTarget,
      wide,
      this.beamForward,
      this.beamSide,
      this.beamUp,
    );
    const { fanFlatness } = config.washer;
    const flicker = 0.92 + Math.random() * 0.16;
    const wideDiameter = ((radius * 2) / Math.sqrt(fanFlatness)) * flicker;
    const thinDiameter = radius * 2 * Math.sqrt(fanFlatness) * flicker;
    this.beam.scaling.set(wideDiameter, thinDiameter, distance);
    this.beam.isVisible = true;
    const coreLength = Math.min(distance, 1.2);
    placeCone(this.core, nozzle, this.lookTarget, 0.03, 0.03, coreLength);

    // Particles bounce off the surface: mostly away from it, partly continuing along the
    // reflected direction of the water.
    const hitting = hitNormal !== null;
    if (hitting) {
      const along = Vector3.Dot(direction, hitNormal);
      this.reflected
        .copyFrom(hitNormal)
        .scaleInPlace(-2 * along)
        .addInPlace(direction);
      aimParticles(this.splash, hitNormal, this.reflected, 0.9);
      aimParticles(this.splatter, hitNormal, this.reflected, 0.7);
    }
    this.splash.emitRate = hitting ? settings.splashRate * (0.4 + 0.6 * strength) : 0;
    // Mist hangs around the impact, or where the stream breaks up in mid-air.
    this.mist.emitRate = settings.mistRate * (hitting ? 1 : 0.5);
    this.splatter.emitRate = hitting
      ? Math.min(settings.maxSplatterRate, dirtRate * settings.splatterPerDirt)
      : 0;
    Color4.LerpToRef(this.grimeSplatter[0], this.mossSplatter[0], mossShare, this.splatter.color1);
    Color4.LerpToRef(this.grimeSplatter[1], this.mossSplatter[1], mossShare, this.splatter.color2);
  }

  hide() {
    this.beam.isVisible = false;
    this.core.isVisible = false;
    // Stop emitting, but let particles already in the air finish falling.
    this.splash.emitRate = 0;
    this.mist.emitRate = 0;
    this.splatter.emitRate = 0;
  }

  /** @param {number} dt Seconds since the previous frame. */
  update(dt) {
    // Scroll the streaks outward along the beam.
    this.streaks.vOffset -= dt * config.effects.streamSpeed;
  }
}

/**
 * A cone from the origin to 1 unit along +z, fading out along its length. Placed each
 * frame with `placeCone`.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} name
 * @param {{ nearWidth: number, nearAlpha: number, farAlpha: number }} shape
 *   nearWidth is the nozzle-end width relative to the far end (1 = a straight tube).
 */
function createFadingCone(scene, name, { nearWidth, nearAlpha, farAlpha }) {
  const cone = MeshBuilder.CreateCylinder(
    name,
    { diameterTop: 1, diameterBottom: nearWidth, height: 1, tessellation: 16, cap: Mesh.NO_CAP },
    scene,
  );
  // Move the base to the origin, then tip it over so it runs along +z instead of +y.
  cone.position.y = 0.5;
  cone.bakeCurrentTransformIntoVertices();
  cone.rotation.x = Math.PI / 2;
  cone.bakeCurrentTransformIntoVertices();

  const positions = cone.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const colors = [];
  for (let i = 0; i < positions.length; i += 3) {
    const along = positions[i + 2]; // 0 at the nozzle, 1 at the far end
    colors.push(0.85, 0.94, 1, nearAlpha + (farAlpha - nearAlpha) * along);
  }
  cone.setVerticesData(VertexBuffer.ColorKind, colors);
  cone.hasVertexAlpha = true;

  const material = new StandardMaterial(`${name}Mat`, scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.diffuseColor = Color3.Black();
  material.backFaceCulling = false; // see the inside of the cone too
  cone.material = material;
  cone.isPickable = false;
  cone.isVisible = false;
  return cone;
}

/**
 * Points the beam from `from` toward `toward`, turned so its local x (its wide side) lies
 * along the fan's wide axis.
 *
 * @param {Mesh} beam
 * @param {Vector3} from
 * @param {Vector3} toward
 * @param {{ x: number, y: number, z: number }} wide
 * @param {Vector3} forward Scratch vectors, reused to avoid garbage.
 * @param {Vector3} side
 * @param {Vector3} up
 */
function orientFan(beam, from, toward, wide, forward, side, up) {
  toward.subtractToRef(from, forward).normalize();
  // Keep the wide axis at right angles to the (slightly wobbled) beam direction.
  side.set(wide.x, wide.y, wide.z);
  side.subtractInPlace(forward.scale(Vector3.Dot(side, forward))).normalize();
  Vector3.CrossToRef(forward, side, up);
  beam.position.copyFrom(from);
  Quaternion.RotationQuaternionFromAxisToRef(
    side,
    up,
    forward,
    /** @type {Quaternion} */ (beam.rotationQuaternion),
  );
}

/**
 * @param {Mesh} cone
 * @param {Vector3} from
 * @param {Vector3} toward
 * @param {number} width
 * @param {number} height
 * @param {number} length
 */
function placeCone(cone, from, toward, width, height, length) {
  cone.isVisible = true;
  cone.position.copyFrom(from);
  cone.lookAt(toward);
  cone.scaling.set(width, height, length);
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} name
 * @param {import('@babylonjs/core').BaseTexture} texture
 * @param {number} capacity Most particles alive at once.
 * @param {{ colors: Color4[], size: number[], life: number[], power: number[], gravity: Vector3 }} look
 *   colors = [start A, start B, when fading out]; size/life/power = [min, max].
 */
function createParticles(scene, name, texture, capacity, look) {
  const system = new ParticleSystem(name, capacity, scene);
  system.particleTexture = texture;
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  system.updateSpeed = REAL_TIME;
  [system.color1, system.color2, system.colorDead] = look.colors;
  [system.minSize, system.maxSize] = look.size;
  [system.minLifeTime, system.maxLifeTime] = look.life;
  [system.minEmitPower, system.maxEmitPower] = look.power;
  system.gravity = look.gravity;
  system.minEmitBox = new Vector3(-0.05, 0, -0.05);
  system.maxEmitBox = new Vector3(0.05, 0.02, 0.05);
  system.emitRate = 0;
  return system;
}

/**
 * Points a particle system's random directions away from a surface.
 *
 * @param {ParticleSystem} system
 * @param {Vector3} normal Unit vector pointing out of the surface.
 * @param {Vector3} reflected Where the water would bounce.
 * @param {number} spread How much randomness to add in every direction.
 */
function aimParticles(system, normal, reflected, spread) {
  const x = normal.x * 0.7 + reflected.x * 0.4;
  const y = normal.y * 0.7 + reflected.y * 0.4;
  const z = normal.z * 0.7 + reflected.z * 0.4;
  system.direction1.set(x - spread, y - spread * 0.3, z - spread);
  system.direction2.set(x + spread, y + spread, z + spread);
}
