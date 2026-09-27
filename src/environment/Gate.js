import { TransformNode } from '@babylonjs/core';
import { smoothstep } from '../cleaning/noise.js';

/**
 * A gate that swings open on its hinge (and can close again). It starts closed, blocking
 * the way; a job can unlock it.
 */
export class Gate {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('./greybox.js').Greybox} kit
   * @param {{ hinge: number[], length: number, height: number, color: string,
   *   openAngle: number, openTime: number }} options
   *   hinge [x, z] on the ground; the panel extends from the hinge toward -x; openAngle in
   *   radians (positive swings the free end toward +z); openTime in seconds.
   */
  constructor(scene, kit, { hinge, length, height, color, openAngle, openTime }) {
    this.openAngle = openAngle;
    this.openTime = openTime;
    this.openness = 0; // 0 = shut, 1 = wide open
    this.target = 0;

    this.hinge = new TransformNode('gateHinge', scene);
    this.hinge.position.set(hinge[0], 0, hinge[1]);
    // Built in the hinge's own space: the panel reaches from the hinge back along -x.
    const panel = kit.block('gate', {
      size: [length, height, 0.05],
      at: [-length / 2, 0, 0],
      color,
    });
    panel.parent = this.hinge;
    this.panel = panel;
  }

  open() {
    this.target = 1;
  }

  /** Shuts it at once (e.g. when starting everything over). */
  closeNow() {
    this.target = 0;
    this.openness = 0;
    this.hinge.rotation.y = 0;
  }

  /** @param {number} dt Seconds since the previous frame. */
  update(dt) {
    if (this.openness === this.target) return;
    const step = dt / this.openTime;
    this.openness =
      this.target > this.openness
        ? Math.min(this.target, this.openness + step)
        : Math.max(this.target, this.openness - step);
    // Ease in and out, like a real gate being pushed.
    this.hinge.rotation.y = this.openAngle * smoothstep(0, 1, this.openness);
  }
}
