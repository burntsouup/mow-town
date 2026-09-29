import { Color4, ParticleSystem, Vector3 } from '@babylonjs/core';
import { forwardFromYawPitch } from '../camera/cameraMath.js';
import { config } from '../config.js';
import { createSliverTexture } from '../effects/effectTextures.js';
import { groundAim, sweepTowards, withinReach } from './trimmerMath.js';
import { createTrimmerModel, LINE_RADIUS } from './trimmerModel.js';

/** Where your hands hold the trimmer, relative to your feet: right, up, forward (meters). */
const HANDS = { right: 0.34, up: 0.82, forward: 0.34 };
/** How high the head rides above the ground (meters). */
const HEAD_HEIGHT = 0.02;
/** Seconds the view takes to tip down toward the head when you take the trimmer out. */
const LOOK_DOWN_TIME = 0.4;

/**
 * The string trimmer, for the grass the mower can't reach. Q takes it out or puts it away
 * (not while you're pushing the mower); holding the mouse button spins the line.
 *
 * You aim by looking: the head goes where your view meets the ground, kept within arm's reach
 * and swung there at a human speed, and you turn to face it. The Game does the cutting,
 * from `from` to `head` each frame while it `isRunning`.
 */
export class StringTrimmer {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('@babylonjs/core').ShadowGenerator} shadows
   * @param {import('../game/Input.js').Input} input
   * @param {import('../player/Player.js').Player} player
   * @param {import('../camera/ThirdPersonCamera.js').ThirdPersonCamera} camera
   */
  constructor(scene, shadows, input, player, camera) {
    this.input = input;
    this.player = player;
    this.camera = camera;
    this.model = createTrimmerModel(scene, shadows);
    this.spray = createSpray(scene);
    this.headPosition = new Vector3(); // where the spray comes from; reused every frame
    this.spray.emitter = this.headPosition;
    this.handsPosition = new Vector3();
    this.isOut = false;
    this.isRunning = false;
    this.everRun = false;
    this.head = { x: 0, z: 0 };
    this.from = { x: 0, z: 0 }; // where the head was at the start of this frame
    this.spin = 0;
    this.lookingDown = 0; // seconds left of tipping the view down
    this.show(false);
  }

  /** Which way the player should face while carrying it (at the head), or null. */
  get faceYaw() {
    if (!this.isOut) return null;
    const feet = this.player.position;
    return Math.atan2(this.head.x - feet.x, this.head.z - feet.z);
  }

  /**
   * Where your hands hold it, in world space: the left on the loop handle, the right on the
   * grip by the motor.
   *
   * @returns {Vector3[]}
   */
  gripPoints() {
    const world = this.model.arm.computeWorldMatrix(true);
    return [new Vector3(0, 0.06, 0.3), new Vector3(0, -0.02, -0.03)].map((p) =>
      Vector3.TransformCoordinates(p, world),
    );
  }

  /** Interaction hint for the HUD, or null. */
  get prompt() {
    return this.isOut && !this.everRun ? 'Hold the mouse button to trim' : null;
  }

  /**
   * @param {number} dt Seconds since the previous frame.
   * @param {boolean} canUse False while your hands are busy (e.g. pushing the mower).
   */
  update(dt, canUse) {
    const settings = config.trimmer;
    if (!canUse) {
      if (this.isOut) this.putAway();
    } else if (this.input.isPointerLocked && this.input.wasPressed(settings.key)) {
      if (this.isOut) this.putAway();
      else this.takeOut();
    }
    this.isRunning = this.isOut && this.input.isPointerLocked && this.input.isMouseDown(0);
    if (this.isRunning) this.everRun = true;
    if (!this.isOut) return;

    // Keep the head in view: tip the view down when you take it out, and don't let it look
    // up past the horizon meanwhile.
    const view = config.camera.trimming;
    if (this.lookingDown > 0) {
      this.lookingDown -= dt;
      const pitch = Math.max(this.camera.pitch, view.pitch);
      this.camera.pitch += (pitch - this.camera.pitch) * (1 - Math.exp(-10 * dt));
    }
    this.camera.pitch = Math.max(this.camera.pitch, view.minPitch);
    const camera = this.camera.babylonCamera.position;
    const looking = forwardFromYawPitch(this.camera.yaw, this.camera.pitch);
    const aim = groundAim(camera, looking, settings.aimFar);
    const feet = this.player.position;
    const target = withinReach(feet, aim, settings.reach, this.player.root.rotation.y);
    this.from = this.head;
    this.head = sweepTowards(this.head, target, dt, settings);
    this.place(dt);
  }

  takeOut() {
    this.isOut = true;
    const feet = this.player.position;
    const yaw = this.player.root.rotation.y;
    const reach = config.trimmer.reach.max * 0.8;
    this.head = { x: feet.x + Math.sin(yaw) * reach, z: feet.z + Math.cos(yaw) * reach };
    this.from = this.head;
    this.lookingDown = LOOK_DOWN_TIME;
    this.show(true);
  }

  putAway() {
    this.isOut = false;
    this.isRunning = false;
    this.show(false);
  }

  /**
   * Sprays grass bits from the head, in proportion to how much it's cutting.
   *
   * @param {number} cutRate Grass cut per second (see GrassGrid.cutDeck).
   */
  updateSpray(cutRate) {
    const { trimmerSprayPerCut, maxTrimmerSpray } = config.effects;
    this.spray.emitRate = this.isRunning
      ? Math.min(maxTrimmerSpray, cutRate * trimmerSprayPerCut)
      : 0;
  }

  /** @param {boolean} visible */
  show(visible) {
    this.model.arm.setEnabled(visible);
    this.model.head.setEnabled(visible);
  }

  /**
   * Puts the model in your hands, reaching down to the head, and spins the line.
   *
   * @param {number} dt
   */
  place(dt) {
    const { arm, shaft, head, line } = this.model;
    const feet = this.player.position;
    const yaw = this.player.root.rotation.y;
    const [sin, cos] = [Math.sin(yaw), Math.cos(yaw)];
    this.handsPosition.set(
      feet.x + cos * HANDS.right + sin * HANDS.forward,
      feet.y + HANDS.up,
      feet.z - sin * HANDS.right + cos * HANDS.forward,
    );
    this.headPosition.set(this.head.x, feet.y + HEAD_HEIGHT, this.head.z);
    arm.position.copyFrom(this.handsPosition);
    arm.lookAt(this.headPosition);
    shaft.scaling.z = Vector3.Distance(this.handsPosition, this.headPosition);

    head.position.copyFrom(this.headPosition);
    head.rotation.y = Math.atan2(
      this.head.x - this.handsPosition.x,
      this.head.z - this.handsPosition.z,
    );
    line.isVisible = this.isRunning;
    const size = config.trimmer.radius / LINE_RADIUS;
    line.scaling.set(size, size, size);
    this.spin += dt * 40;
    line.rotation.y = this.spin;
  }
}

