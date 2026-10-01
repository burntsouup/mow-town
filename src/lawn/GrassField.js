import {
  Constants,
  Mesh,
  RawTexture,
  StandardMaterial,
  Color3,
  Texture,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { config } from '../config.js';
import { GrassBlades } from './GrassBlades.js';
import { GrassMaterialPlugin } from './GrassMaterialPlugin.js';
import { grassVariationData } from './grassNoise.js';

/** The bottom shell floats this far above the ground so the two don't flicker. */
const BASE_HEIGHT = 0.004;

/**
 * Draws a GrassGrid as a lawn: a stack of shells (see GrassMaterialPlugin) and a texture of
 * grass heights that's kept in sync with the grid.
 */
export class GrassField {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('./GrassGrid.js').GrassGrid} grid
   * @param {{ center: number[], width: number, depth: number }} area Where the lawn is, in
   *   meters: `center` is [x, z]; `width` runs along x and `depth` along z.
   */
  constructor(scene, grid, area) {
    this.grid = grid;
    this.area = area;
    this.engine = scene.getEngine();
    this.uploadBuffer = new Uint8Array(grid.columns * grid.rows * 4);

    this.texture = new RawTexture(
      this.uploadBuffer,
      grid.columns,
      grid.rows,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true, // mipmaps: smaller copies that keep distant grass from shimmering
      false, // row 0 of the data is v = 0, same as the grid
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    this.texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.texture.wrapV = Texture.CLAMP_ADDRESSMODE;

    const material = new StandardMaterial('grassMat', scene);
    material.diffuseColor = Color3.White(); // the plugin supplies the grass colors
    material.specularColor = Color3.Black();
    /**
     * What the layers and the real blades near you share (see grassShading.js): the time
     * (for the wind), the sun, the "show what's left" highlight, and where the blades are.
     */
    this.state = {
      size: { width: area.width, depth: area.depth },
      time: 0,
      sunDirection: new Vector3(...config.render.sun.direction).normalize(),
      highlight: 0,
      uncutAbove: 1, // grass taller than this (0..1) still counts as uncut
      near: { x: 0, z: 0, radius: 0 },
    };
    const variety = varietyTexture(scene);
    this.plugin = new GrassMaterialPlugin(material, this.texture, variety, this.state);
    this.blades = new GrassBlades(scene, this.texture, variety, this.state, area);

    this.mesh = new Mesh('grass', scene);
    this.mesh.material = material;
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = true;
    this.mesh.position.set(area.center[0], BASE_HEIGHT, area.center[1]);
    this.buildShells(config.grass.shellCount);
    this.upload();
  }

  /**
   * (Re)builds the stack of shells: `count` copies of a flat rectangle, from local y = 0 (the
   * ground) to y = 1 (the tallest grass). The mesh is then scaled up to real meters.
   *
   * @param {number} count
   */
  buildShells(count) {
    const { width, depth } = this.area;
    /** @type {number[]} */
    const positions = [];
    /** @type {number[]} */
    const indices = [];
    /** @type {number[]} */
    const uvs = [];
    // Top shells first: the GPU can skip hidden pixels underneath more often.
    for (let shell = count - 1; shell >= 0; shell--) {
      const y = count > 1 ? shell / (count - 1) : 0;
      const first = positions.length / 3;
      positions.push(-width / 2, y, -depth / 2, width / 2, y, -depth / 2);
      positions.push(width / 2, y, depth / 2, -width / 2, y, depth / 2);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      // Clockwise seen from above (Babylon's front side), so the shells face up.
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    const normals = positions.map((_, i) => (i % 3 === 1 ? 1 : 0));
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.uvs = uvs;
    data.normals = normals;
    data.applyToMesh(this.mesh, true);
    this.shellCount = count;
  }

  /**
   * Call once per frame: follows the tuning panel, moves the wind on, and sends changed grass
   * to the GPU.
   *
   * @param {number} dt Seconds since the previous frame.
   */
  update(dt) {
    const settings = config.grass;
    this.state.time += dt;
    if (settings.shellCount !== this.shellCount) this.buildShells(settings.shellCount);
    this.mesh.scaling.y = settings.maxHeight;
    this.upload();
  }

  /** Copies the part of the grid that changed since last time to the texture. */
  upload() {
    const rect = this.grid.takeChangedRect();
    const internal = this.texture.getInternalTexture();
    if (!rect || !internal) return;
    const width = rect.maxX - rect.minX + 1;
    const height = rect.maxY - rect.minY + 1;
    const data = this.uploadBuffer.subarray(0, width * height * 4);
    this.grid.writeTexels(data, rect);
    const generateMipMaps = true; // keep the smaller copies in sync with the change
    this.engine.updateTextureData(
      internal,
      data,
      rect.minX,
      rect.minY,
      width,
      height,
      0,
      0,
      generateMipMaps,
    );
  }

  /**
   * Converts a world position to lawn-local meters (see GrassGrid).
   *
   * @param {number} x
   * @param {number} z
   */
  toLocal(x, z) {
    const { center, width, depth } = this.area;
    return { x: x - center[0] + width / 2, z: z - center[1] + depth / 2 };
  }

  /**
   * Converts lawn-local meters back to a world position.
   *
   * @param {number} x
   * @param {number} z
   */
  toWorld(x, z) {
    const { center, width, depth } = this.area;
    return { x: x + center[0] - width / 2, z: z + center[1] - depth / 2 };
  }
}

/** @type {WeakMap<import('@babylonjs/core').Scene, RawTexture>} */
const varietyTextures = new WeakMap();

/**
 * The lawns' shared variety texture (see grassNoise.js), made once per scene.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
function varietyTexture(scene) {
  let texture = varietyTextures.get(scene);
  if (!texture) {
    const size = 128;
    texture = new RawTexture(
      grassVariationData(size, 7),
      size,
      size,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    varietyTextures.set(scene, texture);
  }
  return texture;
}
