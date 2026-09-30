import { Color3, FresnelParameters, ReflectionProbe, RenderTargetTexture } from '@babylonjs/core';
import { config } from '../config.js';

/**
 * Reflections of the sky for shiny things (window glass, the birdbath's water, the mower's
 * paint, Tuft's eyes): a picture of the sky, clouds and ground in every direction (a cube
 * map), taken once when the level's ready, so it costs nothing per frame beyond reading it.
 *
 * Anything shiny says so in its material's metadata (`{ gloss: 0..1 }`, how mirror-like it
 * is); reflections are strongest at grazing angles, as on real glass and paint (Fresnel).
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').AbstractMesh[]} surroundings What the reflections show.
 */
export function createSkyReflections(scene, surroundings) {
  const probe = new ReflectionProbe('skyReflections', config.render.reflections.size, scene);
  probe.position.set(0, 2, 0);
  probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  probe.renderList?.push(...surroundings);
  // Take the picture again once every shader is ready (the first may catch some unfinished).
  scene.executeWhenReady(() => probe.cubeTexture.resetRefreshCounter());
  for (const material of scene.materials) {
    const gloss = material.metadata?.gloss;
    if (gloss > 0 && 'reflectionTexture' in material) makeGlossy(material, probe, gloss);
  }
  return probe;
}

/**
 * @param {import('@babylonjs/core').Material} material A StandardMaterial.
 * @param {ReflectionProbe} probe
 * @param {number} gloss 0..1: how mirror-like.
 */
function makeGlossy(material, probe, gloss) {
  const standard = /** @type {import('@babylonjs/core').StandardMaterial} */ (material);
  standard.reflectionTexture = probe.cubeTexture;
  standard.reflectionFresnelParameters = new FresnelParameters({
    bias: 0.1,
    power: 2.5,
    leftColor: Color3.White().scale(gloss), // at grazing angles
    rightColor: Color3.White().scale(gloss * 0.25), // looking straight at it
  });
}