/**
 * Grass bits flung out from the spinning line, mostly forward and to the sides.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
function createSpray(scene) {
  const colors = config.effects.clippingColors;
  const spray = new ParticleSystem('trimmerSpray', 1000, scene);
  spray.particleTexture = createSliverTexture(scene);
  spray.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  spray.updateSpeed = 1 / 60; // one update step per frame = real seconds
  spray.minEmitBox = new Vector3(-0.1, 0.02, -0.1);
  spray.maxEmitBox = new Vector3(0.1, 0.06, 0.1);
  spray.direction1 = new Vector3(-1, 0.3, -1);
  spray.direction2 = new Vector3(1, 1.2, 1);
  spray.minEmitPower = 0.8;
  spray.maxEmitPower = 2;
  spray.gravity = new Vector3(0, -5, 0);
  spray.minLifeTime = 0.25;
  spray.maxLifeTime = 0.7;
  spray.minSize = 0.03;
  spray.maxSize = 0.06;
  spray.minInitialRotation = 0;
  spray.maxInitialRotation = Math.PI * 2;
  spray.minAngularSpeed = -14;
  spray.maxAngularSpeed = 14;
  spray.color1 = Color4.FromHexString(`${colors[0]}ff`);
  spray.color2 = Color4.FromHexString(`${colors[1]}ff`);
  spray.colorDead = Color4.FromHexString(`${colors[1]}00`);
  spray.emitRate = 0;
  spray.start();
  return spray;
}
