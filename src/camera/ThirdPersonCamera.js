import { FreeCamera, Ray, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import {
  applyMouseLook,
  approachDistance,
  cameraOffset,
  playerOpacityForDistance,
} from './cameraMath.js';

const MIN_DISTANCE = 0.1;

/**
 * Over-the-shoulder camera that orbits the player with the mouse.
 *
 * Each frame it works out where it would like to be (behind the player, over the right
 * shoulder), then casts a ray from the player's head toward that spot. If a wall or prop is
 * in the way, the camera moves in front of it so the view is never blocked.
 */
export class ThirdPersonCamera {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('../game/Input.js').Input} input
   * @param {{ position: Vector3, setOpacity(opacity: number): void }} target The player.
   * @param {number} initialYaw
   */
  constructor(scene, input, target, initialYaw) {
    this.scene = scene;
    this.input = input;
    this.target = target;
    this.yaw = initialYaw;
    this.pitch = config.camera.initialPitch;
    // Current distance from the pivot. Infinity makes the first update snap into place.
    this.currentDistance = Number.POSITIVE_INFINITY;
    /** Set while pushing the mower: the camera eases out to its mowing position. */
    this.isMowing = false;
    this.mowingBlend = 0; // 0 = walking view, 1 = mowing view

    this.babylonCamera = new FreeCamera('playerCamera', Vector3.Zero(), scene);
    this.babylonCamera.fov = config.camera.fov;
    this.babylonCamera.minZ = config.camera.nearClip;
    this.babylonCamera.inputs.clear(); // we move it ourselves instead of Babylon's controls
    scene.activeCamera = this.babylonCamera;

    // Reused every frame to avoid creating garbage.
    this.pivot = new Vector3();
    this.direction = new Vector3();
    this.ray = new Ray(new Vector3(), new Vector3(0, 0, 1), 1);
    /** @param {import('@babylonjs/core').AbstractMesh} mesh */
    this.blocksView = (mesh) => mesh.checkCollisions && mesh.isEnabled() && mesh.isVisible;

    this.update(0);
  }

  /** @param {number} dt Seconds since the previous frame. */
  update(dt) {
    const settings = config.camera;

    if (this.input.isPointerLocked) {
      const { dx, dy } = this.input.mouseDelta;
      ({ yaw: this.yaw, pitch: this.pitch } = applyMouseLook(
        this.yaw,
        this.pitch,
        dx,
        dy,
        settings,
      ));
    }

    // Blend smoothly between the walking and mowing views.
    const mowingTarget = this.isMowing ? 1 : 0;
    this.mowingBlend += (mowingTarget - this.mowingBlend) * (1 - Math.exp(-5 * dt));
    const blend = this.mowingBlend;
    const { mowing } = settings;
    /** @param {number} walking @param {number} whileMowing */
    const mix = (walking, whileMowing) => walking + (whileMowing - walking) * blend;

    this.pivot.copyFrom(this.target.position);
    this.pivot.y += mix(settings.pivotHeight, mowing.pivotHeight);

    const offset = cameraOffset(
      this.yaw,
      this.pitch,
      mix(settings.distance, mowing.distance),
      mix(settings.shoulderOffset, mowing.shoulderOffset),
    );
    const fullDistance = Math.hypot(offset.x, offset.y, offset.z);
    this.direction.set(offset.x, offset.y, offset.z).scaleInPlace(1 / fullDistance);

    // Is anything between the player's head and where the camera wants to be?
    this.ray.origin.copyFrom(this.pivot);
    this.ray.direction.copyFrom(this.direction);
    this.ray.length = fullDistance;
    const hit = this.scene.pickWithRay(this.ray, this.blocksView);
    const allowed = hit?.hit ? hit.distance - settings.collisionPadding : fullDistance;
    this.currentDistance = Math.max(
      MIN_DISTANCE,
      approachDistance(this.currentDistance, allowed, dt, settings.returnSpeed),
    );

    const camera = this.babylonCamera;
    camera.position
      .copyFrom(this.direction)
      .scaleInPlace(this.currentDistance)
      .addInPlace(this.pivot);
    camera.position.y = Math.max(camera.position.y, settings.minHeight); // stay above the ground
    camera.rotation.set(this.pitch, this.yaw, 0);

    // Fade the player out when the camera is squeezed in close, and partly while mowing so
    // you can see the mower through them.
    const closeOpacity = playerOpacityForDistance(
      this.currentDistance,
      settings.playerHiddenBelow,
      settings.playerSolidAbove,
    );
    this.target.setOpacity(Math.min(closeOpacity, mix(1, mowing.playerOpacity)));
  }
}
