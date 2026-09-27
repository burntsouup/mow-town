import { Color3, MeshBuilder, StandardMaterial, TransformNode } from '@babylonjs/core';

/** @typedef {import('@babylonjs/core').Mesh} Mesh */

/**
 * Placeholder 3D models for the pressure washer, built from simple shapes.
 * Local +z is "forward" for everything here (the way the gun points).
 */

/** Distance from the gun's grip to the tip of the nozzle, in meters. */
export const WAND_TIP_OFFSET = 0.9;

/**
 * The machine itself (pump + engine on wheels). It stays put; you carry the spray gun.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').ShadowGenerator} shadows
 * @param {{ position: number[], yaw: number }} spot
 */
export function createWasherUnit(scene, shadows, spot) {
  const root = new TransformNode('washerUnit', scene);
  root.position.set(spot.position[0], spot.position[1], spot.position[2]);
  root.rotation.y = spot.yaw;

  const bodyMaterial = matte('washerBodyMat', '#f2b705', scene);
  const darkMaterial = matte('washerDarkMat', '#2b2d31', scene);

  /** @type {Mesh[]} */
  const parts = [];
  /** @param {Mesh} mesh @param {number[]} at @param {StandardMaterial} material */
  const add = (mesh, at, material) => {
    mesh.parent = root;
    mesh.position.set(at[0], at[1], at[2]);
    mesh.material = material;
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh);
    parts.push(mesh);
    return mesh;
  };

  const body = add(
    MeshBuilder.CreateBox('washerBody', { width: 0.5, height: 0.42, depth: 0.7 }, scene),
    [0, 0.33, 0],
    bodyMaterial,
  );
  body.checkCollisions = true; // the player bumps into it
  add(
    MeshBuilder.CreateBox('washerEngine', { width: 0.34, height: 0.2, depth: 0.32 }, scene),
    [0, 0.64, 0.1],
    darkMaterial,
  );
  for (const x of [-0.28, 0.28]) {
    const wheel = add(
      MeshBuilder.CreateCylinder('washerWheel', { diameter: 0.26, height: 0.06 }, scene),
      [x, 0.13, -0.22],
      darkMaterial,
    );
    wheel.rotation.z = Math.PI / 2;
  }
  for (const x of [-0.2, 0.2]) {
    add(
      MeshBuilder.CreateBox('washerHandleBar', { width: 0.04, height: 0.5, depth: 0.04 }, scene),
      [x, 0.75, -0.33],
      darkMaterial,
    );
  }
  add(
    MeshBuilder.CreateBox('washerHandle', { width: 0.44, height: 0.04, depth: 0.04 }, scene),
    [0, 1.0, -0.33],
    darkMaterial,
  );

  // The spray gun, resting across the top until the player picks it up.
  const restingWand = createWand(scene, 'restingWand');
  restingWand.root.parent = root;
  restingWand.root.position.set(0.05, 0.8, -0.2);
  restingWand.root.rotation.set(0, 0.25, 0);

  return { root, body, bodyMaterial, restingWand };
}

/**
 * The spray gun: a pistol grip, a trigger housing, a long metal lance, and a nozzle tip.
 * Its origin is the grip, pointing along +z.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} name
 */
export function createWand(scene, name) {
  const root = new TransformNode(name, scene);
  const dark = matte(`${name}DarkMat`, '#2b2d31', scene);
  const metal = matte(`${name}MetalMat`, '#9aa1a8', scene);
  const tipColor = matte(`${name}TipMat`, '#f2b705', scene);

  /** @param {Mesh} mesh @param {number[]} at @param {StandardMaterial} material */
  const add = (mesh, at, material) => {
    mesh.parent = root;
    mesh.position.set(at[0], at[1], at[2]);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  };

  add(
    MeshBuilder.CreateBox(`${name}Grip`, { width: 0.04, height: 0.13, depth: 0.05 }, scene),
    [0, -0.06, 0],
    dark,
  );
  add(
    MeshBuilder.CreateBox(`${name}Body`, { width: 0.06, height: 0.06, depth: 0.22 }, scene),
    [0, 0, 0.06],
    dark,
  );
  const lance = add(
    MeshBuilder.CreateCylinder(
      `${name}Lance`,
      { diameter: 0.022, height: 0.7, tessellation: 8 },
      scene,
    ),
    [0, 0, 0.52],
    metal,
  );
  lance.rotation.x = Math.PI / 2;
  const tip = add(
    MeshBuilder.CreateCylinder(
      `${name}Tip`,
      { diameter: 0.035, height: 0.06, tessellation: 8 },
      scene,
    ),
    [0, 0, WAND_TIP_OFFSET - 0.03],
    tipColor,
  );
  tip.rotation.x = Math.PI / 2;

  return { root, meshes: root.getChildMeshes() };
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
