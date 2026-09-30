import { MaterialPluginBase } from '@babylonjs/core';
import { config } from '../config.js';
import {
  bindGrassUniforms,
  GRASS_HASH,
  GRASS_SHADING,
  GRASS_WIND,
  grassUniforms,
} from './grassShading.js';

/**
 * Draws grass with "shell texturing": the lawn is a stack of flat, see-through layers
 * (shells), and each blade of grass is a column of dots through them. At every pixel of
 * every shell, the shader asks "is there a blade here, at this height?" and throws the pixel
 * away if not. Blades get thinner toward the tip, so the stack reads as pointy grass.
 *
 * The grass map texture says how tall the grass is at each spot (red), which way the mower
 * was heading when it cut it (green and blue), and where the lawn is at all (alpha), so
 * cutting the grass is just writing new numbers into it. Alpha also says how thick the
 * grass is: thick patches have chunkier, darker blades.
 *
 * Stripes: mowing bends the blades the way the mower was heading. Grass bent away from you
 * shows the shiny sides of its blades and looks lighter; bent toward you, you look into the
 * shaded tips and it looks darker. So rows mowed in opposite directions look like stripes,
 * and they swap light and dark when you walk around to the other side.
 *
 * It's a plugin for Babylon's standard material, so the grass keeps normal lighting,
 * shadows and fog.
 */
export class GrassMaterialPlugin extends MaterialPluginBase {
  /**
   * @param {import('@babylonjs/core').Material} material
   * @param {import('@babylonjs/core').BaseTexture} grassMap
   * @param {import('@babylonjs/core').BaseTexture} variety Tiling noise (see grassNoise.js):
   *   patches of different grass.
   * @param {Parameters<typeof bindGrassUniforms>[1]} state The lawn's (see GrassField),
   *   shared with its real blades.
   */
  constructor(material, grassMap, variety, state) {
    super(material, 'GrassShells', 200, { GRASSFIELD: false });
    this.grassMap = grassMap;
    this.variety = variety;
    this.state = state;
    // Opt in to hardBindForSubMesh (below), which Babylon only calls for plugins that ask.
    // Must be set before the plugin is enabled.
    this.registerForExtraEvents = true;
    this._enable(true);
  }

  getClassName() {
    return 'GrassMaterialPlugin';
  }

