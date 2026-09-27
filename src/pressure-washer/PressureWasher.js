import { Color3, Ray, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import { SprayEffects } from './SprayEffects.js';
import { aimDirection, fanAxes, groundDistance, sprayAtDistance } from './sprayMath.js';
import { createWand, createWasherUnit, WAND_TIP_OFFSET } from './washerModels.js';

/** How far the crosshair looks for something to aim at, in meters. */
const AIM_DISTANCE = 40;
/** Aim targets closer than this to the gun fall back to the camera's direction. */
const MIN_AIM_DISTANCE = 0.6;
/** Where the gun sits relative to the player's feet: right hand, chest height, a bit forward. */
const GRIP_OFFSET = { right: 0.28, up: 1.15, forward: 0.22 };
/** How far the gun tips down when you're just carrying it, in radians. */
const RELAXED_DROOP = 0.6;
/** Show the "get closer" hint after moss has resisted the spray for this long (seconds). */
const MOSS_HINT_DELAY = 0.35;

/**
 * The pressure washer: a machine you walk up to, a spray gun you carry, and the water.
 *
 * Aiming uses two rays:
 * 1. From the camera through the crosshair, to find what you're aiming at.
 * 2. From the gun's nozzle to that point. This is the real spray: it decides what gets wet
 *    and cleaned, so walls between the gun and the target block the water.
 */
export class PressureWasher {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('@babylonjs/core').ShadowGenerator} shadows
   * @param {import('../game/Input.js').Input} input
   * @param {import('../player/Player.js').Player} player
   * @param {import('../camera/ThirdPersonCamera.js').ThirdPersonCamera} camera
   * @param {import('../cleaning/CleaningSystem.js').CleaningSystem} cleaning
   * @param {{ position: number[], yaw: number }} spot Where the machine stands.
   */
  constructor(scene, shadows, input, player, camera, cleaning, spot) {
    this.scene = scene;
    this.input = input;
    this.player = player;
    this.camera = camera;
    this.cleaning = cleaning;

    this.unit = createWasherUnit(scene, shadows, spot);
    this.wand = createWand(scene, 'heldWand');
    this.wand.root.setEnabled(false);
    for (const mesh of this.wand.meshes) shadows.addShadowCaster(mesh);
    this.effects = new SprayEffects(scene);

    this.isEquipped = false;
    /** True only on the frame the gun was picked up (for a pickup sound). */
    this.justEquipped = false;
    this.isSpraying = false;
    /** Whether the water is landing on something (vs. spraying into the air). */
    this.isHitting = false;
    /** Spray strength (0..1) where the water lands. */
    this.sprayStrength = 0;
    /** Text for the HUD to show, or null. */
    this.prompt = /** @type {string | null} */ (null);
    /** Dirt removed per second right now, for splatter and sound. */
    this.dirtRate = 0;
    /** How much of the dirt coming off is moss (0..1), to tint the splatter. */
    this.mossShare = 0;
    /** Seconds the spray has been hitting moss without lifting it. */
    this.mossResistTime = 0;
    /** Whether the flat fan of water is turned upright (Q toggles). */
    this.fanVertical = config.washer.startVertical;
    this.cameraRight = new Vector3();
    this.time = 0;

    // Reused every frame to avoid creating garbage.
    this.aimPoint = new Vector3();
    this.grip = new Vector3();
    this.direction = new Vector3();
    this.nozzle = new Vector3();
    this.lookTarget = new Vector3();
    this.sprayRay = new Ray(new Vector3(), new Vector3(0, 0, 1), 1);
    /** @param {import('@babylonjs/core').AbstractMesh} mesh */
    this.canBeHit = (mesh) => mesh.isPickable && mesh.isVisible;
  }

  /** @param {number} dt Seconds since the previous frame. */
  update(dt) {
    this.time += dt;
    this.justEquipped = false;
    this.effects.update(dt);
    if (!this.isEquipped) {
      this.updatePickup();
      return;
    }

    if (this.input.wasPressed(config.washer.fanKey)) this.fanVertical = !this.fanVertical;
    const wantsToSpray = this.input.isPointerLocked && this.input.isMouseDown(0);
    this.findAimPoint();
    this.positionWand(wantsToSpray);
    if (wantsToSpray) this.spray(dt);
    else this.stopSpraying();
    this.prompt = this.mossResistTime > MOSS_HINT_DELAY ? 'Moss is tough: get closer' : null;
  }

  /** Before pickup: glow and show a prompt when the player is close enough. */
  updatePickup() {
    const inReach =
      groundDistance(this.player.position, this.unit.root.position) <= config.washer.pickupRange;
    this.prompt = inReach ? 'Press E to pick up the pressure washer' : null;
    const glow = inReach ? 0.18 + 0.12 * Math.sin(this.time * 6) : 0;
    this.unit.bodyMaterial.emissiveColor.set(glow, glow * 0.8, 0);

    if (inReach && this.input.wasPressed('KeyE')) {
      this.isEquipped = true;
      this.justEquipped = true;
      this.prompt = null;
      this.unit.bodyMaterial.emissiveColor = Color3.Black();
      this.unit.restingWand.root.setEnabled(false);
      this.wand.root.setEnabled(true);
    }
  }

  /** Ray 1: what is the crosshair on? */
  findAimPoint() {
    const ray = this.camera.babylonCamera.getForwardRay(AIM_DISTANCE);
    const hit = this.scene.pickWithRay(ray, this.canBeHit);
    if (hit?.hit && hit.pickedPoint) this.aimPoint.copyFrom(hit.pickedPoint);
    else this.aimPoint.copyFrom(ray.direction).scaleInPlace(AIM_DISTANCE).addInPlace(ray.origin);
  }

  /**
   * Puts the gun in the player's right hand, pointing at the aim point while spraying and
   * tipped down while just carrying it.
   *
   * @param {boolean} aiming
   */
  positionWand(aiming) {
    const yaw = this.player.root.rotation.y;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    this.grip.set(
      this.player.position.x + forwardZ * GRIP_OFFSET.right + forwardX * GRIP_OFFSET.forward,
      this.player.position.y + GRIP_OFFSET.up,
      this.player.position.z - forwardX * GRIP_OFFSET.right + forwardZ * GRIP_OFFSET.forward,
    );

    if (aiming) {
      const cameraForward = this.camera.babylonCamera.getDirection(Vector3.Forward());
      const direction = aimDirection(this.grip, this.aimPoint, cameraForward, MIN_AIM_DISTANCE);
      this.direction.set(direction.x, direction.y, direction.z);
    } else {
      const level = Math.cos(RELAXED_DROOP);
      this.direction.set(forwardX * level, -Math.sin(RELAXED_DROOP), forwardZ * level);
    }

    this.wand.root.position.copyFrom(this.grip);
    this.lookTarget.copyFrom(this.grip).addInPlace(this.direction);
    this.wand.root.lookAt(this.lookTarget);
    this.nozzle.copyFrom(this.direction).scaleInPlace(WAND_TIP_OFFSET).addInPlace(this.grip);
  }

  /**
   * Ray 2: the water itself, from the nozzle toward the aim point.
   *
   * @param {number} dt
   */
  spray(dt) {
    const settings = config.washer;
    this.sprayRay.origin.copyFrom(this.nozzle);
    this.sprayRay.direction.copyFrom(this.direction);
    this.sprayRay.length = settings.maxRange;
    const hit = this.scene.pickWithRay(this.sprayRay, this.canBeHit);
    const landed = Boolean(hit?.hit);
    const distance = landed && hit ? hit.distance : settings.maxRange;
    const { radius, strength } = sprayAtDistance(distance, settings);
    this.camera.babylonCamera.getDirectionToRef(Vector3.Right(), this.cameraRight);
    const { wide, thin } = fanAxes(this.direction, this.cameraRight, this.fanVertical);

    const result = landed
      ? this.cleaning.spray(hit, dt, {
          sprayDirection: this.direction,
          wide,
          thin,
          radius,
          strength,
        })
      : { removed: 0, toughRemoved: 0, resisted: 0 };
    if (!landed) this.cleaning.stopSpraying();
    this.dirtRate = dt > 0 ? result.removed / dt : 0;
    this.mossShare = result.removed > 0 ? result.toughRemoved / result.removed : 0;
    // Hitting moss that isn't coming off? Time to suggest getting closer.
    const mossStuck = result.resisted > 0 && result.toughRemoved < result.resisted * 0.001;
    this.mossResistTime = mossStuck ? this.mossResistTime + dt : 0;
    this.isSpraying = true;
    this.isHitting = landed;
    this.sprayStrength = landed ? strength : 0;

    this.effects.show({
      nozzle: this.nozzle,
      direction: this.direction,
      wide,
      distance,
      radius,
      strength,
      hitNormal: landed && hit ? hit.getNormal(true) : null,
      dirtRate: this.dirtRate,
      mossShare: this.mossShare,
    });
  }

  stopSpraying() {
    if (!this.isSpraying) return;
    this.isSpraying = false;
    this.isHitting = false;
    this.sprayStrength = 0;
    this.dirtRate = 0;
    this.mossShare = 0;
    this.mossResistTime = 0;
    this.effects.hide();
    this.cleaning.stopSpraying();
  }
}
