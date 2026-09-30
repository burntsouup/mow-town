import { Color3, MaterialPluginBase, Vector3 } from '@babylonjs/core';

/**
 * Draws fur the way the lawn draws grass: as shells (see furGeometry.js). In each shell, only
 * the spots where a strand passes through show, and strands taper and vary in length, so the
 * stack reads as fur. Strands sit on a 3D grid over the skin (not texture coordinates), so
 * there are no seams.
 *
 * For soft, fluffy fur (not spiky), the strands have soft edges: each shell is blended over
 * the ones below it, and fades toward the tips. That works because the shells are drawn from
 * the skin outward, with back faces hidden, and the body is round: the outer layers always
 * land on top. The skin is a separate, solid mesh (a second instance of this plugin), so you
 * can't see through the body.
 *
 * Also: a two-tone gradient from bottom to top, rosy cheeks, darker roots, a soft sheen
 * around the edges (fur catches the light at grazing angles), tips that trail behind as you
 * move (`drag`), and `opacity`, so the camera can fade the whole thing out smoothly.
 *
 * Lighting is its own, much cheaper than Babylon's: the fur is drawn many layers deep, and
 * running the full light-and-shadow calculation for every layer of every pixel cost more
 * than the rest of the scene. So the material's own lighting is switched off, and each pixel
 * gets a soft "wrapped" sun (light that bends a little way round the edges, as it does
 * through fur) plus sky and ground light. Shadows come from `sunColor`: the owner dims it
 * when the sun is blocked.
 */
export class FurMaterialPlugin extends MaterialPluginBase {
  /** @param {import('@babylonjs/core').Material} material */
  constructor(material) {
    super(material, 'FurShells', 200, { FURSHELLS: false });
    this.top = new Color3(1, 0.82, 0.4);
    this.bottom = new Color3(1, 0.48, 0.33);
    this.cheek = new Color3(1, 0.62, 0.6);
    this.density = 160; // strands per meter
    this.thickness = 0.45; // strand width at the root, as a fraction of its cell
    this.softness = 0.12; // how blurry a strand's edge is, as a fraction of its cell
    this.sheen = 0.35; // how much the edges glow
    this.range = { bottom: 0, top: 1 }; // local heights the gradient runs between
    /** @type {Vector3[]} Middles of the cheeks (local), and their radius. */
    this.cheeks = [new Vector3(), new Vector3()];
    this.cheekRadius = 0.08;
    this.opacity = 1;
    this.drag = new Vector3(); // how far the tips trail (local meters)
    this.wobble = 0; // meters: the body's surface ripples gently, like jelly
    this.time = 0; // seconds, for the ripple
    this.sunDirection = new Vector3(0, 1, 0); // toward the sun (world)
    this.sunColor = new Color3(1, 1, 1); // its color times its strength (dim it in shade)
    this.skyColor = new Color3(0.4, 0.45, 0.5); // light from above...
    this.groundColor = new Color3(0.3, 0.3, 0.2); // ...and bounced up from below
    material.disableLighting = true; // see above: lit in getCustomCode instead
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
    defines._needNormals = true; // smooth normals for the lighting, though Babylon's is off
  }

  /** @param {string[]} attributes */
  getAttributes(attributes) {
    attributes.push('furBase', 'furShell');
  }

  getUniforms() {
    const declarations = `
      uniform vec3 furTop;
      uniform vec3 furBottom;
      uniform vec3 furCheek;
      uniform vec3 furCheekLeft;
      uniform vec3 furCheekRight;
      uniform float furCheekRadius;
      uniform float furDensity;
      uniform float furThickness;
      uniform float furSoftness;
      uniform float furSheen;
      uniform vec2 furRange;
      uniform float furOpacity;
      uniform vec3 furDrag;
      uniform float furWobble;
      uniform float furTime;
      uniform vec3 furSunDirection;
      uniform vec3 furSunColor;
      uniform vec3 furSkyColor;
      uniform vec3 furGroundColor;`;
    return {
      ubo: [
        { name: 'furTop', size: 3, type: 'vec3' },
        { name: 'furBottom', size: 3, type: 'vec3' },
        { name: 'furCheek', size: 3, type: 'vec3' },
        { name: 'furCheekLeft', size: 3, type: 'vec3' },
        { name: 'furCheekRight', size: 3, type: 'vec3' },
        { name: 'furCheekRadius', size: 1, type: 'float' },
        { name: 'furDensity', size: 1, type: 'float' },
        { name: 'furThickness', size: 1, type: 'float' },
        { name: 'furSoftness', size: 1, type: 'float' },
        { name: 'furSheen', size: 1, type: 'float' },
        { name: 'furRange', size: 2, type: 'vec2' },
        { name: 'furOpacity', size: 1, type: 'float' },
        { name: 'furDrag', size: 3, type: 'vec3' },
        { name: 'furWobble', size: 1, type: 'float' },
        { name: 'furTime', size: 1, type: 'float' },
        { name: 'furSunDirection', size: 3, type: 'vec3' },
        { name: 'furSunColor', size: 3, type: 'vec3' },
        { name: 'furSkyColor', size: 3, type: 'vec3' },
        { name: 'furGroundColor', size: 3, type: 'vec3' },
      ],
      vertex: declarations,
      fragment: declarations,
    };
  }

