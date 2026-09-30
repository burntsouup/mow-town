import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { plastic, roundedMesh } from './toyMeshes.js';

const STAKE_HEIGHT = 0.42; // meters above the ground
const TIED_AT = 0.32; // where the line is tied on
const SAG = 0.12; // how far the middle of the line droops
const LINE_RADIUS = 0.009; // thicker than a real one, so it shows from behind the mower
const LINE_COLOR = '#ff5a1f'; // bright orange mason's line: it shows up against any green
const STAKE_COLOR = '#b88a5a';

/**
 * A groundskeeper's string line: two stakes with a bright line between them, to mow the
 * first stripe of a pattern along (then each stripe follows the edge of the one before).
 * Only there while a job that asks for it is on.
 */
export class StringLine {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {{ from: [number, number], to: [number, number] }} guide World meters, [x, z].
   */
  constructor(scene, guide) {
    this.root = new TransformNode('stringLine', scene);
    const wood = plastic(scene, STAKE_COLOR, { shine: 0.1, power: 16 });
    const flag = plastic(scene, LINE_COLOR, { shine: 0.2 });
    const ends = [guide.from, guide.to];
    const [dx, dz] = [guide.to[0] - guide.from[0], guide.to[1] - guide.from[1]];
    const along = Math.atan2(dx, dz);
    ends.forEach(([x, z], i) => {
      const stake = roundedMesh(`stake${i}`, [0.035, STAKE_HEIGHT, 0.035], 0.008, scene);
      stake.material = wood;
      stake.position.set(x, STAKE_HEIGHT / 2, z);
      stake.parent = this.root;
      // A little flag on top, flying out sideways from the line.
      const banner = roundedMesh(`stakeFlag${i}`, [0.004, 0.07, 0.11], 0.002, scene);
      banner.material = flag;
      banner.position.set(x, STAKE_HEIGHT - 0.05, z);
      banner.rotation.y = along + Math.PI / 2;
      banner.translate(new Vector3(0, 0, 1), 0.06);
      banner.parent = this.root;
    });

    // The line itself, drooping a little in the middle.
    const path = [];
    const steps = 24;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const droop = SAG * 4 * t * (1 - t);
      path.push(new Vector3(guide.from[0] + dx * t, TIED_AT - droop, guide.from[1] + dz * t));
    }
    const line = MeshBuilder.CreateTube(
      'stringLineLine',
      { path, radius: LINE_RADIUS, tessellation: 5 },
      scene,
    );
    const material = new StandardMaterial('stringLineMat', scene);
    material.diffuseColor = Color3.FromHexString(LINE_COLOR);
    material.emissiveColor = Color3.FromHexString(LINE_COLOR).scale(0.6); // bright in shade
    material.specularColor = Color3.Black();
    line.material = material;
    line.parent = this.root;
    for (const mesh of this.root.getChildMeshes()) mesh.isPickable = false;
    this.root.setEnabled(false);
  }

  /** @param {boolean} visible */
  show(visible) {
    if (this.root.isEnabled() !== visible) this.root.setEnabled(visible);
  }
}
