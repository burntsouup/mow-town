import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { plastic, roundedMesh } from '../environment/toyMeshes.js';

const COLORS = {
  body: '#ffb020',
  shaft: '#8a929c',
  dark: '#26282d',
  rubber: '#1f2023',
  trigger: '#e03c31',
  line: '#e8f0e0',
};
/** The spinning line's disc is built this big, then scaled to the cutting radius. */
export const LINE_RADIUS = 0.2;

/**
 * Builds a toy-like string trimmer in two parts, placed separately each frame:
 * - `arm`: from your hands, pointing down at the head. Local +z runs along the shaft; the
 *   shaft is 1 m long, so scaling `shaft` along z stretches it to reach the head. The glossy
 *   motor sits behind your hands (rubber grip, red trigger), with a D-shaped handle partway
 *   down.
 * - `head`: the spool and its guard, sitting on the grass (local +z = away from you), with the
 *   spinning line: a see-through disc, shown while it runs.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').ShadowGenerator} shadows
 */
export function createTrimmerModel(scene, shadows) {
  /** @param {string} hex */
  const material = (hex) => {
    const mat = new StandardMaterial(`trimmer${hex}`, scene);
    mat.diffuseColor = Color3.FromHexString(hex);
    mat.specularColor = new Color3(0.15, 0.15, 0.15);
    return mat;
  };
  const materials = {
    body: plastic(scene, COLORS.body, { shine: 0.55, power: 64 }),
    shaft: plastic(scene, COLORS.shaft, { shine: 0.7, power: 80 }),
    dark: plastic(scene, COLORS.dark, { shine: 0.4, power: 48 }),
    rubber: plastic(scene, COLORS.rubber, { shine: 0.08, power: 16 }),
    trigger: plastic(scene, COLORS.trigger, { shine: 0.5 }),
  };
  /** @type {import('@babylonjs/core').AbstractMesh[]} */
  const parts = [];
  /**
   * @template {import('@babylonjs/core').Mesh} T
   * @param {T} mesh
   * @param {StandardMaterial} mat
   * @param {TransformNode} parent
   * @param {number[]} [at]
   */
  const add = (mesh, mat, parent, [x, y, z] = [0, 0, 0]) => {
    mesh.material = mat;
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    shadows.addShadowCaster(mesh);
    parts.push(mesh);
    return mesh;
  };

  const arm = new TransformNode('trimmerArm', scene);
  const shaft = add(
    MeshBuilder.CreateCylinder(
      'trimmerShaft',
      { diameter: 0.03, height: 1, tessellation: 12 },
      scene,
    ),
    materials.shaft,
    arm,
  );
  // Lay the cylinder along +z, from the hands (z = 0) to the head (z = 1).
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.5;
  shaft.bakeCurrentTransformIntoVertices();
  add(
    roundedMesh('trimmerMotor', [0.13, 0.15, 0.26], 0.055, scene, 4),
    materials.body,
    arm,
    [0, 0, -0.21],
  );
  add(
    roundedMesh('trimmerMotorCap', [0.11, 0.12, 0.07], 0.04, scene),
    materials.dark,
    arm,
    [0, 0, -0.35],
  );
  const pull = add(
    MeshBuilder.CreateCapsule(
      'trimmerPull',
      { radius: 0.012, height: 0.07, tessellation: 8 },
      scene,
    ),
    materials.rubber,
    arm,
    [0, 0.08, -0.3],
  );
  pull.rotation.z = Math.PI / 2;
  const grip = add(
    MeshBuilder.CreateCapsule(
      'trimmerGrip',
      { radius: 0.027, height: 0.16, tessellation: 12 },
      scene,
    ),
    materials.rubber,
    arm,
    [0, -0.005, -0.03],
  );
  grip.rotation.x = Math.PI / 2;
  add(
    roundedMesh('trimmerTrigger', [0.02, 0.04, 0.05], 0.009, scene),
    materials.trigger,
    arm,
    [0, -0.035, -0.01],
  );
  const handle = add(
    MeshBuilder.CreateTorus(
      'trimmerHandle',
      { diameter: 0.16, thickness: 0.024, tessellation: 24 },
      scene,
    ),
    materials.rubber,
    arm,
    [0, 0.06, 0.3],
  );
  handle.rotation.z = Math.PI / 2;
  add(
    roundedMesh('trimmerClamp', [0.05, 0.05, 0.06], 0.018, scene),
    materials.dark,
    arm,
    [0, 0, 0.3],
  );

  const head = new TransformNode('trimmerHead', scene);
  // The spool: an orange bump with a dark gearbox above it where the shaft comes in.
  add(
    MeshBuilder.CreateCylinder(
      'trimmerSpool',
      { diameter: 0.1, height: 0.04, tessellation: 20 },
      scene,
    ),
    materials.body,
    head,
    [0, 0.065, 0],
  );
  const bump = add(
    MeshBuilder.CreateSphere('trimmerBump', { diameter: 0.1, segments: 12 }, scene),
    materials.body,
    head,
    [0, 0.045, 0],
  );
  bump.scaling.y = 0.5;
  add(
    roundedMesh('trimmerGearbox', [0.07, 0.06, 0.08], 0.025, scene),
    materials.dark,
    head,
    [0, 0.11, -0.01],
  );
  // The guard: half a disc on the side toward you, so clippings don't fly at your legs,
  // with a rolled rim. (A half cylinder is built on its -z side, which is already yours.)
  add(
    MeshBuilder.CreateCylinder(
      'trimmerGuard',
      { diameter: 0.32, height: 0.012, tessellation: 28, arc: 0.5 },
      scene,
    ),
    materials.dark,
    head,
    [0, 0.1, 0],
  );
  const rim = Array.from({ length: 17 }, (_, i) => {
    const angle = Math.PI + (i / 16) * Math.PI; // round the back, toward you
    return new Vector3(Math.cos(angle) * 0.16, 0.1, Math.sin(angle) * 0.16);
  });
  add(
    MeshBuilder.CreateTube(
      'trimmerGuardRim',
      { path: rim, radius: 0.012, tessellation: 8, cap: Mesh.CAP_ALL },
      scene,
    ),
    materials.dark,
    head,
  );

  const lineMaterial = material(COLORS.line);
  lineMaterial.alpha = 0.28;
  lineMaterial.emissiveColor = Color3.FromHexString(COLORS.line).scale(0.4);
  const line = MeshBuilder.CreateDisc(
    'trimmerLine',
    { radius: LINE_RADIUS, tessellation: 32 },
    scene,
  );
  line.material = lineMaterial;
  line.parent = head;
  line.isPickable = false;
  line.rotation.x = Math.PI / 2; // lie flat
  line.position.y = 0.045;

  return { arm, shaft, head, line, parts };
}
