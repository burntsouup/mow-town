import { Color3 } from '@babylonjs/core';
import { config } from '../config.js';

/**
 * What the two ways of drawing grass share, so they look the same where they meet: the
 * shells (GrassMaterialPlugin: the whole lawn, as layers) and the real blades near you
 * (GrassBlades). Their uniforms, and GLSL for a blade's color, the stripes and the glow of
 * backlit tips.
 */

/** @type {{ name: string, size: number, type: string }[]} */
const SHARED_UNIFORMS = [
  { name: 'grassRootColor', size: 3, type: 'vec3' },
  { name: 'grassTipColor', size: 3, type: 'vec3' },
  { name: 'grassLongTipColor', size: 3, type: 'vec3' },
  { name: 'grassDryColor', size: 3, type: 'vec3' },
  { name: 'grassLushColor', size: 3, type: 'vec3' },
  { name: 'grassDandelionColor', size: 3, type: 'vec3' },
  { name: 'grassDaisyColor', size: 3, type: 'vec3' },
  { name: 'grassHighlightColor', size: 3, type: 'vec3' },
  { name: 'grassSunDirection', size: 3, type: 'vec3' },
  { name: 'grassNear', size: 3, type: 'vec3' },
  { name: 'grassLawnSize', size: 2, type: 'vec2' },
  { name: 'grassWind', size: 2, type: 'vec2' },
  { name: 'grassStripes', size: 1, type: 'float' },
  { name: 'grassMowLean', size: 1, type: 'float' },
  { name: 'grassHighlight', size: 1, type: 'float' },
  { name: 'grassUncutAbove', size: 1, type: 'float' },
  { name: 'grassTime', size: 1, type: 'float' },
  { name: 'grassBacklight', size: 1, type: 'float' },
  { name: 'grassVarietySize', size: 1, type: 'float' },
  { name: 'grassFlowers', size: 1, type: 'float' },
  { name: 'grassBladesPerMeter', size: 1, type: 'float' },
];

/**
 * Uniforms (for a plugin's getUniforms), plus any of its own.
 *
 * @param {{ name: string, size: number, type: string }[]} own
 */
export function grassUniforms(own) {
  const ubo = [...SHARED_UNIFORMS, ...own];
  const declarations = ubo.map(({ name, type }) => `uniform ${type} ${name};`).join('\n');
  return { ubo, vertex: declarations, fragment: declarations };
}

/**
 * Sends the shared uniforms. `state` is the lawn's: its size, the time (for the wind), where
 * the sun's light travels, the "show what's left" highlight, and where the real blades are.
 *
 * @param {import('@babylonjs/core').UniformBuffer} uniformBuffer
 * @param {{ size: { width: number, depth: number }, time: number,
 *   sunDirection: import('@babylonjs/core').Vector3, highlight: number, uncutAbove: number,
 *   near: { x: number, z: number, radius: number } }} state near: lawn-local meters.
 */
export function bindGrassUniforms(uniformBuffer, state) {
  const settings = config.grass;
  const { colors } = settings;
  for (const [name, hex] of [
    ['grassRootColor', colors.root],
    ['grassTipColor', colors.tip],
    ['grassLongTipColor', colors.longTip],
    ['grassDryColor', colors.dry],
    ['grassLushColor', colors.lush],
    ['grassDandelionColor', colors.dandelion],
    ['grassDaisyColor', colors.daisy],
    ['grassHighlightColor', config.job.highlightColor],
  ]) {
    uniformBuffer.updateColor3(name, color(hex));
  }
  uniformBuffer.updateVector3('grassSunDirection', state.sunDirection);
  const { near } = state;
  uniformBuffer.updateFloat3('grassNear', near.x, near.z, near.radius);
  uniformBuffer.updateFloat2('grassLawnSize', state.size.width, state.size.depth);
  uniformBuffer.updateFloat2('grassWind', settings.wind.strength, settings.wind.speed);
  uniformBuffer.updateFloat('grassStripes', settings.stripes);
  uniformBuffer.updateFloat('grassMowLean', settings.mowLean);
  uniformBuffer.updateFloat('grassHighlight', state.highlight);
  uniformBuffer.updateFloat('grassUncutAbove', state.uncutAbove);
  uniformBuffer.updateFloat('grassTime', state.time);
  uniformBuffer.updateFloat('grassBacklight', settings.backlight);
  uniformBuffer.updateFloat('grassVarietySize', settings.varietySize);
  uniformBuffer.updateFloat('grassFlowers', settings.flowers);
  uniformBuffer.updateFloat('grassBladesPerMeter', settings.bladesPerMeter);
}

