import { MeshBuilder, Vector3 } from '@babylonjs/core';
import { createRandom } from '../math/noise.js';
import { COLLIDER_HEIGHT, COLORS, FLOWER_COLORS, LAYER } from './style.js';

// Pieces both yards are built from: houses, trees, flower beds and mailboxes. Units are
// meters; see greybox.js for the kit.

/**
 * A house: walls, a hip roof, and a garage door, a front door and windows on the front wall
 * (thin slabs poking 3 cm out of it).
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {{ left: number, right: number, front: number, back: number, wallHeight: number }} house
 * @param {{ walls: string, roof: string, garageX: number, door: { x: number, color: string },
 *   windows: [number, number][] }} look windows: [x, width] pairs.
 */
export function buildHouse(kit, house, look) {
  const width = house.right - house.left;
  const depth = house.back - house.front;
  const centerX = (house.left + house.right) / 2;
  const centerZ = (house.front + house.back) / 2;
  kit.block('house', {
    size: [width, house.wallHeight, depth],
    at: [centerX, 0, centerZ],
    color: look.walls,
  });
  const overhang = 0.5;
  kit.pyramid('roof', {
    size: [width + overhang * 2, 2.4, depth + overhang * 2],
    at: [centerX, house.wallHeight, centerZ],
    color: look.roof,
  });

  const faceZ = house.front - 0.03;
  kit.block('garageDoor', {
    size: [4.2, 2.3, 0.1],
    at: [look.garageX, 0, faceZ],
    color: COLORS.garageDoor,
  });
  kit.block('frontDoor', {
    size: [1, 2.1, 0.1],
    at: [look.door.x, 0, faceZ],
    color: look.door.color,
  });
  for (const [x, windowWidth] of look.windows) {
    kit.block('window', { size: [windowWidth, 1.2, 0.1], at: [x, 1, faceZ], color: COLORS.window });
  }
}

/**
 * A tree standing in a ring of mulch. Its leaves aren't solid, and fade out when they get
 * between the camera and you (see ThirdPersonCamera).
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {{ x: number, z: number, radiusX: number, radiusZ: number }} ring
 * @param {number} size 1 = our big tree.
 */
export function buildTree(kit, ring, size) {
  mulchDisc(kit, 'treeRing', ring);
  const trunkHeight = 2.4 * size;
  kit.cylinder('treeTrunk', {
    diameter: 0.35 * size,
    height: trunkHeight,
    at: [ring.x, 0, ring.z],
    color: COLORS.trunk,
  });
  const canopy = kit.blob('treeCanopy', {
    radius: 1.9 * size,
    at: [ring.x, trunkHeight - 0.6 * size, ring.z],
    color: COLORS.leaves,
    squash: 0.85,
    solid: false,
  });
  canopy.metadata = { seeThrough: true };
}

/**
 * A flower bed out in the lawn: mulch with a stone edging, flowers on leafy clumps, and a
 * tall invisible collider that keeps the mower (and you) out of the flowers.
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {string} name
 * @param {{ x: number, z: number, radiusX: number, radiusZ: number }} bed
 * @param {{ seed: number, flowers: number }} planting
 */
export function buildFlowerBed(kit, name, bed, planting) {
  const scene = kit.scene;
  mulchDisc(kit, name, bed);

  const outline = [];
  for (let i = 0; i <= 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    outline.push(
      new Vector3(
        bed.x + Math.cos(angle) * bed.radiusX,
        0.03,
        bed.z + Math.sin(angle) * bed.radiusZ,
      ),
    );
  }
  const edging = MeshBuilder.CreateTube(`${name}Edging`, { path: outline, radius: 0.05 }, scene);
  kit.addSolid(edging, COLORS.edging, false);

  const random = createRandom(planting.seed);
  const flowers = [];
  const leaves = [];
  for (let i = 0; i < planting.flowers; i++) {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * 0.8; // spread evenly over the ellipse
    const x = bed.x + Math.cos(angle) * bed.radiusX * reach;
    const z = bed.z + Math.sin(angle) * bed.radiusZ * reach;
    leaves.push(
      kit.blob('flowerLeaves', {
        radius: 0.13 + random() * 0.06,
        at: [x, 0, z],
        color: COLORS.bush,
        squash: 0.7,
        solid: false,
      }),
    );
    flowers.push(
      kit.blob('flower', {
        radius: 0.05 + random() * 0.03,
        at: [x + (random() - 0.5) * 0.1, 0.16 + random() * 0.06, z + (random() - 0.5) * 0.1],
        color: FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)],
        solid: false,
      }),
    );
  }
  kit.merge(`${name}Leaves`, leaves).checkCollisions = false;
  // Flowers keep their own colors, so they're merged per color by the material.
  for (const color of FLOWER_COLORS) {
    const same = flowers.filter((flower) => flower.material === kit.material(color));
    if (same.length > 0) kit.merge(`${name}Flowers${color}`, same).checkCollisions = false;
  }

  const collider = MeshBuilder.CreateCylinder(
    `${name}Collider`,
    { diameter: 2, height: COLLIDER_HEIGHT, tessellation: 24 },
    scene,
  );
  collider.scaling.set(bed.radiusX, 1, bed.radiusZ);
  collider.position.set(bed.x, COLLIDER_HEIGHT / 2, bed.z);
  collider.isVisible = false;
  collider.isPickable = false;
  collider.checkCollisions = true;
}

/**
 * A mailbox on a post, out on the lawn by the driveway.
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {{ x: number, z: number, radiusX: number }} post
 */
export function buildMailbox(kit, post) {
  kit.cylinder('mailboxPost', {
    diameter: post.radiusX,
    height: 1.05,
    at: [post.x, 0, post.z],
    color: COLORS.mailbox,
  });
  kit.block('mailbox', {
    size: [0.25, 0.28, 0.5],
    at: [post.x, 1.05, post.z],
    color: COLORS.mailbox,
  });
}

/**
 * A flat disc of mulch, the shape of an ellipse.
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {string} name
 * @param {{ x: number, z: number, radiusX: number, radiusZ: number }} shape
 */
function mulchDisc(kit, name, shape) {
  const disc = MeshBuilder.CreateDisc(name, { radius: 1, tessellation: 40 }, kit.scene);
  disc.rotation.x = Math.PI / 2; // lie flat, facing up
  disc.scaling.set(shape.radiusX, shape.radiusZ, 1);
  disc.position.set(shape.x, LAYER.mulch, shape.z);
  disc.material = kit.material(COLORS.mulch);
  disc.receiveShadows = true;
}
