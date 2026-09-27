import { Color3, MaterialPluginBase } from '@babylonjs/core';
import { config } from '../config.js';

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
   * @param {{ width: number, depth: number }} size The lawn's size in meters.
   */
  constructor(material, grassMap, size) {
    super(material, 'GrassShells', 200, { GRASSFIELD: false });
    this.grassMap = grassMap;
    this.size = size;
    this.colors = {
      root: new Color3(),
      tip: new Color3(),
      longTip: new Color3(),
      highlight: new Color3(),
    };
    /** 0..1: how strongly to highlight grass that still needs mowing. Changes every frame. */
    this.highlight = 0;
    /** Grass taller than this (0..1) still counts as uncut. */
    this.uncutAbove = 1;
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
    return this.grassMap.isReady();
  }

  /** @param {string[]} samplers */
  getSamplers(samplers) {
    samplers.push('grassMap');
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'grassBlades', size: 2, type: 'vec2' },
        { name: 'grassThickness', size: 1, type: 'float' },
        { name: 'grassRootColor', size: 3, type: 'vec3' },
        { name: 'grassTipColor', size: 3, type: 'vec3' },
        { name: 'grassLongTipColor', size: 3, type: 'vec3' },
        { name: 'grassStripes', size: 1, type: 'float' },
        { name: 'grassMowLean', size: 1, type: 'float' },
        { name: 'grassHighlightColor', size: 3, type: 'vec3' },
        { name: 'grassHighlight', size: 1, type: 'float' },
        { name: 'grassUncutAbove', size: 1, type: 'float' },
      ],
      fragment: `
        uniform vec2 grassBlades;
        uniform float grassThickness;
        uniform vec3 grassRootColor;
        uniform vec3 grassTipColor;
        uniform vec3 grassLongTipColor;
        uniform float grassStripes;
        uniform float grassMowLean;
        uniform vec3 grassHighlightColor;
        uniform float grassHighlight;
        uniform float grassUncutAbove;`,
    };
  }

  /** @param {import('@babylonjs/core').UniformBuffer} uniformBuffer */
  bindForSubMesh(uniformBuffer) {
    uniformBuffer.setTexture('grassMap', this.grassMap);
  }

  /**
   * Like bindForSubMesh, but Babylon calls this every frame, so live-tunable values go here.
   *
   * @param {import('@babylonjs/core').UniformBuffer} uniformBuffer
   */
  hardBindForSubMesh(uniformBuffer) {
    const settings = config.grass;
    const blades = settings.bladesPerMeter;
    uniformBuffer.updateFloat2('grassBlades', this.size.width * blades, this.size.depth * blades);
    uniformBuffer.updateFloat('grassThickness', settings.bladeThickness);
    uniformBuffer.updateFloat('grassStripes', settings.stripes);
    uniformBuffer.updateFloat('grassMowLean', settings.mowLean);
    uniformBuffer.updateColor3(
      'grassHighlightColor',
      this.colors.highlight.fromHexString(config.job.highlightColor),
    );
    uniformBuffer.updateFloat('grassHighlight', this.highlight);
    uniformBuffer.updateFloat('grassUncutAbove', this.uncutAbove);
    const { colors } = settings;
    uniformBuffer.updateColor3('grassRootColor', this.colors.root.fromHexString(colors.root));
    uniformBuffer.updateColor3('grassTipColor', this.colors.tip.fromHexString(colors.tip));
    uniformBuffer.updateColor3(
      'grassLongTipColor',
      this.colors.longTip.fromHexString(colors.longTip),
    );
  }

  /** @param {import('@babylonjs/core').BaseTexture[]} activeTextures */
  getActiveTextures(activeTextures) {
    activeTextures.push(this.grassMap);
  }

  /** @param {import('@babylonjs/core').BaseTexture} texture */
  hasTexture(texture) {
    return texture === this.grassMap;
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
        varying float vShellHeight;

        // A random number 0..1 for each blade, without a texture ("hash without sine").
        float grassHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }`,
      // Runs first: decide whether this pixel of this shell is part of a blade at all.
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
        #ifdef GRASSFIELD
          vec4 grassData = texture2D(grassMap, vMainUV1);
          float grassHeight = grassData.r; // 0..1 of the tallest grass
          // Which way the mower was heading here: a unit vector, or about zero if never mowed.
          vec2 mowDirection = grassData.gb * 2.0 - 1.0;
          float grassThick = clamp(grassData.a * 2.0 - 1.0, 0.0, 1.0); // 0 normal .. 1 thickest
          // The lawn is divided into a grid of cells, one blade per cell.
          vec2 bladeCell = vMainUV1 * grassBlades;
          vec2 bladeId = floor(bladeCell);
          float bladeRandom = grassHash(bladeId);
          // Far away, blades are smaller than a pixel and would flicker, so fade into a
          // solid carpet at the blades' average height instead.
          float cellsPerPixel = max(fwidth(bladeCell.x), fwidth(bladeCell.y));
          float grassFar = smoothstep(0.45, 1.2, cellsPerPixel);
          float bladeHeight = grassHeight * mix(0.6 + 0.4 * bladeRandom, 0.8, grassFar);
          // 0 at the root, 1 at the tip of this blade.
          float bladeAlong = clamp(vShellHeight / max(bladeHeight, 0.001), 0.0, 1.0);
          if (grassData.a < 0.25) discard; // not lawn (a path, a flower bed)
          if (vShellHeight > 0.0) { // the bottom shell is solid ground
            if (vShellHeight > bladeHeight) discard;
            // Each blade sits somewhere near the middle of its cell and tapers to a point.
            vec2 bladeJitter = vec2(grassHash(bladeId + 17.0), grassHash(bladeId + 43.0)) - 0.5;
            // Long blades flop over a little, each its own way, so uncut grass looks messy.
            vec2 bladeLean = bladeJitter.yx * grassHeight * bladeAlong * bladeAlong;
            // Mowed blades all lean the way the mower went.
            vec2 mowLean = mowDirection * grassMowLean * bladeAlong;
            vec2 bladeOffset = fract(bladeCell) - 0.5 - 0.5 * bladeJitter - bladeLean - mowLean;
            float bladeRoot = grassThickness * (1.0 + 0.4 * grassThick);
            float bladeRadius = mix(bladeRoot * (1.0 - bladeAlong), 2.0, grassFar);
            if (length(bladeOffset) > bladeRadius) discard;
          }
        #endif
      `,
      // Runs after Babylon has worked out the surface color, before lighting is applied.
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        #ifdef GRASSFIELD
          // Long grass has darker, bluer tips; freshly cut grass is brighter.
          vec3 grassTip = mix(grassTipColor, grassLongTipColor, smoothstep(0.3, 0.6, grassHeight));
          grassTip *= 1.0 - 0.4 * grassThick * smoothstep(0.3, 0.6, grassHeight); // lush, dark
          // Dark at the roots, where the blades shade each other, bright at the tips.
          vec3 grassColor = mix(grassRootColor, grassTip, pow(bladeAlong, 0.8));
          diffuseColor = grassColor * mix(0.8 + 0.4 * bladeRandom, 1.0, grassFar);
          // Stripes: lighter where the grass leans away from the camera, darker toward it.
          // Looking straight down, you can't tell which way blades lean, so fade out there.
          vec2 lookAcross = -viewDirectionW.xz;
          float leanAway = dot(mowDirection, lookAcross) / max(length(lookAcross), 0.3);
          diffuseColor *= 1.0 + grassStripes * clamp(leanAway, -1.0, 1.0);
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
