import { MaterialPluginBase } from '@babylonjs/core';

/**
 * Soft shading where things meet: a cheap stand-in for ambient occlusion (which the real,
 * screen-space kind costs too much for here). Anything standing on the ground gets a little
 * darker toward its base, as the ground and its neighbors block some of the sky's light; and
 * house walls get a little darker just under the eaves, in the roof's shade.
 *
 * It works from each pixel's height in the world, so it's a couple of sums per pixel.
 */
export class GroundShadePlugin extends MaterialPluginBase {
  /** @param {import('@babylonjs/core').Material} material */
  constructor(material) {
    super(material, 'GroundShade', 150, { GROUNDSHADE: false });
    this.height = 0.6; // meters up from the ground that the darkening fades out over
    this.strength = 0.35; // how much darker right at the ground (0..1)
    this.eaveHeight = 0; // for house walls: where the eaves are (0 = no eaves)
    this.eaveStrength = 0.25;
    this.eaveDepth = 0.7; // meters down from the eaves that it fades out over
    this._enable(true);
  }

  getClassName() {
    return 'GroundShadePlugin';
  }

  /** @param {import('@babylonjs/core').MaterialDefines} defines */
  prepareDefines(defines) {
    defines.GROUNDSHADE = true;
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'groundShade', size: 4, type: 'vec4' },
        { name: 'eaveShade', size: 2, type: 'vec2' },
      ],
      fragment: `
        uniform vec4 groundShade;
        uniform vec2 eaveShade;`,
    };
  }

  /** @param {import('@babylonjs/core').UniformBuffer} uniformBuffer */
  bindForSubMesh(uniformBuffer) {
    uniformBuffer.updateFloat4(
      'groundShade',
      this.height,
      this.strength,
      this.eaveHeight,
      this.eaveStrength,
    );
    uniformBuffer.updateFloat2('eaveShade', this.eaveDepth, 0);
  }

  /** @param {string} shaderType */
  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifdef GROUNDSHADE
          float groundShading = mix(1.0 - groundShade.y, 1.0, smoothstep(0.0, groundShade.x, vPositionW.y));
          if (groundShade.z > 0.0) {
            float belowEaves = groundShade.z - vPositionW.y;
            groundShading *= mix(1.0 - groundShade.w, 1.0, smoothstep(0.0, eaveShade.x, belowEaves));
          }
          color.rgb *= groundShading;
        #endif`,
    };
  }
}
