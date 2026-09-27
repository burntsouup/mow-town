import { FreeCamera, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import { forwardFromYawPitch } from './cameraMath.js';
import { aerialView, blendViews, RevealTimeline } from './revealMath.js';

/**
 * The aerial "look at your lawn" shot. While it plays, it takes over from the player's
 * camera: it flies up from the player's view to above the street, swings slowly across the
 * lawn so the stripes catch the light, and flies back down (see revealMath.js).
 */
export class RevealCamera {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('./ThirdPersonCamera.js').ThirdPersonCamera} playerCamera
   * @param {{ x: number, z: number }} center Middle of the lawn.
   */
  constructor(scene, playerCamera, center) {
    this.scene = scene;
    this.playerCamera = playerCamera;
    this.center = center;
    this.camera = new FreeCamera('revealCamera', new Vector3(), scene);
    this.camera.fov = config.camera.fov;
    this.camera.minZ = 0.1;
    this.camera.inputs.clear();
    this.timeline = new RevealTimeline(config.job.reveal);
    this.target = new Vector3(); // reused every frame
  }

  get isActive() {
    return this.timeline.isActive;
  }

  /** How long it's been playing, in seconds. */
  get time() {
    return this.timeline.time;
  }

  start() {
    this.timeline.start();
  }

  /** Head back to the player now. */
  skip() {
    this.timeline.skip();
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.isActive) return;
    const blend = this.timeline.update(dt);
    const player = this.playerCamera.babylonCamera;
    if (!this.isActive) {
      this.scene.activeCamera = player; // done: back to the player's own camera
      return;
    }
    const settings = config.job.reveal;
    const swing = settings.swing * (2 * Math.min(1, this.time / this.timeline.duration) - 1);
    const look = forwardFromYawPitch(this.playerCamera.yaw, this.playerCamera.pitch);
    const from = {
      position: player.position,
      target: {
        x: player.position.x + look.x * 10,
        y: player.position.y + look.y * 10,
        z: player.position.z + look.z * 10,
      },
    };
    const view = blendViews(from, aerialView(this.center, settings, swing), blend);
    this.camera.position.set(view.position.x, view.position.y, view.position.z);
    this.camera.setTarget(this.target.set(view.target.x, view.target.y, view.target.z));
    this.scene.activeCamera = this.camera;
  }
}
