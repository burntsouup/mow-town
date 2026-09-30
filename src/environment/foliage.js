import {
  Color3,
  DynamicTexture,
  MaterialPluginBase,
  Mesh,
  StandardMaterial,
  VertexData,
} from '@babylonjs/core';
import { createRandom } from '../math/noise.js';
import { flowerHeads, leafCards } from './foliageMath.js';
import { GroundShadePlugin } from './GroundShadePlugin.js';

/**
 * Leafy plants: a plant's rough shape (a few balls) covered in little clusters of leaves (see
 * foliageMath.js), swaying gently in the breeze. They cast leafy, dappled shadows.
 */

/**
 * One mesh of leaves over one or more plants (each shades as its own fluffy ball).
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} name
 * @param {import('./foliageMath.js').Blob[][]} plants Each plant's shape.
 * @param {{ color: string, density: number, size: number, seed: number, leaves?: number,
 *   softness?: number, shade?: number }} options color: the leaves' (hex); see leafCards
 *   for the rest.
 */
export function leafyMesh(scene, name, plants, options) {
  const random = createRandom(options.seed);
  const data = new VertexData();
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {number[]} */
  const colors = [];
  /** @type {number[]} */
  const indices = [];
  for (const blobs of plants) {
    const cards = leafCards(blobs, { ...options, random });
    const offset = positions.length / 3;
    positions.push(...cards.positions);
    normals.push(...cards.normals);
    colors.push(...cards.colors);
    for (const index of cards.indices) indices.push(index + offset);
  }
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  return finish(new Mesh(name, scene), data, leafMaterial(scene, options.color));
}

/**
 * Little flowers (see flowerHeads): one mesh for a whole bed.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} name
 * @param {Parameters<typeof flowerHeads>[0]} flowers
 */
export function flowerMesh(scene, name, flowers) {
  const heads = flowerHeads(flowers);
  const data = new VertexData();
  data.positions = heads.positions;
  data.normals = heads.normals;
  data.colors = heads.colors;
  data.indices = heads.indices;
  let material = scene.getMaterialByName('flowerHeads');
  if (!material) {
    const petals = new StandardMaterial('flowerHeads', scene);
    petals.diffuseColor = Color3.White(); // the colors are in the flowers' vertex colors
    petals.specularColor = new Color3(0.1, 0.1, 0.1);
    petals.backFaceCulling = false;
    material = petals;
  }
  return finish(new Mesh(name, scene), data, material);
}

/**
 * @param {Mesh} mesh
 * @param {VertexData} data
 * @param {import('@babylonjs/core').Material} material
 */
function finish(mesh, data, material) {
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

/** @type {WeakMap<import('@babylonjs/core').Scene, Map<string, StandardMaterial>>} */
const materials = new WeakMap();
/** @type {WeakMap<import('@babylonjs/core').Scene, { time: number }>} */
const clocks = new WeakMap();

/**
 * The leaves' material, one per color (each leaf's shading is in its vertex colors), seen
 * from both sides.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} hex
 */
function leafMaterial(scene, hex) {
  let byColor = materials.get(scene);
  if (!byColor) {
    byColor = new Map();
    materials.set(scene, byColor);
    const clock = { time: 0 };
    clocks.set(scene, clock);
    scene.onBeforeRenderObservable.add(() => {
      clock.time += scene.getEngine().getDeltaTime() / 1000;
    });
  }
  let material = byColor.get(hex);
  if (!material) {
    material = new StandardMaterial(`leaves${hex}`, scene);
    material.diffuseColor = Color3.FromHexString(hex);
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    new FoliageSwayPlugin(material, /** @type {{ time: number }} */ (clocks.get(scene)));
    byColor.set(hex, material);
  }
  return material;
}

/**
 * Leaves sway a little in the breeze: each card's corners move a couple of centimeters, in
 * waves that roll through the plant.
 */
class FoliageSwayPlugin extends MaterialPluginBase {
  /**
   * @param {import('@babylonjs/core').Material} material
   * @param {{ time: number }} clock
   */
  constructor(material, clock) {
    super(material, 'FoliageSway', 200, { FOLIAGESWAY: false });
    this.clock = clock;
    this.registerForExtraEvents = true;
    this._enable(true);
  }

  getClassName() {
    return 'FoliageSwayPlugin';
  }

  /** @param {import('@babylonjs/core').MaterialDefines} defines */
  prepareDefines(defines) {
    defines.FOLIAGESWAY = true;
  }

  getUniforms() {
    return {
      ubo: [{ name: 'foliageTime', size: 1, type: 'float' }],
      vertex: 'uniform float foliageTime;',
    };
  }

  /** @param {import('@babylonjs/core').UniformBuffer} uniformBuffer */
  hardBindForSubMesh(uniformBuffer) {
    uniformBuffer.updateFloat('foliageTime', this.clock.time);
  }

  /** @param {string} shaderType */
  getCustomCode(shaderType) {
    if (shaderType !== 'vertex') return null;
    return {
      CUSTOM_VERTEX_UPDATE_POSITION: `
        #ifdef FOLIAGESWAY
          // (Leaf meshes are built where they stand, so their own positions are the world's.)
          vec3 swayAt = positionUpdated;
          positionUpdated += vec3(
            sin(foliageTime * 1.3 + swayAt.x * 0.7 + swayAt.y * 1.1),
            0.4 * sin(foliageTime * 1.7 + swayAt.z * 0.9),
            cos(foliageTime * 1.1 + swayAt.z * 0.8 + swayAt.y * 0.9)) * 0.02;
        #endif`,
    };
  }
}

/** @type {WeakMap<import('@babylonjs/core').Scene, StandardMaterial>} */
const barks = new WeakMap();

/**
 * Tree bark: brown, with darker furrows running up the trunk and lighter ridges between
 * them, painted in code (seeded).
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} hex The bark's middle color.
 */
export function barkMaterial(scene, hex) {
  let material = barks.get(scene);
  if (material) return material;
  const size = 128;
  const texture = new DynamicTexture('bark', { width: size, height: size }, scene, true);
  const context = /** @type {CanvasRenderingContext2D} */ (
    /** @type {unknown} */ (texture.getContext())
  );
  const base = Color3.FromHexString(hex);
  /** @param {number} k */
  const shade = (k) =>
    `rgb(${Math.round(base.r * 255 * k)}, ${Math.round(base.g * 255 * k)}, ${Math.round(base.b * 255 * k)})`;
  context.fillStyle = shade(1);
  context.fillRect(0, 0, size, size);
  const random = createRandom(53);
  for (let i = 0; i < 60; i++) {
    // Furrows and ridges: wavy strokes up the trunk (they wrap round, so the texture tiles).
    const dark = i % 3 !== 0;
    context.strokeStyle = shade(dark ? 0.6 + random() * 0.15 : 1.15 + random() * 0.15);
    context.lineWidth = dark ? 2 + random() * 3 : 1 + random() * 2;
    const x = random() * size;
    context.beginPath();
    for (let y = -8; y <= size + 8; y += 8) {
      const wobble = Math.sin((y / size) * Math.PI * 2 * 2 + i) * 3;
      if (y === -8) context.moveTo(x + wobble, y);
      else context.lineTo(x + wobble + (random() - 0.5) * 2, y);
    }
    context.stroke();
  }
  texture.update();
  texture.uScale = 2;
  texture.vScale = 1.5;
  material = new StandardMaterial('bark', scene);
  material.diffuseTexture = texture;
  material.specularColor = Color3.Black();
  new GroundShadePlugin(material); // darker toward the roots
  barks.set(scene, material);
  return material;
}
