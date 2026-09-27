import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import { config } from '../config.js';

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

  return { sun, shadows };
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
    { diameter: SKY_RADIUS * 2, segments: 24, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;

  // Color each vertex by its height: horizon color at the horizon, fading to zenith overhead.
  const positions = dome.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const colors = [];
  for (let i = 0; i < positions.length; i += 3) {
    const height = Math.max(0, positions[i + 1] / SKY_RADIUS); // 0 at horizon, 1 straight up
    const color = Color3.Lerp(horizon, zenith, Math.pow(height, 0.6));
    colors.push(color.r, color.g, color.b, 1);
  }
  dome.setVerticesData(VertexBuffer.ColorKind, colors);

  const material = new StandardMaterial('skyMat', scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White(); // output = vertex color, unaffected by lights
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  dome.material = material;

  return dome;
}
