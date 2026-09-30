import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  VertexData,
} from '@babylonjs/core';
import { birdPlacement, butterflyPlacement, wingAngle } from './wildlifeMath.js';

const BIRD_COLOR = '#353a45';
const BUTTERFLY_COLORS = ['#ffd23f', '#f7f4ea', '#ff8c42', '#8fb8ff'];

/**
 * A little life about the place: flocks of birds wheeling round high up, and butterflies
 * wandering over the flower beds. Where each is comes from wildlifeMath.js; this just builds
 * them (bodies and flapping wings) and moves them.
 */
export class Wildlife {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {{ flights: { birds: number, flight: import('./wildlifeMath.js').Flight }[],
   *   butterflies: { x: number, y: number, z: number, range: number }[] }} plan Each flock's
   *   circuit and size; each butterfly's home (a flower bed) and how far it strays.
   */
  constructor(scene, plan) {
    this.time = 0;
    const birdMaterial = flat(scene, BIRD_COLOR);
    this.flocks = plan.flights.map(({ birds, flight }) => ({
      flight,
      birds: Array.from({ length: birds }, () => makeFlier(scene, birdMaterial, 0.45, 0.18)),
    }));
    this.butterflies = plan.butterflies.map((home, i) => ({
      home,
      seed: i * 1.9 + 0.7,
      flier: makeFlier(scene, flat(scene, BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length]), 0.09, 0),
    }));
  }

  /** @param {number} dt Seconds since the previous frame. */
  update(dt) {
    this.time += dt;
    const t = this.time;
    this.flocks.forEach(({ flight, birds }, f) => {
      birds.forEach((bird, i) => {
        place(bird, birdPlacement(t, i, flight), wingAngle(t, 11, i * 0.9 + f * 2));
      });
    });
    for (const { home, seed, flier } of this.butterflies) {
      // Butterflies flap fast and wide, and never glide for long.
      const flap = 0.2 + 0.9 * Math.abs(Math.sin(t * 16 + seed));
      place(flier, butterflyPlacement(t, home, home.range, seed), flap);
    }
  }
}

/**
 * @param {ReturnType<typeof makeFlier>} flier
 * @param {import('./wildlifeMath.js').Placement} at
 * @param {number} wing Radians up.
 */
function place(flier, at, wing) {
  flier.root.position.set(at.x, at.y, at.z);
  flier.root.rotation.y = at.heading;
  flier.left.rotation.z = wing;
  flier.right.rotation.z = -wing;
}

/**
 * Something with a body and two wings that hinge along it: a bird (long, swept-back wings)
 * or a butterfly (broad, round ones).
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {StandardMaterial} material
 * @param {number} span Meters from the body to a wingtip.
 * @param {number} body Meters long (0: no body to speak of).
 */
function makeFlier(scene, material, span, body) {
  const root = new TransformNode('flier', scene);
  if (body > 0) {
    const trunk = MeshBuilder.CreateSphere('flierBody', { diameter: body, segments: 8 }, scene);
    trunk.scaling.set(0.55, 0.5, 1.6);
    finish(trunk, material, root);
  }
  const bird = body > 0;
  /** @param {number} side */
  const wing = (side) => {
    const hinge = new TransformNode('wingHinge', scene);
    hinge.parent = root;
    const mesh = new Mesh('wing', scene);
    const data = new VertexData();
    // A bird's wing sweeps back to a point; a butterfly's is a rounded fan.
    const outline = bird
      ? [
          [0, 0.06],
          [span * 0.55, 0.02],
          [span, -0.12],
          [span * 0.4, -0.1],
          [0, -0.06],
        ]
      : Array.from({ length: 9 }, (_, i) => {
          const a = -Math.PI * 0.45 + (i / 8) * Math.PI * 0.9;
          const r = span * (0.75 + 0.25 * Math.cos(a * 2));
          return [Math.cos(a) * r, Math.sin(a) * r * 0.9];
        });
    const positions = [0, 0, 0, ...outline.flatMap(([x, z]) => [x * side, 0, z])];
    /** @type {number[]} */
    const indices = [];
    for (let i = 1; i < outline.length; i++) indices.push(0, i, i + 1);
    const normals = positions.map((_, i) => (i % 3 === 1 ? 1 : 0));
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.applyToMesh(mesh);
    finish(mesh, material, hinge);
    return hinge;
  };
  return { root, left: wing(1), right: wing(-1) };
}

/**
 * @param {Mesh} mesh
 * @param {StandardMaterial} material
 * @param {TransformNode} parent
 */
function finish(mesh, material, parent) {
  mesh.material = material;
  mesh.parent = parent;
  mesh.isPickable = false;
}

/**
 * @param {import('@babylonjs/core').Scene} scene
 * @param {string} hex
 */
function flat(scene, hex) {
  const material = new StandardMaterial(`wildlife${hex}`, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  return material;
}