  /** @param {import('@babylonjs/core').MaterialDefines} defines */
  prepareDefinesBeforeAttributes(defines) {
    defines.GRASSFIELD = true;
    // Ask Babylon to pass the mesh's UV coordinates to the fragment shader as vMainUV1,
    // even though the material has no ordinary textures that would need them.
    defines._needUVs = true;
    defines.MAINUV1 = true;
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
      { name: 'grassBlades', size: 2, type: 'vec2' },
      { name: 'grassThickness', size: 1, type: 'float' },
      { name: 'grassShellStep', size: 1, type: 'float' },
    ]);
  }

  /** @param {import('@babylonjs/core').UniformBuffer} uniformBuffer */
  bindForSubMesh(uniformBuffer) {
    uniformBuffer.setTexture('grassMap', this.grassMap);
    uniformBuffer.setTexture('grassVariety', this.variety);
  }

  /**
   * Like bindForSubMesh, but Babylon calls this every frame, so live-tunable values go here.
   *
   * @param {import('@babylonjs/core').UniformBuffer} uniformBuffer
   */
  hardBindForSubMesh(uniformBuffer) {
    const settings = config.grass;
    const blades = settings.bladesPerMeter;
    const { size } = this.state;
    uniformBuffer.updateFloat2('grassBlades', size.width * blades, size.depth * blades);
    uniformBuffer.updateFloat('grassThickness', settings.bladeThickness);
    uniformBuffer.updateFloat('grassShellStep', 1 / Math.max(1, settings.shellCount - 1));
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
        CUSTOM_VERTEX_DEFINITIONS: 'varying float vShellHeight;',
        // Each shell's local y is its height as a fraction of the tallest grass (0..1); the
        // mesh is scaled up to real meters.
        CUSTOM_VERTEX_MAIN_END: 'vShellHeight = position.y;',
      };
    }
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform sampler2D grassMap;
        uniform sampler2D grassVariety;
        varying float vShellHeight;
        ${GRASS_HASH}
        ${GRASS_WIND}
        ${GRASS_SHADING}`,
      // Runs first: decide whether this pixel of this shell is part of a blade at all.
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
        #ifdef GRASSFIELD
          vec4 grassData = texture2D(grassMap, vMainUV1);
          float grassHeight = grassData.r; // 0..1 of the tallest grass
          // Which way the mower was heading here: a unit vector, or about zero if never mowed.
          vec2 mowDirection = grassData.gb * 2.0 - 1.0;
          float grassThick = clamp(grassData.a * 2.0 - 1.0, 0.0, 1.0); // 0 normal .. 1 thickest
          if (grassData.a < 0.25) discard; // not lawn (a path, a flower bed)
          // The lawn is divided into a grid of cells, one blade per cell.
          vec2 bladeCell = vMainUV1 * grassBlades;
          // Far away, blades are smaller than a pixel and would flicker, so fade into a
          // solid carpet at the blades' average height instead.
          float cellsPerPixel = max(fwidth(bladeCell.x), fwidth(bladeCell.y));
          float grassFar = smoothstep(0.45, 1.2, cellsPerPixel);
          // Far away the carpet is solid, so only its top couple of layers can ever be seen.
          // Skip the rest here, before anything else: a big saving when the lawn fills the
          // view at a low angle (otherwise each far pixel is worked out a dozen times over).
          // (The carpet is at least 0.7 of the grass's height; see bladeHeight below.)
          if (grassFar > 0.98 && vShellHeight < grassHeight * 0.7 - 2.0 * grassShellStep) discard;
          vec2 bladeId = floor(bladeCell);
          float bladeRandom = grassHash(bladeId);
          // Blades grow in clumps: neighbors share some of their height.
          float clumpRandom = grassHash(floor(bladeCell / 3.0) + 101.0);
          vec2 grassMeters = vMainUV1 * grassLawnSize;
          float bladeVariety = 0.5 * bladeRandom + 0.5 * clumpRandom;
          float bladeHeight = grassHeight * mix(0.5 + 0.5 * bladeVariety, 0.8, grassFar);
          // Wildflowers (dandelions and daisies) grow in patches of long grass (every few
          // meters, some patches have them), and poke out above it. Mowing takes their heads
          // off: then they're just grass.
          float flowerSpot = grassHash(bladeId + 91.0);
          float flowerZone = step(0.6, grassHash(floor(grassMeters / 1.7) + 23.0));
          bool isFlower = flowerSpot < grassFlowers * flowerZone && grassHeight > grassUncutAbove
            && grassFar < 0.6;
          // Near you, real blades take over long grass (see GrassBlades): the layers' blades
          // thin out toward you and are gone within most of grassNear's radius. Mowed grass is
          // short enough that the layers look fine up close, so it stays layers (and so do the
          // flowers).
          float nearKeep = 1.0;
          if (grassNear.z > 0.0 && grassHeight > grassUncutAbove) {
            nearKeep = smoothstep(grassNear.z * 0.55, grassNear.z, distance(grassMeters, grassNear.xy));
            if (vShellHeight > 0.0 && !isFlower && grassHash(bladeId + 61.0) >= nearKeep) discard;
          }
          float flowerHead = 0.0; // 1 on a flower's head
          float flowerRadius = 0.0; // how far from the middle of the head (0..1)
          if (isFlower) bladeHeight = min(1.0, grassHeight * 1.15);
          // 0 at the root, 1 at the tip of this blade. (Among the real blades, the ground
          // between them is the lower blades' color, not the darkest roots.)
          float bladeAlong = clamp(vShellHeight / max(bladeHeight, 0.001), 0.0, 1.0);
          if (vShellHeight <= 0.0) bladeAlong = 0.5 * (1.0 - nearKeep);
          if (grassFar > 0.98 && vShellHeight < bladeHeight - 2.0 * grassShellStep) discard;
          float windWave = 0.0;
          if (vShellHeight > 0.0) { // the bottom shell is solid ground
            if (vShellHeight > bladeHeight) discard;
            // Each blade sits somewhere near the middle of its cell and tapers to a point.
            vec2 bladeJitter = vec2(grassHash(bladeId + 17.0), grassHash(bladeId + 43.0)) - 0.5;
            vec2 bladeHome = fract(bladeCell) - 0.5 - 0.5 * bladeJitter;
            float bladeRoot = grassThickness * (1.0 + 0.4 * grassThick);
            float bladeRadius = mix(bladeRoot * (1.0 - bladeAlong), 2.0, grassFar);
            // Most of this layer's pixels miss every blade: skip those before the wind (sines
            // are dear, and this runs for every layer of every pixel). A blade can lean at
            // most this far from home.
            float bladeReach = (0.71 * grassHeight + 1.2 * grassWind.x * grassHeight) * bladeAlong * bladeAlong
              + grassMowLean * bladeAlong;
            if (!isFlower && length(bladeHome) > bladeRadius + bladeReach) discard;
            // Wind: gentle waves rolling across the lawn, swaying long grass more than short.
            if (grassHeight > 0.4 && bladeAlong > 0.25) windWave = grassWindWave(grassMeters);
            vec2 windLean = vec2(0.85, 0.53) * (0.4 + 0.6 * windWave) * grassWind.x * grassHeight;
            // Long blades flop over a little, each its own way, so uncut grass looks messy,
            // and sway in the wind.
            vec2 bladeLean = (bladeJitter.yx * grassHeight + windLean) * bladeAlong * bladeAlong;
            // Mowed blades all lean the way the mower went.
            vec2 mowLean = mowDirection * grassMowLean * bladeAlong;
            vec2 bladeOffset = bladeHome - bladeLean - mowLean;
            if (isFlower) {
              // A thin stalk, and a flat, round head on top, facing the sky (as they do).
              float headBase = bladeHeight - 2.5 * grassShellStep;
              float stalkRadius = 0.12;
              float headSize = 0.75;
              float flowerDistance = length(bladeOffset);
              if (vShellHeight >= headBase) {
                if (flowerDistance > headSize) discard;
                flowerHead = 1.0;
                flowerRadius = flowerDistance / headSize;
              } else if (flowerDistance > stalkRadius) {
                discard;
              }
            } else if (length(bladeOffset) > bladeRadius) {
              discard;
            }
          }
        #endif
      `,
      // Runs after Babylon has worked out the surface color, before lighting is applied.
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        #ifdef GRASSFIELD
          // The lawn's variety (see grassNoise.js): r big patches, g medium, b mottling. It
          // tiles every grassVarietySize meters. (Read here, only for pixels that are grass.)
          vec4 grassVary = texture2D(grassVariety, grassMeters / grassVarietySize);
          vec3 grassTip;
          diffuseColor = grassBladeColor(grassHeight, grassThick, grassVary, bladeAlong,
            mix(bladeRandom, 0.5, grassFar), grassHash(bladeId + 5.0), grassTip);
          // Waves of wind show on long grass, even far away: the bent blades catch the light.
          diffuseColor *= 1.0 + 0.1 * windWave * smoothstep(0.3, 0.6, grassHeight);
          diffuseColor += grassBacklitGlow(grassTip, viewDirectionW) * bladeAlong;
          if (flowerHead > 0.5) {
            // Dandelions are all yellow; daisies are white with a yellow middle.
            bool daisy = grassHash(bladeId + 7.0) < 0.5;
            vec3 petals = daisy ? grassDaisyColor : grassDandelionColor;
            diffuseColor = flowerRadius < 0.35 ? grassDandelionColor : petals;
          }
          diffuseColor *= grassStripeShade(mowDirection, viewDirectionW);
        #endif
      `,
      // Runs after lighting: "show what's left" paints every uncut spot, however small.
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifdef GRASSFIELD
          float grassUncut = step(grassUncutAbove, grassHeight);
          color.rgb = mix(color.rgb, grassHighlightColor, grassHighlight * grassUncut);
        #endif
      `,
    };
  }
}
