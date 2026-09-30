import { Color3, Mesh, StandardMaterial, VertexData } from '@babylonjs/core';
import { roundedBox } from '../math/roundedBox.js';

/**
 * Small helpers for building "toy" props in code (the mower, the trimmer, the sale table,
 * Tuft's clothes): soft-edged boxes and shiny plastic.
 */

/**
 * A box with rounded edges and corners (see math/roundedBox.js), centered on its middle.
 *
 * @param {string} name
 * @param {number[]} size [width, height, depth] in meters.
 * @param {number} radius How round the edges are, in meters.
 * @param {import('@babylonjs/core').Scene} scene
 * @param {number} [segments] Steps round each edge (more = smoother).
 */
export function roundedMesh(name, [width, height, depth], radius, scene, segments = 3) {
  const shape = roundedBox({ width, height, depth, radius, segments });
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = shape.positions;
  data.normals = shape.normals;
  data.uvs = shape.uvs;
  data.indices = shape.indices;
  data.applyToMesh(mesh);
  return mesh;
}

/**
 * A material with a soft highlight, like painted metal or toy plastic.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} hex
 * @param {{ shine?: number, power?: number }} [finish] shine: how bright the highlight is
 *   (0..1); power: how small and sharp it is.
 */
export function plastic(scene, hex, { shine = 0.35, power = 48 } = {}) {
  const material = new StandardMaterial(`plastic${hex}`, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.specularColor = new Color3(shine, shine, shine);
  material.specularPower = power;
  return material;
}
