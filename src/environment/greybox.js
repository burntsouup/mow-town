import { Color3, Mesh, MeshBuilder, StandardMaterial } from '@babylonjs/core';

/**
 * A tiny kit for building levels out of placeholder shapes ("greyboxing").
 *
 * Positions use `at: [x, y, z]` = the center of the shape's BASE, so y = 0 sits on the ground.
 * Solid shapes cast shadows and are marked for collisions (used by the player in Milestone 4).
 */
export class Greybox {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('@babylonjs/core').ShadowGenerator} shadows
   */
  constructor(scene, shadows) {
    this.scene = scene;
    this.shadows = shadows;
    /** @type {Map<string, StandardMaterial>} */
    this.materials = new Map();
  }

  /**
   * Matte material for a hex color, shared between every mesh that uses the same color.
   *
   * @param {string} hex e.g. '#b8b0a0'
   */
  material(hex) {
    let material = this.materials.get(hex);
    if (!material) {
      material = new StandardMaterial(`mat${hex}`, this.scene);
      material.diffuseColor = Color3.FromHexString(hex);
      material.specularColor = Color3.Black(); // no plastic-looking highlight
      this.materials.set(hex, material);
    }
    return material;
  }

  /**
   * @param {string} name
   * @param {{ size: number[], at: number[], color: string, solid?: boolean }} options
   *   size is [width (x), height (y), depth (z)] in meters.
   */
  block(name, { size: [width, height, depth], at: [x, y, z], color, solid = true }) {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, this.scene);
    mesh.position.set(x, y + height / 2, z);
    return this.addSolid(mesh, color, solid);
  }

  /**
   * @param {string} name
   * @param {{ diameter: number, height: number, at: number[], color: string }} options
   */
  cylinder(name, { diameter, height, at: [x, y, z], color }) {
    const mesh = MeshBuilder.CreateCylinder(
      name,
      { diameter, height, tessellation: 12 },
      this.scene,
    );
    mesh.position.set(x, y + height / 2, z);
    return this.addSolid(mesh, color, true);
  }

  /**
   * Low-poly faceted ball, e.g. a bush or tree canopy.
   *
   * @param {string} name
   * @param {{ radius: number, at: number[], color: string, squash?: number, solid?: boolean }} options
   *   squash < 1 flattens it vertically.
   */
  blob(name, { radius, at: [x, y, z], color, squash = 1, solid = true }) {
    const mesh = MeshBuilder.CreateIcoSphere(
      name,
      { radius, subdivisions: 2, flat: true },
      this.scene,
    );
    mesh.scaling.y = squash;
    mesh.position.set(x, y + radius * squash, z);
    return this.addSolid(mesh, color, solid);
  }

  /**
   * Four-sided pyramid stretched over a rectangle: a simple hip roof.
   *
   * @param {string} name
   * @param {{ size: number[], at: number[], color: string }} options
   */
  pyramid(name, { size: [width, height, depth], at: [x, y, z], color }) {
    // A 4-sided cylinder with a zero-width top is a pyramid. Its corners start on the axes,
    // so turn it 45° to square it up, THEN stretch it (stretching first would skew it into a
    // diamond). Baking makes each change permanent in the vertex data.
    const mesh = MeshBuilder.CreateCylinder(
      name,
      { diameterTop: 0, diameterBottom: Math.SQRT2, height: 1, tessellation: 4 },
      this.scene,
    );
    mesh.rotation.y = Math.PI / 4;
    mesh.bakeCurrentTransformIntoVertices();
    mesh.scaling.set(width, height, depth);
    mesh.bakeCurrentTransformIntoVertices();
    mesh.convertToFlatShadedMesh(); // crisp faces instead of smooth shading
    mesh.position.set(x, y + height / 2, z);
    return this.addSolid(mesh, color, true);
  }

  /**
   * Flat ground-level surface such as a driveway or sidewalk. Receives shadows, casts none.
   * Uses a ground mesh, whose UVs map cleanly from 0 to 1 across the whole surface.
   *
   * @param {string} name
   * @param {{ size: number[], at: number[], color: string }} options
   *   size is [width (x), depth (z)] in meters.
   */
  flat(name, { size: [width, depth], at: [x, y, z], color }) {
    const mesh = MeshBuilder.CreateGround(name, { width, height: depth }, this.scene);
    mesh.position.set(x, y, z);
    mesh.material = this.material(color);
    mesh.receiveShadows = true;
    return mesh;
  }

  /**
   * Invisible wall that stops the player but not the camera or the spray.
   *
   * @param {string} name
   * @param {{ size: number[], at: number[] }} options
   */
  invisibleWall(name, { size: [width, height, depth], at: [x, y, z] }) {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, this.scene);
    mesh.position.set(x, y + height / 2, z);
    mesh.isVisible = false;
    mesh.isPickable = false;
    mesh.checkCollisions = true;
    return mesh;
  }

  /**
   * Combines same-colored meshes into one, so the GPU draws them in a single call.
   *
   * @param {string} name
   * @param {Mesh[]} meshes Disposed after merging.
   */
  merge(name, meshes) {
    const merged = /** @type {Mesh} */ (Mesh.MergeMeshes(meshes, true, true));
    merged.name = name;
    return this.addSolid(merged, null, true);
  }

  /**
   * @param {Mesh} mesh
   * @param {string | null} color null keeps the mesh's current material.
   * @param {boolean} solid
   */
  addSolid(mesh, color, solid) {
    if (color) mesh.material = this.material(color);
    mesh.receiveShadows = true;
    mesh.checkCollisions = solid;
    this.shadows.addShadowCaster(mesh);
    return mesh;
  }
}
