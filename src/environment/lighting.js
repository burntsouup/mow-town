import {
  Color3,
  ColorCurves,
  DirectionalLight,
  HemisphericLight,
  ImageProcessingConfiguration,
  ShadowGenerator,
  Vector3,
} from '@babylonjs/core';
import { config } from '../config.js';

/**
 * Sun (with shadows) plus a soft fill light.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function createLighting(scene) {
  const { sun: sunSettings, fill } = config.render;

  // Hemispheric light: sky color from above, bounce color from below. Keeps shadows readable.
  const fillLight = new HemisphericLight('fillLight', new Vector3(0, 1, 0), scene);
  fillLight.intensity = fill.intensity;
  fillLight.diffuse = Color3.FromHexString(fill.skyColor);
  fillLight.groundColor = Color3.FromHexString(fill.groundColor);
  fillLight.specular = Color3.Black();

  const direction = new Vector3(...sunSettings.direction).normalize();
  const sun = new DirectionalLight('sun', direction, scene);
  sun.intensity = sunSettings.intensity;
  sun.diffuse = Color3.FromHexString(sunSettings.color);
  // A directional light has no real position, but shadows are rendered from one:
  // place it far "up-sun" and let Babylon fit the shadow depth range to the scene.
  sun.position = direction.scale(-60);
  sun.autoCalcShadowZBounds = true;

  const shadows = new ShadowGenerator(config.render.shadowMapSize, sun);
  shadows.usePercentageCloserFiltering = true; // soft-edged shadows
  shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH; // smoother edges, for free on an M3
  shadows.bias = 0.001; // prevents "shadow acne" stripes on lit surfaces
  shadows.normalBias = 0.02;
  shadows.darkness = sunSettings.shadowDarkness; // 0 = no sunlight in shadows; softer above

  return { sun, shadows };
}

/**
 * The final look of every pixel: tone mapping (a filmic curve, so bright sunlight rolls off
 * gently instead of clipping to flat white), exposure and contrast, a color grade (warm
 * highlights, cool shadows) and a soft vignette. Babylon does this inside each material's
 * shader, so it costs no extra full-screen pass.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
export function applyColorGrading(scene) {
  const grading = config.render.grading;
  const processing = scene.imageProcessingConfiguration;
  processing.toneMappingEnabled = true;
  processing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  processing.exposure = grading.exposure;
  processing.contrast = grading.contrast;

  const curves = new ColorCurves();
  curves.globalSaturation = grading.saturation;
  curves.highlightsHue = grading.highlights.hue;
  curves.highlightsDensity = grading.highlights.density;
  curves.shadowsHue = grading.shadows.hue;
  curves.shadowsDensity = grading.shadows.density;
  processing.colorCurves = curves;
  processing.colorCurvesEnabled = true;

  processing.vignetteEnabled = grading.vignette > 0;
  processing.vignetteWeight = grading.vignette;
  processing.vignetteColor = Color3.FromHexString(grading.vignetteColor).toColor4(0);
  processing.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
}
