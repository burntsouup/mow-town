import {
  Color3,
  ColorCurves,
  DirectionalLight,
  HemisphericLight,
  ImageProcessingConfiguration,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import { config } from '../config.js';
import { createRandom } from '../math/noise.js';

const SKY_RADIUS = 400;

/**
 * Sun (with shadows) plus a soft fill light.
 *
 * @param {Scene} scene
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
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
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
 * @param {Scene} scene
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

/**
 * Gradient sky dome and matching fog.
 *
 * @param {Scene} scene
 */
export function createSky(scene) {
  const zenith = Color3.FromHexString(config.render.sky.zenith);
  const horizon = Color3.FromHexString(config.render.sky.horizon);

  scene.clearColor = horizon.toColor4(1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = horizon;
  scene.fogStart = config.render.fog.start;
  scene.fogEnd = config.render.fog.end;

  // A big inside-out sphere that always stays centered on the camera.
  const dome = MeshBuilder.CreateSphere(
    'sky',
    { diameter: SKY_RADIUS * 2, segments: 48, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;

  // Color each vertex by its height: horizon color at the horizon, fading to zenith overhead,
  // plus a warm glow around the sun.
  const toSun = new Vector3(...config.render.sun.direction).normalize().scale(-1);
  const glow = Color3.FromHexString(config.render.sky.sunGlow);
  const positions = dome.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const colors = [];
  for (let i = 0; i < positions.length; i += 3) {
    const height = Math.max(0, positions[i + 1] / SKY_RADIUS); // 0 at horizon, 1 straight up
    const color = Color3.Lerp(horizon, zenith, Math.pow(height, 0.6));
    const facing = Vector3.Dot(
      toSun,
      new Vector3(positions[i], positions[i + 1], positions[i + 2]).normalize(),
    );
    const sun = Math.pow(Math.max(0, facing), 6) * 0.45 + Math.pow(Math.max(0, facing), 80) * 0.6;
    colors.push(color.r + glow.r * sun, color.g + glow.g * sun, color.b + glow.b * sun, 1);
  }
  dome.setVerticesData(VertexBuffer.ColorKind, colors);

  const material = new StandardMaterial('skyMat', scene);
  material.imageProcessingConfiguration = ungraded(scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White(); // output = vertex color, unaffected by lights
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  dome.material = material;

  createClouds(scene);
  return dome;
}

/** @type {WeakMap<Scene, ImageProcessingConfiguration>} */
const ungradedConfigs = new WeakMap();

/**
 * Color processing with nothing turned on, for things whose colors we pick exactly (the
 * sky), so the grade doesn't dull them.
 *
 * @param {Scene} scene
 */
function ungraded(scene) {
  let processing = ungradedConfigs.get(scene);
  if (!processing) {
    processing = new ImageProcessingConfiguration();
    processing.isEnabled = false;
    ungradedConfigs.set(scene, processing);
  }
  return processing;
}

/**
 * Puffy clouds far off around the sky: clusters of soft balls, white on top and a little
 * blue-grey underneath. Unlit, so they stay bright, and seeded, so they're always the same.
 *
 * @param {Scene} scene
 */
function createClouds(scene) {
  const random = createRandom(17);
  const material = new StandardMaterial('cloudMat', scene);
  material.imageProcessingConfiguration = ungraded(scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  const top = Color3.FromHexString('#ffffff');
  const bottom = Color3.FromHexString(config.render.sky.cloudShade);
  const puffs = [];
  for (let c = 0; c < 11; c++) {
    const angle = (c / 11) * Math.PI * 2 + random() * 0.4;
    const distance = 170 + random() * 90;
    const cx = Math.sin(angle) * distance;
    const cz = Math.cos(angle) * distance;
    const cy = 38 + random() * 34;
    const size = 9 + random() * 8;
    const count = 4 + Math.floor(random() * 4);
    for (let p = 0; p < count; p++) {
      const radius = size * (0.55 + random() * 0.5);
      const puff = MeshBuilder.CreateIcoSphere('cloud', { radius, subdivisions: 3 }, scene);
      puff.scaling.y = 0.6;
      const along = (p / (count - 1) - 0.5) * size * 2.6;
      puff.position.set(
        cx + Math.cos(angle) * along,
        cy + random() * size * 0.3,
        cz - Math.sin(angle) * along + (random() - 0.5) * size,
      );
      const normals = puff.getVerticesData(VertexBuffer.NormalKind) ?? [];
      const colors = [];
      for (let i = 0; i < normals.length; i += 3) {
        const c2 = Color3.Lerp(bottom, top, Math.min(1, (normals[i + 1] + 1) * 0.7));
        colors.push(c2.r, c2.g, c2.b, 1);
      }
      puff.setVerticesData(VertexBuffer.ColorKind, colors);
      puffs.push(puff);
    }
  }
  const clouds = /** @type {Mesh} */ (Mesh.MergeMeshes(puffs, true, true));
  clouds.name = 'clouds';
  clouds.material = material;
  clouds.applyFog = false;
  clouds.isPickable = false;
  return clouds;
}
