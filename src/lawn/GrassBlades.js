import {
  BoundingInfo,
  MaterialPluginBase,
  Mesh,
  StandardMaterial,
  Color3,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { config } from '../config.js';
import {
  bindGrassUniforms,
  GRASS_HASH,
  GRASS_SHADING,
  GRASS_WIND,
  grassUniforms,
} from './grassShading.js';

/**
 * Real blades of grass near you. Up close, the layers (shells) the rest of the lawn is drawn
 * with show their steps, like stacked coins; so within a few meters of you, long grass is
 * drawn as actual blades instead: thin, tapered ribbons, each turned its own way, that bend
 * with the wind, with smooth edges. Further out they thin away as the shells take over (see
 * grassNear in GrassMaterialPlugin), so you can't see where one stops and the other starts.
 * Mowed grass is short enough that the layers look fine up close, so as you mow, the blades
 * are cut away to stubble.
 *
 * The blades are one fixed patch, a grid of cells round you: the vertex shader works out
 * where each blade stands in the world (the patch moves with you a whole cell at a time, so
 * blades never slide about), reads the lawn's grass map there (how tall it is, which way it
 * was mowed, whether there's lawn at all) and builds the blade. Blades off the lawn, or
 * outside the circle, shrink to nothing.
 */
export class GrassBlades {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('@babylonjs/core').BaseTexture} grassMap
   * @param {import('@babylonjs/core').BaseTexture} variety
   * @param {Parameters<typeof bindGrassUniforms>[1]} state The lawn's (see GrassField).
   * @param {{ center: number[], width: number, depth: number }} area
   */
  constructor(scene, grassMap, variety, state, area) {
    this.state = state;
    this.area = area;
    this.mesh = bladeMesh(scene).clone('grassBlades');
    const material = new StandardMaterial('grassBladesMat', scene);
    material.diffuseColor = Color3.White(); // the plugin supplies the grass colors
    material.specularColor = Color3.Black();
    material.backFaceCulling = false; // blades are seen from both sides
    this.plugin = new GrassBladesPlugin(material, grassMap, variety, state, area);
    this.mesh.material = material;
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = true;
    // The shader moves every blade, so never skip drawing because of where the mesh "is".
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.setBoundingInfo(
      new BoundingInfo(new Vector3(-1000, -1, -1000), new Vector3(1000, 1, 1000)),
    );
    this.mesh.setEnabled(false);
  }

  /**
   * Centers the blades on a spot near you, and switches them off when it's nowhere near
   * this lawn (or there's no spot: no blades at all).
   *
   * @param {{ x: number, z: number } | null} spot World meters.
   */
  follow(spot) {
    const { radius, spacing } = config.grass.blades;
    const { center, width, depth } = this.area;
    const { x, z } = spot ?? { x: Infinity, z: Infinity };
    const near =
      Math.abs(x - center[0]) < width / 2 + radius && Math.abs(z - center[1]) < depth / 2 + radius;
    this.mesh.setEnabled(near);
    // Lawn-local meters (the shells' coordinates) for the hand-off between the two.
    const local = { x: x - center[0] + width / 2, z: z - center[1] + depth / 2 };
    this.state.near = near ? { x: local.x, z: local.z, radius } : { x: 0, z: 0, radius: 0 };
    if (!near) return;
    // The patch's corner, in whole cells, so the blades stay put as it follows you.
    this.plugin.origin = {
      x: Math.floor((local.x - radius) / spacing),
      z: Math.floor((local.z - radius) / spacing),
    };
  }
}

/** @type {WeakMap<import('@babylonjs/core').Scene, Mesh>} */
const bladeMeshes = new WeakMap();

/**
 * The patch of blades: one blade per cell of a square grid, as a single mesh (its copies,
 * one per lawn, share it). Each blade is five points: a pair at the root, a pair partway up,
 * and the tip. position.x is across the blade (-0.5..0.5, narrowing toward the tip),
 * position.y is how far up (0..1); bladeCell says which cell of the patch it's in.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
function bladeMesh(scene) {
  let mesh = bladeMeshes.get(scene);
  if (mesh) return mesh;
  const { radius, spacing } = config.grass.blades;
  const cells = Math.ceil((radius * 2) / spacing);
  const shape = [
    [-0.5, 0],
    [0.5, 0],
    [-0.36, 0.45],
    [0.36, 0.45],
    [0, 1],
  ];
  const count = cells * cells;
  const positions = new Float32Array(count * shape.length * 3);
  const normals = new Float32Array(count * shape.length * 3);
  const bladeCells = new Float32Array(count * shape.length * 2);
  const indices = new Uint32Array(count * 9);
  let v = 0;
  let t = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const first = v;
      for (const [x, y] of shape) {
        positions.set([x, y, 0], v * 3);
        normals.set([0, 1, 0], v * 3); // lit like the ground, so it matches the layers
        bladeCells.set([i, j], v * 2);
        v++;
      }
      indices.set(
        [
          first,
          first + 2,
          first + 1,
          first + 1,
          first + 2,
          first + 3,
          first + 2,
          first + 4,
          first + 3,
        ],
        t,
      );
      t += 9;
    }
  }
  mesh = new Mesh('grassBladePatch', scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.setVerticesData('bladeCell', bladeCells, false, 2);
  mesh.setEnabled(false); // only its copies are drawn
  bladeMeshes.set(scene, mesh);
  return mesh;
}

/**
 * Builds each blade in the vertex shader (see GrassBlades) and colors it like the layers
 * do (grassShading.js).
 */