/** @type {Map<string, Color3>} */
const colorCache = new Map();

/** @param {string} hex */
function color(hex) {
  let value = colorCache.get(hex);
  if (!value) {
    value = Color3.FromHexString(hex);
    colorCache.set(hex, value);
  }
  return value;
}

/** A random number 0..1 from a 2D point ("hash without sine"), for both shaders. */
export const GRASS_HASH = `
  float grassHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }`;

/**
 * Gentle waves of wind rolling across the lawn (meters in, about -1..1 out).
 */
export const GRASS_WIND = `
  float grassWindWave(vec2 meters) {
    float phase = grassTime * grassWind.y;
    return 0.6 * sin(dot(meters, vec2(0.55, 0.35)) - phase)
      + 0.4 * sin(dot(meters, vec2(-0.25, 0.9)) * 1.7 - phase * 1.3);
  }`;

/** GLSL for a blade's color, the stripes and backlit tips (fragment shaders). */
export const GRASS_SHADING = `
  // A blade's color before lighting, at \`along\` (0 at the root, 1 at the tip). \`tip\` is
  // its tip color. vary: the lawn's variety (see grassNoise.js); randoms: this blade's.
  vec3 grassBladeColor(float height, float thick, vec4 vary, float along, float randomA,
      float randomB, out vec3 tip) {
    // Long grass has darker, bluer tips; freshly cut grass is brighter.
    float grassLong = smoothstep(0.3, 0.6, height);
    tip = mix(grassTipColor, grassLongTipColor, grassLong);
    tip *= 1.0 - 0.28 * thick * grassLong; // thick patches: lush and dark
    // Patches: some drier and yellower, some lusher and darker, and a finer mottling.
    // (Mowed grass shows it less: its tips are fresh.)
    float dry = smoothstep(0.55, 0.85, vary.r) * (0.3 + 0.7 * grassLong);
    tip = mix(tip, grassDryColor, 0.5 * dry);
    tip = mix(tip, grassLushColor, 0.4 * smoothstep(0.45, 0.15, vary.r));
    tip *= 0.9 + 0.1 * vary.g + 0.14 * vary.b;
    // Some blades a little yellower than their neighbors.
    tip = mix(tip, tip * vec3(1.12, 1.06, 0.75), 0.4 * randomB);
    // Dark at the roots, where the blades shade each other, bright at the tips.
    return mix(grassRootColor, tip, pow(along, 0.8)) * (0.8 + 0.4 * randomA);
  }

  // Stripes: mowed grass looks lighter where it leans away from you, darker toward you.
  // Looking straight down, you can't tell which way blades lean, so it fades out there.
  float grassStripeShade(vec2 mowDirection, vec3 toEye) {
    vec2 lookAcross = -toEye.xz;
    float leanAway = dot(mowDirection, lookAcross) / max(length(lookAcross), 0.3);
    return 1.0 + grassStripes * clamp(leanAway, -1.0, 1.0);
  }

  // Against the sun, light shines through the blades and their tips glow.
  vec3 grassBacklitGlow(vec3 tip, vec3 toEye) {
    vec2 eye = normalize(toEye.xz + vec2(0.0001));
    vec2 sunward = normalize(grassSunDirection.xz + vec2(0.0001));
    float backlit = pow(max(dot(eye, sunward), 0.0), 3.0);
    return tip * vec3(0.45, 0.5, 0.12) * backlit * grassBacklight;
  }`;
