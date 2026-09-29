import { Color3, MeshBuilder, StandardMaterial, TransformNode } from '@babylonjs/core';

const COLORS = { body: '#f2c230', shaft: '#3a3d42', dark: '#1f2023', line: '#e8f0e0' };
/** The spinning line's disc is built this big, then scaled to the cutting radius. */
export const LINE_RADIUS = 0.2;

/**
 * Builds a greybox string trimmer in two parts, placed separately each frame:
 * - `arm`: from your hands, pointing down at the head. Local +z runs along the shaft; the
 *   shaft is 1 m long, so scaling `shaft` along z stretches it to reach the head. The motor
 *   sits behind your hands, with a handle partway down.
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
    body: material(COLORS.body),
    shaft: material(COLORS.shaft),
    dark: material(COLORS.dark),
  };
  /** @type {import('@babylonjs/core').AbstractMesh[]} */
  const parts = [];
  /**
   * @param {import('@babylonjs/core').Mesh} mesh
   * @param {StandardMaterial} mat
   * @param {TransformNode} parent
   */
  const add = (mesh, mat, parent) => {
    mesh.material = mat;
    mesh.parent = parent;
    mesh.isPickable = false;
    shadows.addShadowCaster(mesh);
    parts.push(mesh);
    return mesh;
  };

  const arm = new TransformNode('trimmerArm', scene);
  const shaft = add(
    MeshBuilder.CreateCylinder(
      'trimmerShaft',
      { diameter: 0.028, height: 1, tessellation: 8 },
      scene,
    ),
    materials.shaft,
    arm,
  );
  // Lay the cylinder along +z, from the hands (z = 0) to the head (z = 1).
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.5;
  shaft.bakeCurrentTransformIntoVertices();
  const motor = add(
    MeshBuilder.CreateBox('trimmerMotor', { width: 0.12, height: 0.14, depth: 0.24 }, scene),
    materials.body,
    arm,
  );
  motor.position.z = -0.2;
  const grip = add(
    MeshBuilder.CreateBox('trimmerGrip', { width: 0.05, height: 0.05, depth: 0.14 }, scene),
    materials.dark,
    arm,
  );
  grip.position.z = -0.03;
  const handle = add(
    MeshBuilder.CreateTorus(
      'trimmerHandle',
      { diameter: 0.16, thickness: 0.018, tessellation: 16 },
      scene,
    ),
    materials.dark,
    arm,
  );
  handle.position.set(0, 0.06, 0.3);
  handle.rotation.z = Math.PI / 2;

  const head = new TransformNode('trimmerHead', scene);
  const spool = add(
    MeshBuilder.CreateCylinder(
      'trimmerSpool',
      { diameter: 0.1, height: 0.05, tessellation: 16 },
      scene,
    ),
    materials.body,
    head,
  );
  spool.position.y = 0.06;
  // The guard: half a disc on the side toward you, so clippings don't fly at your legs.
  const guard = add(
    MeshBuilder.CreateCylinder(
      'trimmerGuard',
      { diameter: 0.3, height: 0.012, tessellation: 24, arc: 0.5 },
      scene,
    ),
    materials.dark,
    head,
  );
  guard.position.y = 0.1;
  guard.rotation.y = Math.PI / 2; // the half-disc's open side faces away from you

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