class GrassBladesPlugin extends MaterialPluginBase {
  /**
   * @param {import('@babylonjs/core').Material} material
   * @param {import('@babylonjs/core').BaseTexture} grassMap
   * @param {import('@babylonjs/core').BaseTexture} variety
   * @param {Parameters<typeof bindGrassUniforms>[1]} state
   * @param {{ width: number, depth: number, center: number[] }} area
   */
  constructor(material, grassMap, variety, state, area) {
    super(material, 'GrassBlades', 200, { GRASSBLADES: false });
    this.grassMap = grassMap;
    this.variety = variety;
    this.state = state;
    this.area = area;
    this.origin = { x: 0, z: 0 }; // the patch's corner, in cells (lawn-local)
    this.registerForExtraEvents = true;
    this._enable(true);
  }

  getClassName() {
    return 'GrassBladesPlugin';
  }

  /** @param {import('@babylonjs/core').MaterialDefines} defines */
  prepareDefinesBeforeAttributes(defines) {
    defines.GRASSBLADES = true;
  }

  /** @param {string[]} attributes */
  getAttributes(attributes) {
    attributes.push('bladeCell');
  }

  isReadyForSubMesh() {
    return this.grassMap.isReady() && this.variety.isReady();
  }

  /** @param {string[]} samplers */
  getSamplers(samplers) {
    samplers.push('grassMap', 'grassVariety');
  }

  getUniforms() {
    return grassUniforms([
      { name: 'bladeOrigin', size: 2, type: 'vec2' },
      { name: 'bladeLawnCorner', size: 2, type: 'vec2' },
      { name: 'bladeSpacing', size: 1, type: 'float' },
      { name: 'bladeWidth', size: 1, type: 'float' },
      { name: 'bladeMaxHeight', size: 1, type: 'float' },
    ]);
  }

  /** @param {import('@babylonjs/core').UniformBuffer} uniformBuffer */
  bindForSubMesh(uniformBuffer) {
    uniformBuffer.setTexture('grassMap', this.grassMap);
    uniformBuffer.setTexture('grassVariety', this.variety);
  }

  /** @param {import('@babylonjs/core').UniformBuffer} uniformBuffer */
  hardBindForSubMesh(uniformBuffer) {
    const { blades, maxHeight } = config.grass;
    const { center, width, depth } = this.area;
    uniformBuffer.updateFloat2('bladeOrigin', this.origin.x, this.origin.z);
    uniformBuffer.updateFloat2('bladeLawnCorner', center[0] - width / 2, center[1] - depth / 2);
    uniformBuffer.updateFloat('bladeSpacing', blades.spacing);
    uniformBuffer.updateFloat('bladeWidth', blades.width);
    uniformBuffer.updateFloat('bladeMaxHeight', maxHeight);
    bindGrassUniforms(uniformBuffer, this.state);
  }

  /** @param {import('@babylonjs/core').BaseTexture[]} activeTextures */
  getActiveTextures(activeTextures) {
    activeTextures.push(this.grassMap, this.variety);
  }

  /** @param {import('@babylonjs/core').BaseTexture} texture */
  hasTexture(texture) {
    return texture === this.grassMap || texture === this.variety;
  }

