import { Mesh, MeshBuilder, Vector3 } from '@babylonjs/core';
import { wrapAngle } from '../camera/cameraMath.js';
import { config } from '../config.js';
import { lerpPose } from '../lawn/deckPose.js';
import { turnTowards } from '../player/movement.js';
import { steerTowards, updateMotion } from './mowerMath.js';
import { createMowerModel, WHEEL_RADIUS } from './mowerModel.js';

/**
 * The push mower. Walk up to it and press E to grab the handle; then W/S push and pull it,
 * and it steers either toward where you look (mouse steering) or with A/D (key steering),
 * picked in the tuning panel. E again lets go.
 *
 * While you hold it, the mower and the player move as one: the mower leads when pushing and
 * the player leads when pulling back. Both slide off walls and props using Babylon's
 * collisions; the mower's heading then follows the direction from the player to the deck, so
 * pushing along a wall turns the mower to run alongside it.
 */
export class PushMower {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('@babylonjs/core').ShadowGenerator} shadows
   * @param {import('../game/Input.js').Input} input
   * @param {import('../player/Player.js').Player} player
   * @param {import('../camera/ThirdPersonCamera.js').ThirdPersonCamera} camera
   * @param {{ position: number[], yaw: number }} spot Where it's parked at the start.
   */
  constructor(scene, shadows, input, player, camera, spot) {
    this.input = input;
    this.player = player;
    this.camera = camera;
    this.spot = spot;
    this.model = createMowerModel(scene, shadows);

    // The collision shape: a round puck around the deck, moved with moveWithCollisions.
    const radius = config.mower.colliderRadius;
    this.collider = new Mesh('mowerCollider', scene);
    this.collider.isPickable = false;
    this.collider.ellipsoid = new Vector3(radius, 0.25, radius);
    this.collider.ellipsoidOffset = new Vector3(0, 0.3, 0);
    // While parked, an invisible box stops the player walking through the mower. It's much
    // taller than the mower: Babylon slides the player's body up and over low obstacles (and
    // their feet are then pinned back to the ground), so a mower-height box wouldn't stop them.
    this.blocker = MeshBuilder.CreateBox(
      'mowerBlocker',
      { width: 0.62, height: 1.6, depth: 0.72 },
      scene,
    );
    this.blocker.parent = this.model.root;
    this.blocker.position.y = 0.8;
    this.blocker.isVisible = false;
    this.blocker.isPickable = false;

    this.displacement = new Vector3(); // reused every frame
    this.time = 0;
    this.everHeld = false;
    this.park(spot);
  }

  /** @param {{ position: number[], yaw: number }} spot */
  park(spot) {
    /** @type {'parked' | 'grabbing' | 'held'} */
    this.state = 'parked';
    this.yaw = spot.yaw;
    this.motion = { speed: 0, yawRate: 0 };
    this.speedFactor = 1; // < 1 while something (like thick grass) holds the mower back
    this.bumped = false; // true on a frame the mower ran into something
    this.collider.position.set(spot.position[0], 0, spot.position[2]);
    this.collider.computeWorldMatrix(true);
    this.blocker.checkCollisions = true;
    this.syncModel(0);
  }

  get isHeld() {
    return this.state !== 'parked';
  }

  /** The blades spin (and cut) once you're holding the handle. */
  get isCutting() {
    return this.state === 'held';
  }

  /** Where the deck is now, in world meters. */
  get deckPose() {
    return { x: this.collider.position.x, z: this.collider.position.z, yaw: this.yaw };
  }

  /** Interaction hint for the HUD, or null. */
  get prompt() {
    if (this.state === 'parked' && this.isPlayerNear()) return 'Press E to grab the mower';
    return null;
  }

  isPlayerNear() {
    const player = this.player.position;
    const deck = this.collider.position;
    return Math.hypot(player.x - deck.x, player.z - deck.z) < config.mower.grabRange;
  }

  /** @param {number} dt Seconds since the previous frame. */
  update(dt) {
    this.time += dt;
    this.bumped = false;
    this.justGrabbed = false;
    const grabPressed = this.input.isPointerLocked && this.input.wasPressed(config.mower.grabKey);
    if (grabPressed) {
      if (this.state === 'parked' && this.isPlayerNear()) this.startGrab();
      else if (this.isHeld) this.letGo();
    }
    const before = this.deckPose;
    if (this.state === 'grabbing') this.updateGrab(dt);
    else if (this.state === 'held') this.drive(dt);
    const after = this.deckPose;
    const rolled =
      (after.x - before.x) * Math.sin(after.yaw) + (after.z - before.z) * Math.cos(after.yaw);
    this.syncModel(rolled);
  }

  startGrab() {
    this.state = 'grabbing';
    this.everHeld = true;
    this.justGrabbed = true;
    this.grabProgress = 0;
    this.blocker.checkCollisions = false; // we're about to move through where it was
    const feet = this.player.position;
    this.grabFrom = { x: feet.x, z: feet.z, yaw: this.player.root.rotation.y };
    this.grabFromCamera = { yaw: this.camera.yaw, pitch: this.camera.pitch };
  }

  letGo() {
    this.state = 'parked';
    this.motion = { speed: 0, yawRate: 0 };
    this.blocker.checkCollisions = true;
    this.player.velocity = { x: 0, z: 0 };
  }

  /** Where the player stands while holding the handle: behind the deck, facing forward. */
  handlePose() {
    const length = config.mower.handleLength;
    const deck = this.collider.position;
    return {
      x: deck.x - Math.sin(this.yaw) * length,
      z: deck.z - Math.cos(this.yaw) * length,
      yaw: this.yaw,
    };
  }

  /**
   * Steps the player into the handle (and swings the camera behind the mower) over a moment.
   *
   * @param {number} dt
   */
  updateGrab(dt) {
    this.grabProgress = Math.min(1, this.grabProgress + dt / config.mower.grabTime);
    const t = this.grabProgress * this.grabProgress * (3 - 2 * this.grabProgress); // ease in-out
    const pose = lerpPose(this.grabFrom, this.handlePose(), t);
    this.player.placeAt(pose.x, pose.z, pose.yaw);
    // Swing the camera in behind the mower, looking down at it a little if it wasn't already.
    const from = this.grabFromCamera;
    this.camera.yaw = wrapAngle(from.yaw + wrapAngle(this.yaw - from.yaw) * t);
    const pitch = Math.max(from.pitch, config.camera.mowing.pitch);
    this.camera.pitch = from.pitch + (pitch - from.pitch) * t;
    if (this.grabProgress >= 1) this.state = 'held';
  }

  /** @param {number} dt */
  drive(dt) {
    const settings = config.mower;
    const locked = this.input.isPointerLocked;
    /** @param {string[]} codes */
    const down = (...codes) => locked && codes.some((code) => this.input.isDown(code));
    const throttle = (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
    let turn = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);

    if (settings.steering === 'mouse') {
      // The mower heads where you look. A/D swing the view (and so the mower) as well.
      this.camera.yaw = wrapAngle(this.camera.yaw + turn * settings.turnSpeed * dt);
      turn = steerTowards(this.yaw, this.camera.yaw, settings.mouseFullTurnAngle);
    } else {
      this.followWithCamera(dt);
    }

    this.motion = updateMotion(this.motion, { throttle, turn }, settings, dt, this.speedFactor);
    this.moveTogether(this.yaw + this.motion.yawRate * dt, this.motion.speed * dt, dt);
  }

  /**
   * Key steering: while you're not using the mouse, the camera swings in behind the mower,
   * like a chase camera.
   *
   * @param {number} dt
   */
  followWithCamera(dt) {
    const { dx, dy } = this.input.mouseDelta;
    const looking = !this.input.blocked && (dx !== 0 || dy !== 0);
    this.mouseIdle = looking ? 0 : (this.mouseIdle ?? 0) + dt;
    const moving = Math.abs(this.motion.speed) > 0.05 || Math.abs(this.motion.yawRate) > 0.05;
    if (this.mouseIdle > 0.6 && moving) {
      this.camera.yaw = turnTowards(this.camera.yaw, this.yaw, config.mower.cameraFollow, dt);
    }
  }

  /**
   * Moves the mower and the player as one, sliding off obstacles.
   *
   * @param {number} yaw The heading the controls ask for.
   * @param {number} distance How far to roll along it (negative = pull back).
   * @param {number} dt
   */
  moveTogether(yaw, distance, dt) {
    const length = config.mower.handleLength;
    const feet = this.player.position;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    let deck;
    if (distance >= 0) {
      // Pushing: turning swings the deck around your hands, then it rolls forward.
      const startX = feet.x + forwardX * length;
      const startZ = feet.z + forwardZ * length;
      deck = this.moveCollider(startX + forwardX * distance, startZ + forwardZ * distance);
      // Anything in the way soaks up the push.
      const achieved = (deck.x - startX) * forwardX + (deck.z - startZ) * forwardZ;
      if (distance > 0 && achieved < distance * 0.98) this.slowTo(Math.max(0, achieved) / dt);
    } else {
      // Pulling back: you lead, and the mower follows.
      this.movePlayer(feet.x + forwardX * distance, feet.z + forwardZ * distance, yaw);
      deck = this.moveCollider(feet.x + forwardX * length, feet.z + forwardZ * length);
    }

    // The mower points from your hands to wherever the deck actually ended up.
    const heading = Math.atan2(deck.x - feet.x, deck.z - feet.z);
    const turned = wrapAngle(heading - this.yaw) / dt;
    if (Math.abs(turned) < Math.abs(this.motion.yawRate)) this.motion.yawRate = turned;
    this.yaw = heading;
    const headingX = Math.sin(heading);
    const headingZ = Math.cos(heading);
    if (distance >= 0)
      this.movePlayer(deck.x - headingX * length, deck.z - headingZ * length, heading);
    else this.player.placeAt(deck.x - headingX * length, deck.z - headingZ * length, heading);
    // Keep the two exactly one handle apart, even if the player got caught on something.
    this.collider.position.set(feet.x + headingX * length, 0, feet.z + headingZ * length);
    this.collider.computeWorldMatrix(true);
  }

  /** @param {number} speed Obstacles can only slow the mower, never speed it up. */
  slowTo(speed) {
    if (this.motion.speed - speed > 0.4) this.bumped = true;
    this.motion.speed = Math.min(this.motion.speed, speed);
  }

  /**
   * @param {number} x
   * @param {number} z
   * @returns {Vector3} Where the deck ended up.
   */
  moveCollider(x, z) {
    moveWithCollisions(this.collider, x, z, this.displacement);
    this.collider.position.y = 0;
    return this.collider.position;
  }

  /**
   * @param {number} x
   * @param {number} z
   * @param {number} yaw
   */
  movePlayer(x, z, yaw) {
    const root = this.player.root;
    moveWithCollisions(root, x, z, this.displacement);
    this.player.placeAt(root.position.x, root.position.z, yaw);
  }

  /**
   * Moves the visible mower to the collider, spins the wheels, and shakes the engine.
   *
   * @param {number} rolled Meters rolled forward this frame (negative = backward).
   */
  syncModel(rolled) {
    const { root, chassis, wheels } = this.model;
    root.position.set(this.collider.position.x, 0, this.collider.position.z);
    root.rotation.y = this.yaw;
    for (const wheel of wheels) wheel.rotation.x += rolled / WHEEL_RADIUS;
    const running = this.isHeld;
    const shake = config.mower.engineShake;
    chassis.position.y = running ? shake * Math.sin(this.time * 173) : 0;
    chassis.rotation.z = running ? shake * 2 * Math.sin(this.time * 131) : 0;
  }
}

/**
 * Slides a mesh toward (x, z), stopping at anything solid in the way.
 *
 * Babylon ignores collision moves shorter than 1 mm, which is how far a mower moves in its
 * first frames of rolling off; without the direct move below, it would never get going.
 *
 * @param {import('@babylonjs/core').AbstractMesh} mesh
 * @param {number} x
 * @param {number} z
 * @param {Vector3} displacement Scratch vector, to avoid creating garbage.
 */
function moveWithCollisions(mesh, x, z, displacement) {
  displacement.set(x - mesh.position.x, 0, z - mesh.position.z);
  if (displacement.length() < 0.002) {
    mesh.position.addInPlace(displacement); // too small to pass through anything
  } else {
    mesh.computeWorldMatrix(true); // positions set by hand aren't picked up until then
    mesh.moveWithCollisions(displacement);
  }
}
