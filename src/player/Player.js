import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import {
  cameraRelativeMove,
  moveInputFromKeys,
  moveTowards,
  turnTowards,
  yawFromDirection,
} from './movement.js';

/**
 * The player character: a capsule with a dark visor showing which way it faces.
 *
 * `root` sits at the player's feet. It's an invisible mesh so Babylon's built-in collision
 * system can move it: `moveWithCollisions` slides an ellipsoid around walls and props that
 * have `checkCollisions` set (see environment/greybox.js).
 */
export class Player {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('@babylonjs/core').ShadowGenerator} shadows
   * @param {import('../game/Input.js').Input} input
   * @param {{ position: number[], yaw: number }} spawn
   */
  constructor(scene, shadows, input, spawn) {
    const { height, radius } = config.player;
    this.input = input;
    this.velocity = { x: 0, z: 0 }; // meters per second, on the ground plane
    this.groundHeight = spawn.position[1];

    this.root = new Mesh('player', scene);
    this.root.position.set(spawn.position[0], spawn.position[1], spawn.position[2]);
    this.root.rotation.y = spawn.yaw;
    this.root.isPickable = false;
    // The collision shape: an ellipsoid the size of the body, centered halfway up.
    this.root.ellipsoid = new Vector3(radius, height / 2, radius);
    this.root.ellipsoidOffset = new Vector3(0, height / 2, 0);
    this.displacement = new Vector3(); // reused every frame

    const body = MeshBuilder.CreateCapsule(
      'playerBody',
      { height, radius, tessellation: 16 },
      scene,
    );
    body.parent = this.root;
    body.position.y = height / 2;
    body.material = matte('playerBodyMat', '#e8923a', scene);

    // Local +z is "forward", so the visor goes on the front of the head.
    const visor = MeshBuilder.CreateBox(
      'playerVisor',
      { width: radius * 1.1, height: 0.12, depth: 0.14 },
      scene,
    );
    visor.parent = body;
    visor.position.set(0, height / 2 - 0.28, radius - 0.03);
    visor.material = matte('playerVisorMat', '#23272e', scene);

    for (const mesh of [body, visor]) {
      mesh.isPickable = false; // the camera's view checks should ignore the player
      shadows.addShadowCaster(mesh);
    }
    this.meshes = [body, visor];
  }

  /** World position of the player's feet. */
  get position() {
    return this.root.position;
  }

  /**
   * @param {number} dt Seconds since the previous frame.
   * @param {number} cameraYaw Which way the camera faces, so W always means "away from me".
   * @param {number | null} [faceYaw] Face this way instead of the way you're walking (e.g.
   *   toward the string trimmer's head). You walk carefully meanwhile: slower, no running.
   */
  update(dt, cameraYaw, faceYaw = null) {
    const settings = config.player;

    // Only take movement input while the mouse is captured (i.e. while playing).
    const input = this.input.isPointerLocked
      ? moveInputFromKeys((code) => this.input.isDown(code))
      : { x: 0, z: 0 };
    const direction = cameraRelativeMove(input, cameraYaw);
    const careful = faceYaw !== null;
    const running = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    let topSpeed = running ? settings.runSpeed : settings.walkSpeed;
    if (careful) topSpeed = config.trimmer.walkSpeed;
    const isMoving = input.x !== 0 || input.z !== 0;

    // Accelerate toward the target velocity (or brake toward zero with no input).
    const target = { x: direction.x * topSpeed, z: direction.z * topSpeed };
    const rate = isMoving ? settings.acceleration : settings.deceleration;
    this.velocity = moveTowards(this.velocity, target, rate * dt);

    this.displacement.set(this.velocity.x * dt, 0, this.velocity.z * dt);
    this.root.moveWithCollisions(this.displacement);
    // The yard is flat, so instead of gravity we just keep the feet on the ground. This also
    // stops round props (like bushes) from nudging the player upward.
    this.root.position.y = this.groundHeight;

    // Face the direction you're walking (or where you're working).
    if (careful) {
      this.root.rotation.y = turnTowards(this.root.rotation.y, faceYaw, settings.turnSpeed, dt);
    } else if (isMoving) {
      this.root.rotation.y = turnTowards(
        this.root.rotation.y,
        yawFromDirection(direction),
        settings.turnSpeed,
        dt,
      );
    }
  }

  /**
   * Puts the player back at a spot, standing still.
   *
   * @param {{ position: number[], yaw: number }} spot
   */
  teleport(spot) {
    this.root.position.set(spot.position[0], spot.position[1], spot.position[2]);
    this.root.rotation.y = spot.yaw;
    this.velocity = { x: 0, z: 0 };
  }

  /**
   * Puts the player at a spot on the ground without walking there (e.g. behind the mower).
   *
   * @param {number} x
   * @param {number} z
   * @param {number} yaw
   */
  placeAt(x, z, yaw) {
    this.root.position.set(x, this.groundHeight, z);
    this.root.rotation.y = yaw;
    this.velocity = { x: 0, z: 0 };
  }

  /** @param {number} opacity 0 (invisible) to 1 (solid). The shadow stays either way. */
  setOpacity(opacity) {
    for (const mesh of this.meshes) mesh.visibility = opacity;
  }
}

/**
 * @param {string} name
 * @param {string} hex
 * @param {import('@babylonjs/core').Scene} scene
 */
function matte(name, hex, scene) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.specularColor = Color3.Black();
  return material;
}