  /** @param {string} shaderType */
  getCustomCode(shaderType) {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
          attribute vec2 bladeCell;
          uniform sampler2D grassMap;
          varying float vBladeAlong;
          varying vec4 vBladeData;
          varying vec2 vBladeMeters;
          varying vec2 vBladeRandom;
          varying float vBladeWind;
          ${GRASS_HASH}
          ${GRASS_WIND}`,
        CUSTOM_VERTEX_UPDATE_POSITION: `
          #ifdef GRASSBLADES
            // Which cell of the lawn this blade grows in (lawn-local, whole cells), and where.
            vec2 bladeWorldCell = bladeOrigin + bladeCell;
            vec2 bladeJitter = vec2(grassHash(bladeWorldCell + 17.0), grassHash(bladeWorldCell + 43.0)) - 0.5;
            vec2 bladeMeters = (bladeWorldCell + 0.5 + 0.8 * bladeJitter) * bladeSpacing;
            vec2 bladeUV = bladeMeters / grassLawnSize;
            vec4 bladeData = texture2D(grassMap, bladeUV);
            float grassHeight = bladeData.r;
            // Off the lawn, outside the circle, where the layers take over, or mowed (short
            // grass stays layers: see GrassMaterialPlugin): no blade.
            float bladeFade = smoothstep(grassNear.z * 0.55, grassNear.z, distance(bladeMeters, grassNear.xy));
            float bladeShown = step(0.25, bladeData.a)
              * step(0.0, min(bladeUV.x, bladeUV.y)) * step(max(bladeUV.x, bladeUV.y), 1.0)
              * step(bladeFade, grassHash(bladeWorldCell + 61.0))
              * step(grassUncutAbove, grassHeight);
            float bladeRandomA = grassHash(bladeWorldCell);
            float bladeClump = grassHash(floor(bladeWorldCell / 2.0) + 101.0);
            float bladeHeight = grassHeight * (0.5 + 0.25 * bladeRandomA + 0.25 * bladeClump)
              * bladeMaxHeight * bladeShown;
            float along = position.y;
            // Each blade turned its own way, and a little thicker in lush patches.
            float bladeTurn = grassHash(bladeWorldCell + 29.0) * 6.2832;
            vec2 bladeAcross = vec2(cos(bladeTurn), sin(bladeTurn));
            float bladeThick = clamp(bladeData.a * 2.0 - 1.0, 0.0, 1.0);
            float bladeWide = bladeWidth * (1.0 + 0.4 * bladeThick) * bladeShown;
            // Leaning: long blades flop their own way and sway in the wind; mowed ones lean
            // the way the mower went (as the layers do; their units are cells, hence the
            // division).
            float bladeWind = grassHeight > 0.4 ? grassWindWave(bladeMeters) : 0.0;
            vec2 windLean = vec2(0.85, 0.53) * (0.4 + 0.6 * bladeWind) * grassWind.x * grassHeight;
            vec2 mowDirection = bladeData.gb * 2.0 - 1.0;
            vec2 bladeLean = ((bladeJitter.yx * grassHeight + windLean) * along * along
              + mowDirection * grassMowLean * along) / grassBladesPerMeter;
            vec2 bladeXZ = bladeLawnCorner + bladeMeters + bladeAcross * position.x * bladeWide
              + bladeLean;
            positionUpdated = vec3(bladeXZ.x, 0.004 + along * bladeHeight, bladeXZ.y);
            vBladeAlong = along;
            vBladeData = bladeData;
            vBladeMeters = bladeMeters;
            vBladeRandom = vec2(bladeRandomA, grassHash(bladeWorldCell + 5.0));
            vBladeWind = bladeWind;
          #endif`,
      };
    }
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform sampler2D grassVariety;
        varying float vBladeAlong;
        varying vec4 vBladeData;
        varying vec2 vBladeMeters;
        varying vec2 vBladeRandom;
        varying float vBladeWind;
        ${GRASS_SHADING}`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        #ifdef GRASSBLADES
          vec4 grassVary = texture2D(grassVariety, vBladeMeters / grassVarietySize);
          float grassThick = clamp(vBladeData.a * 2.0 - 1.0, 0.0, 1.0);
          vec3 grassTip;
          // Seen from the side, a blade shows more of its dark lower part than the layers do
          // from above, so its gradient starts a little lighter, to match them.
          diffuseColor = grassBladeColor(vBladeData.r, grassThick, grassVary,
            0.4 + 0.6 * vBladeAlong, vBladeRandom.x, vBladeRandom.y, grassTip);
          diffuseColor *= 1.0 + 0.1 * vBladeWind * smoothstep(0.3, 0.6, vBladeData.r);
          diffuseColor += grassBacklitGlow(grassTip, viewDirectionW) * vBladeAlong;
          diffuseColor *= grassStripeShade(vBladeData.gb * 2.0 - 1.0, viewDirectionW);
        #endif`,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifdef GRASSBLADES
          float grassUncut = step(grassUncutAbove, vBladeData.r);
          color.rgb = mix(color.rgb, grassHighlightColor, grassHighlight * grassUncut);
        #endif`,
    };
  }
}
