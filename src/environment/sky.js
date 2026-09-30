import {
  Color3,
  DynamicTexture,
  Effect,
  ImageProcessingConfiguration,
  Mesh,
  MeshBuilder,
  Scene,
  ShaderMaterial,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { config } from '../config.js';
import { createRandom, createValueNoise, fractalNoise } from '../math/noise.js';
import { cloudBlobs, hillRing } from './skyMath.js';

const SKY_RADIUS = 400;

// The sky, worked out for every pixel: the same sums as skyColor in skyMath.js (tested there),
// plus a whisper of noise so the smooth gradient doesn't show bands.
Effect.ShadersStore.mowSkyVertexShader = `
  precision highp float;
  attribute vec3 position;
  uniform mat4 worldViewProjection;
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = worldViewProjection * vec4(position, 1.0);
  }`;
Effect.ShadersStore.mowSkyFragmentShader = `
  precision highp float;
  varying vec3 vDirection;
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 glow;
  uniform vec3 toSun;
  uniform float sunSize;
  void main() {
    vec3 d = normalize(vDirection);
    float t = pow(max(d.y, 0.0), 0.45);
    float facing = dot(d, toSun);
    float around = max(facing, 0.0);
    float halo = pow(around, 8.0) * 0.35 + pow(around, 90.0) * 0.6;
    float disc = smoothstep(cos(sunSize * 1.35), cos(sunSize), facing);
    vec3 color = mix(horizon, zenith, t) + glow * halo + 1.6 * disc;
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    gl_FragColor = vec4(color + (dither - 0.5) / 255.0, 1.0);
  }`;

/**
 * The sky: a smooth gradient dome with the sun and its glow, drawn per pixel, and puffy
 * cumulus clouds painted in code, drifting slowly round. The fog matches the horizon, so the
 * edge of the world fades into it.
 *
 * @param {Scene} scene
 */
export function createSky(scene) {
  const settings = config.render.sky;
  const horizon = Color3.FromHexString(settings.horizon);
  scene.clearColor = horizon.toColor4(1);
  // Haze that thickens with distance (squared), so it barely touches the yard but softens
  // the houses across the street and swallows the far ground: that's what makes far look far.
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = horizon;
  scene.fogDensity = config.render.fog.density;

  // A big inside-out sphere that always stays centered on the camera.
  const dome = MeshBuilder.CreateSphere(
    'sky',
    { diameter: SKY_RADIUS * 2, segments: 32, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  dome.infiniteDistance = true;
  dome.isPickable = false;
  const material = new ShaderMaterial(
    'skyMat',
    scene,
    { vertex: 'mowSky', fragment: 'mowSky' },
    {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'zenith', 'horizon', 'glow', 'toSun', 'sunSize'],
    },
  );
  material.setColor3('zenith', Color3.FromHexString(settings.zenith));
  material.setColor3('horizon', horizon);
  material.setColor3('glow', Color3.FromHexString(settings.sunGlow));
  material.setVector3('toSun', new Vector3(...config.render.sun.direction).normalize().scale(-1));
  material.setFloat('sunSize', settings.sunSize);
  dome.material = material;

  const clouds = createClouds(scene);
  createHills(scene);
  return {
    dome,
    clouds,
    /** @param {number} dt Seconds: the clouds drift slowly round. */
    update(dt) {
      clouds.rotation.y += dt * settings.cloudDrift;
    },
  };
}

/**
 * Two rings of rolling hills far off round the world, a nearer green one and a further,
 * hazier blue one, fading into the horizon at their feet: the world goes on past the
 * treeline. Unlit and ungraded, so their colors match the sky's haze exactly.
 *
 * @param {Scene} scene
 */
function createHills(scene) {
  const horizon = Color3.FromHexString(config.render.sky.horizon);
  const material = new StandardMaterial('hillsMat', scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White(); // the vertex colors, as they are
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  material.fogEnabled = false;
  material.imageProcessingConfiguration = ungraded(scene);
  for (const [i, ring] of [
    { radius: 210, depth: 45, height: 30, hex: '#a9bfc8', seed: 3 },
    { radius: 160, depth: 35, height: 16, hex: '#93b09a', seed: 8 },
  ].entries()) {
    const noise = createValueNoise(ring.seed);
    const top = Color3.Lerp(horizon, Color3.FromHexString(ring.hex), 0.75);
    const hills = hillRing({
      radius: ring.radius,
      depth: ring.depth,
      height: ring.height,
      steps: 160,
      noise: (angle) => fractalNoise(noise, angle * 2.2, 0.5, 3),
      foot: [horizon.r, horizon.g, horizon.b],
      top: [top.r, top.g, top.b],
    });
    const mesh = new Mesh(`hills${i}`, scene);
    const data = new VertexData();
    data.positions = hills.positions;
    data.colors = hills.colors;
    data.indices = hills.indices;
    data.normals = hills.positions.map((_, k) => (k % 3 === 1 ? 1 : 0));
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.applyFog = false;
  }
}

/**
 * Puffy clouds far off round the sky: flat planes that turn to face you, each painted with
 * a cumulus (heaps of soft blobs over a flat bottom, lit from the sun's side and a little
 * blue-grey underneath). Unlit, so they stay bright, and seeded, so they're always the same.
 *
 * @param {Scene} scene
 */
function createClouds(scene) {
  const random = createRandom(17);
  const node = new TransformNode('clouds', scene);
  const shade = config.render.sky.cloudShade;
  const materials = Array.from({ length: 4 }, (_, i) => {
    const texture = paintCloud(scene, random, shade, `cloud${i}`);
    const material = new StandardMaterial(`cloudMat${i}`, scene);
    material.disableLighting = true;
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.fogEnabled = false;
    material.imageProcessingConfiguration = ungraded(scene);
    return material;
  });
  const count = 14;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.3;
    const distance = 190 + random() * 80;
    const height = 30 + random() * 22;
    const cloud = MeshBuilder.CreatePlane(
      'cloud',
      { width: height * 2, height, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    cloud.parent = node;
    cloud.position.set(Math.sin(angle) * distance, 45 + random() * 40, Math.cos(angle) * distance);
    cloud.billboardMode = Mesh.BILLBOARDMODE_Y;
    cloud.material = materials[i % materials.length];
    cloud.isPickable = false;
    cloud.applyFog = false;
  }
  return node;
}

/**
 * Paints one cumulus cloud: soft white blobs (cloudBlobs), a flat bottom, shaded from white
 * on top to blue-grey underneath, with soft highlights on the sunny side of each heap.
 *
 * @param {Scene} scene
 * @param {() => number} random
 * @param {string} shade
 * @param {string} name
 */
function paintCloud(scene, random, shade, name) {
  const width = 512;
  const height = 256;
  const texture = new DynamicTexture(name, { width, height }, scene, true);
  const context = /** @type {CanvasRenderingContext2D} */ (
    /** @type {unknown} */ (texture.getContext())
  );
  context.clearRect(0, 0, width, height);
  const blobs = cloudBlobs(random, 3 + Math.floor(random() * 3));
  /**
   * @param {{ x: number, y: number, radius: number }} blob
   * @param {string} color
   * @param {number} solid Fraction of the radius that's fully opaque.
   */
  const soft = ({ x, y, radius }, color, solid) => {
    const cx = x * width;
    const cy = y * height;
    const r = radius * height;
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(solid, color);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  for (const blob of blobs) soft(blob, 'rgba(255, 255, 255, 1)', 0.82);
  // A flat bottom: fade out below the base line.
  context.globalCompositeOperation = 'destination-out';
  const base = context.createLinearGradient(0, height * 0.8, 0, height * 0.9);
  base.addColorStop(0, 'rgba(0, 0, 0, 0)');
  base.addColorStop(1, 'rgba(0, 0, 0, 1)');
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);
  // Shading: white on top, blue-grey underneath...
  context.globalCompositeOperation = 'source-atop';
  const light = context.createLinearGradient(0, height * 0.15, 0, height * 0.85);
  light.addColorStop(0, '#ffffff');
  light.addColorStop(0.55, '#f7f9fc');
  light.addColorStop(1, shade);
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);
  // ...and each heap's underside a touch darker, so the heaps stand out from each other.
  for (const blob of blobs) {
    soft({ ...blob, y: blob.y + blob.radius * 0.45, radius: blob.radius * 0.7 }, `${shade}66`, 0.2);
  }
  for (const blob of blobs) {
    soft(
      { x: blob.x - blob.radius * 0.12, y: blob.y - blob.radius * 0.3, radius: blob.radius * 0.6 },
      'rgba(255, 255, 255, 0.9)',
      0.1,
    );
  }
  context.globalCompositeOperation = 'source-over';
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

/** @type {WeakMap<Scene, ImageProcessingConfiguration>} */
const ungradedConfigs = new WeakMap();

/**
 * Color processing with nothing turned on, for things whose colors we pick exactly (the
 * clouds), so the grade doesn't dull them.
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
