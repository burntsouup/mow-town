import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { roundedBox } from '../math/roundedBox.js';
import { GroundShadePlugin } from './GroundShadePlugin.js';
import { GLOSSY } from './style.js';
import {
  createAsphaltTexture,
  createConcreteTexture,
  createGroundTexture,
  createMulchTexture,
  createShinglesTexture,
} from './surfaceTextures.js';

const TEXTURES = {
  concrete: createConcreteTexture,
  asphalt: createAsphaltTexture,
  mulch: createMulchTexture,
  ground: createGroundTexture,
  shingles: createShinglesTexture,
};
/** @typedef {keyof typeof TEXTURES} SurfaceName */

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
    /** @type {Map<string, GroundShadePlugin>} Each solid color's soft shading (see there). */
    this.groundShades = new Map();
  }

  /**
   * A material painted with one of the surface textures (see surfaceTextures.js), shared by
   * everything that uses it.
   *
   * @param {SurfaceName} surface
   */
  surface(surface) {
    const key = `surface:${surface}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new StandardMaterial(`mat${surface}`, this.scene);
      material.diffuseTexture = TEXTURES[surface](this.scene);
      material.specularColor = Color3.Black();
      this.materials.set(key, material);
    }
    return material;
  }

  /** White, so vertex colors show as they are (see puff). */
  vertexColors() {
    return this.material('#ffffff');
  }

  /**
   * Matte material for a hex color, shared between every mesh that uses the same color.
   * Things built from it get a little darker toward the ground (see GroundShadePlugin).
   *
   * @param {string} hex e.g. '#b8b0a0'
   */
  material(hex) {
    let material = this.materials.get(hex);
    if (!material) {
      material = this.plainMaterial(hex);
      const gloss = GLOSSY[hex];
      if (gloss) {
        // Glass and water: a sharp glint of sun, and the sky reflected (see reflections.js).
        material.specularColor = new Color3(0.9, 0.9, 0.9);
        material.specularPower = 160;
        material.metadata = { gloss };
      }
      this.groundShades.set(hex, new GroundShadePlugin(material));
      this.materials.set(hex, material);
    }
    return material;
  }

  /**
   * A matte material for flat things on the ground (painted lines), which mustn't darken
   * toward the ground: they're on it.
   *
   * @param {string} hex
   */
  flatMaterial(hex) {
    const key = `flat:${hex}`;
    let material = this.materials.get(key);
    if (!material) {
      material = this.plainMaterial(hex);
      this.materials.set(key, material);
    }
    return material;
  }

  /** @param {string} hex */
  plainMaterial(hex) {
    const material = new StandardMaterial(`mat${hex}`, this.scene);
    material.diffuseColor = Color3.FromHexString(hex);
    material.specularColor = Color3.Black(); // no plastic-looking highlight
    return material;
  }

  /**
   * House walls of this color get a little darker just under their eaves, in the roof's
   * shade (see GroundShadePlugin).
   *
   * @param {string} hex
   * @param {number} height Meters: where the eaves are.
   */
  shadeUnderEaves(hex, height) {
    this.material(hex);
    const plugin = this.groundShades.get(hex);
    if (plugin) plugin.eaveHeight = height;
  }

  /**
   * A soft, dark strip on the ground along the foot of a wall (or a hedge): the shade where
   * the ground meets it, which the sun's shadows alone don't give. Dark along the line,
   * fading out to both sides (the half under the wall is hidden).
   *
   * @param {string} name
   * @param {number[]} from [x, z]
   * @param {number[]} to [x, z]
   * @param {number} width Meters across.
   * @param {number} [y] Height of the ground there (a few mm up, above the surface).
   */
  groundShade(name, [x1, z1], [x2, z2], width, y = 0.04) {
    let material = this.materials.get('groundShadeStrip');
    if (!material) {
      const texture = new DynamicTexture(
        'groundShadeStrip',
        { width: 4, height: 64 },
        this.scene,
        false,
      );
      const context = texture.getContext();
      const gradient = context.createLinearGradient(0, 0, 0, 64);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.42)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 4, 64);
      texture.hasAlpha = true;
      texture.update();
      material = new StandardMaterial('groundShadeStripMat', this.scene);
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.opacityTexture = texture;
      material.disableLighting = true;
      this.materials.set('groundShadeStrip', material);
    }
    const length = Math.hypot(x2 - x1, z2 - z1);
    const strip = MeshBuilder.CreateGround(name, { width: length, height: width }, this.scene);
    strip.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    strip.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    strip.material = material;
    strip.isPickable = false;
    return strip;
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
   * A box with soft, rounded edges and corners: the chunky toy look (see math/roundedBox.js).
   *
   * @param {string} name
   * @param {{ size: number[], at: number[], color: string, radius?: number, solid?: boolean,
   *   segments?: number }} options size is [width, height, depth]; radius in meters.
   */
  rounded(
    name,
    {
      size: [width, height, depth],
      at: [x, y, z],
      color,
      radius = 0.05,
      solid = true,
      segments = 3,
    },
  ) {
    const mesh = new Mesh(name, this.scene);
    const shape = roundedBox({ width, height, depth, radius, segments });
    const data = new VertexData();
    data.positions = shape.positions;
    data.normals = shape.normals;
    data.uvs = shape.uvs;
    data.indices = shape.indices;
    data.applyToMesh(mesh);
    mesh.position.set(x, y + height / 2, z);
    return this.addSolid(mesh, color, solid);
  }

  /**
   * A smooth, soft ball (a bush, a clump of leaves, a cloud), shaded darker underneath and
   * lighter on top with vertex colors, so it looks round even in shadow.
   *
   * @param {string} name
   * @param {{ radius: number, at: number[], color: string, squash?: number, solid?: boolean,
   *   shade?: number, shadow?: boolean, smooth?: boolean }} options squash < 1 flattens
   *   it; shade: how much darker the bottom is (0..1); shadow: whether it casts one (tiny
   *   things needn't); smooth: full detail even though it's small (seen up close).
   */
  puff(
    name,
    {
      radius,
      at: [x, y, z],
      color,
      squash = 1,
      solid = true,
      shade = 0.35,
      shadow = true,
      smooth = false,
    },
  ) {
    // Small puffs need far fewer triangles to look round (and there can be a lot of them).
    let subdivisions = radius < 0.1 ? 1 : radius < 0.3 ? 2 : 3;
    if (smooth) subdivisions = 3;
    const mesh = MeshBuilder.CreateIcoSphere(
      name,
      { radius, subdivisions, flat: false },
      this.scene,
    );
    mesh.scaling.y = squash;
    mesh.position.set(x, y + radius * squash, z);
    const base = Color3.FromHexString(color);
    const top = Color3.Lerp(base, new Color3(1, 0.96, 0.78), 0.14);
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind) ?? [];
    const colors = [];
    for (let i = 0; i < normals.length; i += 3) {
      const up = (normals[i + 1] + 1) / 2; // 0 underneath, 1 on top
      const c = Color3.Lerp(base.scale(1 - shade), top, Math.pow(up, 0.8));
      colors.push(c.r, c.g, c.b, 1);
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.material = this.vertexColors();
    this.addSolid(mesh, null, solid);
    if (!shadow) this.shadows.removeShadowCaster(mesh);
    return mesh;
  }

  /**
   * A soft dark smudge on the ground under something, so it sits on the ground instead of
   * floating ("contact shadow"). Cheap: a flat disc with a blurry dot on it.
   *
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @param {number} [y] Height of the ground there (a few mm up, above the surface).
   */
  contactShadow(x, z, radius, y = 0.035) {
    let material = this.materials.get('contactShadow');
    if (!material) {
      const size = 64;
      const texture = new DynamicTexture(
        'contactShadow',
        { width: size, height: size },
        this.scene,
        false,
      );
      const context = texture.getContext();
      const gradient = context.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.3)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
      texture.hasAlpha = true;
      texture.update();
      material = new StandardMaterial('contactShadowMat', this.scene);
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.opacityTexture = texture;
      material.disableLighting = true;
      this.materials.set('contactShadow', material);
    }
    const disc = MeshBuilder.CreateGround(
      'contactShadow',
      { width: radius * 2, height: radius * 2 },
      this.scene,
    );
    disc.position.set(x, y, z);
    disc.material = material;
    disc.isPickable = false;
    return disc;
  }

  /**
   * Four-sided pyramid stretched over a rectangle: a simple hip roof.
   *
   * @param {string} name
   * @param {{ size: number[], at: number[], color: string, shingles?: number[] }} options
   *   shingles: [across, up]: cover it in shingles (tinted `color`), this many tiles of four
   *   rows around the roof and up its slopes.
   */
  pyramid(name, { size: [width, height, depth], at: [x, y, z], color, shingles }) {
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
    if (!shingles) return this.addSolid(mesh, color, true);
    // Scale the texture through the UVs, so every roof can share one shingle texture (a
    // cloned DynamicTexture would come out blank).
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind) ?? [];
    mesh.setVerticesData(
      VertexBuffer.UVKind,
      uvs.map((uv, i) => uv * shingles[i % 2]),
    );
    const key = `shingles:${color}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new StandardMaterial(`roof${color}`, this.scene);
      material.diffuseTexture = this.surface('shingles').diffuseTexture;
      material.diffuseColor = Color3.FromHexString(color);
      material.specularColor = Color3.Black();
      this.materials.set(key, material);
    }
    mesh.material = material;
    return this.addSolid(mesh, null, true);
  }

  /**
   * Flat ground-level surface such as a driveway or sidewalk. Receives shadows, casts none.
   *
   * @param {string} name
   * @param {{ size: number[], at: number[], color?: string, surface?: SurfaceName,
   *   tile?: number }} options size is [width (x), depth (z)] in meters. surface: paint it
   *   with a texture (repeating every `tile` meters, measured from the world's origin so
   *   neighboring surfaces line up) instead of a flat color.
   */
  flat(name, { size: [width, depth], at: [x, y, z], color = '#ffffff', surface, tile = 2 }) {
    const mesh = MeshBuilder.CreateGround(name, { width, height: depth }, this.scene);
    mesh.position.set(x, y, z);
    mesh.receiveShadows = true;
    if (!surface) {
      mesh.material = this.flatMaterial(color);
      return mesh;
    }
    mesh.material = this.surface(surface);
    this.worldUVs(mesh, tile);
    return mesh;
  }

  /**
   * Maps a flat, unrotated mesh's texture to world space: one tile every `tile` meters,
   * measured from the world's origin, so the pattern's size doesn't depend on the mesh's and
   * neighboring surfaces line up.
   *
   * @param {Mesh} mesh
   * @param {number} tile
   */
  worldUVs(mesh, tile) {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind) ?? [];
    const uvs = [];
    for (let i = 0; i < positions.length; i += 3) {
      uvs.push(
        (positions[i] + mesh.position.x) / tile,
        (positions[i + 2] + mesh.position.z) / tile,
      );
    }
    mesh.setVerticesData(VertexBuffer.UVKind, uvs);
  }

  /**
   * Invisible wall that stops the player but not the camera.
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
