import { FreeCamera, Ray, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import {
  applyMouseLook,
  approachDistance,
  cameraOffset,
  playerOpacityForDistance,
  segmentHitsSphere,
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
    /**
     * Which view to ease toward: 'mowing' while pushing the mower (further back and higher),
     * 'trimming' while carrying the string trimmer (higher, looking down at its head).
     *
     * @type {'walking' | 'mowing' | 'trimming'}
     */
    this.mode = 'walking';
    /** How far (0..1) the view has blended into each special view. */
    this.blends = { mowing: 0, trimming: 0 };

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
    // Things the camera can pass through (like tree canopies), which fade out while they're
    // between it and the player. Marked by the level with metadata.seeThrough.
    this.seeThrough = scene.meshes.filter((mesh) => mesh.metadata?.seeThrough);

    this.update(0);
  }

  /** @param {number} dt Seconds since the previous frame. */
  update(dt) {
    const settings = config.camera;

    if (this.input.isPointerLocked && !this.input.blocked) {
      const { dx, dy } = this.input.mouseDelta;
      ({ yaw: this.yaw, pitch: this.pitch } = applyMouseLook(
        this.yaw,
        this.pitch,
        dx,
        dy,
        settings,
      ));
    }

    // Blend smoothly between the walking view and the special ones.
    for (const view of /** @type {const} */ (['mowing', 'trimming'])) {
      const target = this.mode === view ? 1 : 0;
      this.blends[view] += (target - this.blends[view]) * (1 - Math.exp(-5 * dt));
    }
    /** @param {'distance' | 'shoulderOffset' | 'pivotHeight'} key @param {number} walking */
    const mix = (key, walking) =>
      walking +
      (settings.mowing[key] - walking) * this.blends.mowing +
      (settings.trimming[key] - walking) * this.blends.trimming;

    this.pivot.copyFrom(this.target.position);
    this.pivot.y += mix('pivotHeight', settings.pivotHeight);

    const offset = cameraOffset(
      this.yaw,
      this.pitch,
      mix('distance', settings.distance),
      mix('shoulderOffset', settings.shoulderOffset),
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

    // Fade the player out when the camera is squeezed in close, and partly while mowing or
    // trimming so you can see the mower (or the trimmer's head) through them.
    const closeOpacity = playerOpacityForDistance(
      this.currentDistance,
      settings.playerHiddenBelow,
      settings.playerSolidAbove,
    );
    this.fadeSeeThrough(dt);

    const workingOpacity =
      1 +
      (settings.mowing.playerOpacity - 1) * this.blends.mowing +
      (settings.trimming.playerOpacity - 1) * this.blends.trimming;
    this.target.setOpacity(Math.min(closeOpacity, workingOpacity));
  }

  /**
   * Fades see-through things (like a tree's canopy) while they're between the camera and
   * the player, so trimming under a tree doesn't mean staring at leaves.
   *
   * @param {number} dt
   */
  fadeSeeThrough(dt) {
    const camera = this.babylonCamera.position;
    // Only while we're the camera you're looking through (not during the aerial view).
    const inUse = this.scene.activeCamera === this.babylonCamera;
    for (const mesh of this.seeThrough) {
      const sphere = mesh.getBoundingInfo().boundingSphere;
      const blocking =
        inUse && segmentHitsSphere(camera, this.pivot, sphere.centerWorld, sphere.radiusWorld);
      const target = blocking ? config.camera.seeThroughOpacity : 1;
      mesh.visibility += (target - mesh.visibility) * (1 - Math.exp(-8 * dt));
    }
  }
}
