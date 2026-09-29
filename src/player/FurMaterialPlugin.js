import { Color3, MaterialPluginBase, Vector3 } from '@babylonjs/core';

/**
 * Draws fur the way the lawn draws grass: as shells (see furGeometry.js). In each shell, the
 * shader keeps only the dots where a strand passes through, and strands taper and vary in
 * length, so the stack reads as soft fuzz. Strands are placed on a 3D grid over the skin
 * (not by texture coordinates), so there are no seams.
 *
 * Also: a two-tone gradient from bottom to top, darker roots, tips that trail behind when
 * you move (`drag`), and see-through by dithering (`opacity`), so the camera can fade Tuft
 * out without the layers sorting badly.
 */
export class FurMaterialPlugin extends MaterialPluginBase {
  /** @param {import('@babylonjs/core').Material} material */
  constructor(material) {
    super(material, 'FurShells', 200, { FURSHELLS: false });
    this.top = new Color3(1, 0.76, 0.37);
    this.bottom = new Color3(1, 0.54, 0.36);
    this.density = 90; // strands per meter
    this.thickness = 0.5; // strand width at the root, as a fraction of its cell
    this.range = { bottom: 0.45, top: 1.45 }; // local heights the gradient runs between
    this.opacity = 1;
    this.drag = new Vector3(); // how far the tips trail (local meters)
    // Opt in to hardBindForSubMesh, which Babylon only calls for plugins that ask.
    this.registerForExtraEvents = true;
    this._enable(true);
  }

  getClassName() {
    return 'FurMaterialPlugin';
  }

  /** @param {import('@babylonjs/core').MaterialDefines} defines */
  prepareDefinesBeforeAttributes(defines) {
    defines.FURSHELLS = true;
  }

  /** @param {string[]} attributes */
  getAttributes(attributes) {
    attributes.push('furBase', 'furShell');
  }

  getUniforms() {
    const declarations = `
      uniform vec3 furTop;
      uniform vec3 furBottom;
      uniform float furDensity;
      uniform float furThickness;
      uniform vec2 furRange;
      uniform float furOpacity;
      uniform vec3 furDrag;`;
    return {
      ubo: [
        { name: 'furTop', size: 3, type: 'vec3' },
        { name: 'furBottom', size: 3, type: 'vec3' },
        { name: 'furDensity', size: 1, type: 'float' },
        { name: 'furThickness', size: 1, type: 'float' },
        { name: 'furRange', size: 2, type: 'vec2' },
        { name: 'furOpacity', size: 1, type: 'float' },
        { name: 'furDrag', size: 3, type: 'vec3' },
      ],
      vertex: declarations,
      fragment: declarations,
    };
  }

  /** @param {import('@babylonjs/core').UniformBuffer} uniformBuffer */
  hardBindForSubMesh(uniformBuffer) {
    uniformBuffer.updateColor3('furTop', this.top);
    uniformBuffer.updateColor3('furBottom', this.bottom);
    uniformBuffer.updateFloat('furDensity', this.density);
    uniformBuffer.updateFloat('furThickness', this.thickness);
    uniformBuffer.updateFloat2('furRange', this.range.bottom, this.range.top);
    uniformBuffer.updateFloat('furOpacity', this.opacity);
    uniformBuffer.updateVector3('furDrag', this.drag);
  }

  /** @param {string} shaderType */
  getCustomCode(shaderType) {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
          attribute vec3 furBase;
          attribute float furShell;
          varying vec3 vFurBase;
          varying float vFurShell;`,
        // The tips trail behind (and droop a little); the roots stay put.
        CUSTOM_VERTEX_UPDATE_POSITION: `
          #ifdef FURSHELLS
            positionUpdated += (furDrag + vec3(0.0, -0.006, 0.0)) * furShell * furShell;
          #endif`,
        CUSTOM_VERTEX_MAIN_END: `
          vFurBase = furBase;
          vFurShell = furShell;`,
      };
    }
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        varying vec3 vFurBase;
        varying float vFurShell;

        // A random number 0..1 for each cell of the strand grid ("hash without sine").
        float furHash(vec3 p3) {
          p3 = fract(p3 * 0.1031);
          p3 += dot(p3, p3.zyx + 31.32);
          return fract((p3.x + p3.y) * p3.z);
        }`,
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
        #ifdef FURSHELLS
          // See-through by dithering: skip a scattered share of pixels.
          if (furOpacity < 0.999) {
            float furDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (furDither > furOpacity) discard;
          }
          vec3 furCell = vFurBase * furDensity;
          vec3 furId = floor(furCell);
          float furRandom = furHash(furId);
          float furLength = 0.55 + 0.45 * furRandom; // strands vary in length
          float furAlong = vFurShell / furLength; // 0 at the root, 1 at this strand's tip
          if (vFurShell > 0.0) { // shell 0 is solid skin
            if (furAlong > 1.0) discard;
            vec3 furJitter = vec3(furHash(furId + 7.0), furHash(furId + 19.0), furHash(furId + 31.0)) - 0.5;
            vec3 furOffset = fract(furCell) - 0.5 - 0.35 * furJitter;
            if (length(furOffset) > furThickness * (1.0 - furAlong)) discard;
          }
        #endif`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        #ifdef FURSHELLS
          float furHeight = clamp((vFurBase.y - furRange.x) / (furRange.y - furRange.x), 0.0, 1.0);
          vec3 furColor = mix(furBottom, furTop, smoothstep(0.15, 0.85, furHeight));
          // Dark at the roots, where the strands shade each other; each strand a little different.
          diffuseColor = furColor * mix(0.72, 1.12, clamp(furAlong, 0.0, 1.0)) * (0.92 + 0.16 * furRandom);
        #endif`,
    };
  }
}