  /** @param {import('@babylonjs/core').UniformBuffer} uniformBuffer */
  hardBindForSubMesh(uniformBuffer) {
    uniformBuffer.updateColor3('furTop', this.top);
    uniformBuffer.updateColor3('furBottom', this.bottom);
    uniformBuffer.updateColor3('furCheek', this.cheek);
    uniformBuffer.updateVector3('furCheekLeft', this.cheeks[0]);
    uniformBuffer.updateVector3('furCheekRight', this.cheeks[1]);
    uniformBuffer.updateFloat('furCheekRadius', this.cheekRadius);
    uniformBuffer.updateFloat('furDensity', this.density);
    uniformBuffer.updateFloat('furThickness', this.thickness);
    uniformBuffer.updateFloat('furSoftness', this.softness);
    uniformBuffer.updateFloat('furSheen', this.sheen);
    uniformBuffer.updateFloat2('furRange', this.range.bottom, this.range.top);
    uniformBuffer.updateFloat('furOpacity', this.opacity);
    uniformBuffer.updateVector3('furDrag', this.drag);
    uniformBuffer.updateFloat('furWobble', this.wobble);
    uniformBuffer.updateFloat('furTime', this.time);
    uniformBuffer.updateVector3('furSunDirection', this.sunDirection);
    uniformBuffer.updateColor3('furSunColor', this.sunColor);
    uniformBuffer.updateColor3('furSkyColor', this.skyColor);
    uniformBuffer.updateColor3('furGroundColor', this.groundColor);
  }

  /** @param {string} shaderType */
  getCustomCode(shaderType) {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
          attribute vec3 furBase;
          attribute float furShell;
          varying vec3 vFurBase;
          varying vec3 vFurNormal;
          varying float vFurShell;`,
        // The whole surface ripples gently (skin and fur together, since they share furBase),
        // and the tips trail behind and droop a little (combed down).
        CUSTOM_VERTEX_UPDATE_POSITION: `
          #ifdef FURSHELLS
            float furRipple = sin(furTime * 4.0 + furBase.y * 9.0 + furBase.x * 5.0)
              + 0.6 * sin(furTime * 2.7 - furBase.z * 7.0 + furBase.y * 4.0);
            positionUpdated += normal * furWobble * furRipple;
            positionUpdated += (furDrag + vec3(0.0, -0.012, 0.0)) * furShell * furShell;
          #endif`,
        CUSTOM_VERTEX_MAIN_END: `
          vFurBase = furBase;
          vFurNormal = normal;
          vFurShell = furShell;`,
      };
    }
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        varying vec3 vFurBase;
        varying vec3 vFurNormal;
        varying float vFurShell;

        // A random number 0..1 for each cell of the strand grid ("hash without sine").
        float furHash(vec3 p3) {
          p3 = fract(p3 * 0.1031);
          p3 += dot(p3, p3.zyx + 31.32);
          return fract((p3.x + p3.y) * p3.z);
        }`,
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
        #ifdef FURSHELLS
          vec3 furCell = vFurBase * furDensity;
          vec3 furId = floor(furCell);
          float furRandom = furHash(furId);
          float furLength = 0.6 + 0.4 * furRandom; // strands vary in length
          float furAlong = vFurShell / furLength; // 0 at the root, 1 at this strand's tip
          float furCoverage = 1.0;
          if (vFurShell > 0.0) { // shell 0 is solid skin
            if (furAlong > 1.0) discard;
            vec3 furJitter = vec3(furHash(furId + 7.0), furHash(furId + 19.0), furHash(furId + 31.0)) - 0.5;
            // How far from the strand, measured along the skin (ignoring depth into it), so
            // strands come out round wherever the skin cuts through the grid.
            vec3 furNormal = normalize(vFurNormal);
            vec3 furOffset = fract(furCell) - 0.5 - 0.35 * furJitter;
            float furDistance = length(furOffset - dot(furOffset, furNormal) * furNormal);
            float furRadius = furThickness * (1.0 - 0.8 * furAlong);
            // A soft edge instead of a hard one: fluffy, not spiky.
            furCoverage = 1.0 - smoothstep(furRadius - furSoftness, furRadius + furSoftness, furDistance);
            furCoverage *= 1.0 - 0.5 * furAlong * furAlong; // wispy toward the tips
            if (furCoverage < 0.02) discard;
          }
        #endif`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        #ifdef FURSHELLS
          float furHeight = clamp((vFurBase.y - furRange.x) / (furRange.y - furRange.x), 0.0, 1.0);
          vec3 furColor = mix(furBottom, furTop, smoothstep(0.1, 0.9, furHeight));
          float furCheeks = max(
            1.0 - smoothstep(0.4, 1.0, distance(vFurBase, furCheekLeft) / furCheekRadius),
            1.0 - smoothstep(0.4, 1.0, distance(vFurBase, furCheekRight) / furCheekRadius));
          furColor = mix(furColor, furCheek, 0.75 * furCheeks);
          // A little darker at the roots, where the strands shade each other.
          diffuseColor = furColor * mix(0.78, 1.08, clamp(furAlong, 0.0, 1.0)) * (0.95 + 0.1 * furRandom);
        #endif`,
      // Our own lighting (see the class comment), and the sheen: fur catches the light at
      // grazing angles, a soft glow around the silhouette.
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifdef FURSHELLS
          float furWrapped = max(0.0, (dot(normalW, furSunDirection) + 0.45) / 1.45);
          vec3 furLight = furSunColor * furWrapped + mix(furGroundColor, furSkyColor, normalW.y * 0.5 + 0.5);
          color.rgb = diffuseColor * furLight;
          float furRim = pow(1.0 - clamp(dot(normalW, viewDirectionW), 0.0, 1.0), 2.5);
          color.rgb += furSheen * furRim * mix(furTop, vec3(1.0), 0.25) * (0.3 + 0.7 * clamp(furAlong, 0.0, 1.0));
          // (Here, not in the "update alpha" hook: Babylon only includes that one for
          // materials with a diffuse texture.)
          color.a *= furCoverage * furOpacity;
        #endif`,
    };
  }
}
