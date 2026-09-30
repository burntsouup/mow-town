import { MaterialPluginBase } from '@babylonjs/core';

/** The patterns a wall can have. */
const PATTERNS = { siding: 1, brick: 2, stone: 3 };

/**
 * Patterns on walls, worked out from each pixel's position in the world (so they line up
 * on every face, whatever its texture coordinates, and cost a few sums a pixel):
 * - siding: overlapping horizontal boards, each with a thin shadow under its lower edge
 * - brick: small bricks in staggered rows, each its own shade, with pale mortar between
 * - stone: bigger blocks, the same way (a foundation)
 */
export class WallPatternPlugin extends MaterialPluginBase {
  /**
   * @param {import('@babylonjs/core').Material} material
   * @param {keyof typeof PATTERNS} pattern
   */
  constructor(material, pattern) {
    super(material, 'WallPattern', 140, { WALLPATTERN: false });
    this.pattern = PATTERNS[pattern];
    this._enable(true);
  }

  getClassName() {
    return 'WallPatternPlugin';
  }

  /** @param {import('@babylonjs/core').MaterialDefines} defines */
  prepareDefines(defines) {
    defines.WALLPATTERN = true;
  }

  getUniforms() {
    return {
      ubo: [{ name: 'wallPattern', size: 1, type: 'float' }],
      fragment: 'uniform float wallPattern;',
    };
  }

  /** @param {import('@babylonjs/core').UniformBuffer} uniformBuffer */
  bindForSubMesh(uniformBuffer) {
    uniformBuffer.updateFloat('wallPattern', this.pattern);
  }

  /** @param {string} shaderType */
  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        float wallHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        #ifdef WALLPATTERN
          // Along the wall: x on walls facing +-z, z on walls facing +-x.
          float wallAcross = abs(normalW.x) > 0.5 ? vPositionW.z : vPositionW.x;
          float wallShade = 1.0;
          if (abs(normalW.y) < 0.5) {
            if (wallPattern < 1.5) {
              // Lap siding: boards 18 cm tall, a shadow line under each one's lower edge,
              // and each board a touch lighter toward the bottom, where it tips out.
              float board = fract(vPositionW.y / 0.18);
              wallShade = mix(0.8, 1.0, smoothstep(0.0, 0.1, board)) * mix(1.04, 0.97, board);
            } else {
              // Bricks (or blocks), in rows that shift by half a brick each time.
              vec2 brickSize = wallPattern < 2.5 ? vec2(0.22, 0.075) : vec2(0.45, 0.17);
              float row = floor(vPositionW.y / brickSize.y);
              float along = wallAcross / brickSize.x + 0.5 * mod(row, 2.0);
              vec2 brick = vec2(floor(along), row);
              vec2 inBrick = vec2(fract(along), fract(vPositionW.y / brickSize.y));
              vec2 mortar = min(inBrick, 1.0 - inBrick) * brickSize;
              float joint = 1.0 - smoothstep(0.006, 0.012, min(mortar.x, mortar.y));
              wallShade = mix(0.82 + 0.3 * wallHash(brick), 1.35, joint);
            }
          }
          diffuseColor *= wallShade;
        #endif`,
    };
  }
}
