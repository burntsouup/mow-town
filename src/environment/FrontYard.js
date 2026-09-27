import { MeshBuilder, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import { createRandom, createValueNoise, fractalNoise, smoothstep } from '../math/noise.js';
import { circle, growShape, insideShape } from '../math/shapes.js';
import { Greybox } from './greybox.js';

// Units are meters. +x = right (toward the garage), +z = away from the street, y = up.
// The street runs along x at the front; the house faces the street.

const COLORS = {
  ground: '#5b8a3c', // the neighbors' lawns
  street: '#3a3b3f',
  streetLine: '#d9b64a',
  sidewalk: '#b9b6ad',
  concrete: '#c4c0b6',
  walls: '#e3dccd',
  roof: '#5a5552',
  garageDoor: '#f1efe9',
  frontDoor: '#8c3b2e',
  window: '#3f4f5f',
  trunk: '#6b4a32',
  leaves: '#4a7a34',
  bush: '#3f6e2e',
  bin: '#35524a',
  mailbox: '#2f3136',
  mulch: '#5b4331',
  edging: '#9a8f82',
  fence: '#a0876a',
  ball: '#d63b3b',
  truck: '#f2b632',
  tire: '#26272b',
};
const FLOWER_COLORS = ['#e84a5f', '#f7c948', '#f4f1ea', '#b565d9', '#ff8f3d'];

// Flat surfaces are stacked a few millimeters apart so they don't flicker ("z-fighting").
const LAYER = { mulch: 0.008, street: 0.01, marking: 0.02, sidewalk: 0.02, paving: 0.03 };
// Where two flat surfaces meet at different heights, the lower one extends this far under
// the higher one. Otherwise, at low camera angles, you can see the lawn through the seam.
const SEAM_OVERLAP = 0.1;
/** Invisible colliders are this tall: low ones would let the player slide over them. */
const COLLIDER_HEIGHT = 1.6;

const HOUSE = { left: -8, right: 8, front: 1.5, back: 11.5, wallHeight: 3.2 };
const SIDEWALK = { front: -12, back: -10.5 };
const DRIVEWAY = { width: 5, centerX: 4.5 };
const WALKWAY = { centerX: -2, width: 1.2 };
/** A low wooden fence along the left of the lot, turning in to meet the house. */
const FENCE = { x: -13.9, back: 1.6, height: 1 };
/** The mowable front lawn: fence to driveway, sidewalk to the flower bed along the house. */
const LAWN = {
  left: -13.75,
  right: DRIVEWAY.centerX - DRIVEWAY.width / 2,
  front: SIDEWALK.back,
  back: -0.3,
};
/** Things on the lawn, as shapes in world meters (see math/shapes.js). */
const SPOTS = {
  walkway: {
    kind: /** @type {const} */ ('rect'),
    minX: WALKWAY.centerX - WALKWAY.width / 2,
    maxX: WALKWAY.centerX + WALKWAY.width / 2,
    minZ: SIDEWALK.back,
    maxZ: HOUSE.front,
  },
  flowerBed: {
    kind: /** @type {const} */ ('ellipse'),
    x: -11.2,
    z: -3,
    radiusX: 1.5,
    radiusZ: 0.85,
  },
  tree: circle(-7.6, -6.6, 0.65), // a ring of mulch around the trunk
  ball: circle(-4.6, -8.7, 0.16),
  truck: {
    kind: /** @type {const} */ ('rect'),
    minX: -10.65,
    maxX: -10.15,
    minZ: -9.05,
    maxZ: -8.75,
  },
  mailbox: circle(1.2, SIDEWALK.back + 0.4, 0.08),
};

/**
 * Builds the greybox level: a house with a fenced front lawn to mow (with a tree, a flower
 * bed and a couple of toys in the way), a driveway, the street and a few props.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').ShadowGenerator} shadows
 */
export function createFrontYard(scene, shadows) {
  const kit = new Greybox(scene, shadows);

  const ground = MeshBuilder.CreateGround('ground', { width: 400, height: 400 }, scene);
  ground.material = kit.material(COLORS.ground);
  ground.receiveShadows = true;

  buildStreet(kit);
  buildDriveway(kit);
  buildHouse(kit);
  buildFence(kit);
  buildBeds(kit);
  buildPlants(kit);
  buildToys(kit);
  buildProps(kit);
  buildBounds(kit);

  // Start at the street end of the driveway, facing the house (yaw 0 = toward +z).
  const spawn = { position: [DRIVEWAY.centerX, 0, SIDEWALK.back + 1], yaw: 0 };
  // The mower waits on the driveway, pointing at the lawn (yaw -π/2 = toward -x).
  const mowerSpot = { position: [DRIVEWAY.centerX - 1.3, 0, SIDEWALK.back + 3], yaw: -Math.PI / 2 };

  // The jobs, in order (see game/jobList.js).
  /** @type {import('../game/jobList.js').JobDefinition[]} */
  const jobs = [
    {
      id: 'frontLawn',
      name: 'the front lawn',
      title: 'Mow the front lawn',
      hint: 'Overlap your rows a little. Hold F to see what you missed',
      doneTitle: 'Lawn mowed!',
      summary: 'Front lawn mowed in',
    },
  ];

  return { ground, spawn, mowerSpot, jobs, lawn: frontLawn() };
}

/**
 * Where the lawn is and how long the grass starts out. `heightAt` takes lawn-local meters
 * (from the lawn's front-left corner) and returns 0 where there's no lawn.
 */
function frontLawn() {
  const width = LAWN.right - LAWN.left;
  const depth = LAWN.back - LAWN.front;
  const noise = createValueNoise(21);
  const thickNoise = createValueNoise(7);
  const [shortest, tallest] = config.grass.uncutHeight;
  // Grass stops a few centimeters short of beds and toys, so it doesn't poke through them.
  const notLawn = [
    SPOTS.walkway,
    growShape(SPOTS.flowerBed, 0.04),
    SPOTS.tree,
    growShape(SPOTS.ball, 0.02),
    growShape(SPOTS.truck, 0.03),
    SPOTS.mailbox,
  ];
  /** Thick, lush patches: 0 in most of the lawn, up to 1 in a few blobs. */
  const thickness = (/** @type {number} */ x, /** @type {number} */ z) =>
    smoothstep(0.64, 0.78, fractalNoise(thickNoise, x * 0.3, z * 0.3, 2));
  /** @param {number} x @param {number} z */
  const heightAt = (x, z) => {
    const worldX = LAWN.left + x;
    const worldZ = LAWN.front + z;
    if (notLawn.some((shape) => insideShape(shape, worldX, worldZ))) return 0;
    const height = shortest + (tallest - shortest) * fractalNoise(noise, x * 0.6, z * 0.6, 3);
    return height + (tallest - height) * thickness(x, z); // thick grass grows tall
  };
  return {
    center: [(LAWN.left + LAWN.right) / 2, (LAWN.front + LAWN.back) / 2],
    width,
    depth,
    heightAt,
    densityAt: (/** @type {number} */ x, /** @type {number} */ z) => 1 + 1.5 * thickness(x, z),
  };
}

/** @param {Greybox} kit */
function buildStreet(kit) {
  const streetWidth = 7;
  const streetZ = SIDEWALK.front - streetWidth / 2;
  kit.flat('street', {
    size: [400, streetWidth + SEAM_OVERLAP],
    at: [0, LAYER.street, streetZ + SEAM_OVERLAP / 2],
    color: COLORS.street,
  });
  kit.flat('streetLine', {
    size: [400, 0.12],
    at: [0, LAYER.marking, streetZ],
    color: COLORS.streetLine,
  });
  const sidewalkWidth = SIDEWALK.back - SIDEWALK.front;
  kit.flat('sidewalk', {
    size: [400, sidewalkWidth + SEAM_OVERLAP],
    at: [0, LAYER.sidewalk, SIDEWALK.front + (sidewalkWidth + SEAM_OVERLAP) / 2],
    color: COLORS.sidewalk,
  });
}

/**
 * The driveway runs from the sidewalk to the garage door.
 *
 * @param {Greybox} kit
 */
function buildDriveway(kit) {
  const length = HOUSE.front - SIDEWALK.back;
  return kit.flat('driveway', {
    size: [DRIVEWAY.width, length],
    at: [DRIVEWAY.centerX, LAYER.paving, HOUSE.front - length / 2],
    color: COLORS.concrete,
  });
}

/** @param {Greybox} kit */
function buildHouse(kit) {
  const width = HOUSE.right - HOUSE.left;
  const depth = HOUSE.back - HOUSE.front;
  const centerX = (HOUSE.left + HOUSE.right) / 2;
  const centerZ = (HOUSE.front + HOUSE.back) / 2;

  kit.block('house', {
    size: [width, HOUSE.wallHeight, depth],
    at: [centerX, 0, centerZ],
    color: COLORS.walls,
  });
  const overhang = 0.5;
  kit.pyramid('roof', {
    size: [width + overhang * 2, 2.4, depth + overhang * 2],
    at: [centerX, HOUSE.wallHeight, centerZ],
    color: COLORS.roof,
  });

  // Doors and windows are thin slabs poking 3 cm out of the front wall.
  const faceZ = HOUSE.front - 0.03;
  kit.block('garageDoor', {
    size: [4.2, 2.3, 0.1],
    at: [DRIVEWAY.centerX, 0, faceZ],
    color: COLORS.garageDoor,
  });
  kit.block('frontDoor', {
    size: [1, 2.1, 0.1],
    at: [WALKWAY.centerX, 0, faceZ],
    color: COLORS.frontDoor,
  });
  kit.block('windowLeft', { size: [1.6, 1.2, 0.1], at: [-5.5, 1, faceZ], color: COLORS.window });
  kit.block('windowRight', { size: [1.3, 1.2, 0.1], at: [0.2, 1, faceZ], color: COLORS.window });

  const walkway = SPOTS.walkway;
  kit.flat('walkway', {
    size: [walkway.maxX - walkway.minX, walkway.maxZ - walkway.minZ],
    at: [WALKWAY.centerX, LAYER.paving, (walkway.minZ + walkway.maxZ) / 2],
    color: COLORS.concrete,
  });
}

/**
 * A low wooden fence down the left side of the lot, then across to the house.
 *
 * @param {Greybox} kit
 */
function buildFence(kit) {
  /** @type {[number, number, number, number][]} Axis-aligned [x1, z1, x2, z2] runs. */
  const runs = [
    [FENCE.x, SIDEWALK.back, FENCE.x, FENCE.back],
    [FENCE.x, FENCE.back, HOUSE.left, FENCE.back],
  ];
  const postSpacing = 2;
  const parts = [];
  for (const [x1, z1, x2, z2] of runs) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const alongX = z1 === z2;
    // Two rails; the lower one, a solid board, is what you bump into.
    for (const [y, height] of [
      [0.05, 0.45],
      [0.7, 0.12],
    ]) {
      parts.push(
        kit.block('fenceRail', {
          size: alongX ? [length, height, 0.06] : [0.06, height, length],
          at: [(x1 + x2) / 2, y, (z1 + z2) / 2],
          color: COLORS.fence,
        }),
      );
    }
    const posts = Math.ceil(length / postSpacing);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      parts.push(
        kit.block('fencePost', {
          size: [0.1, FENCE.height, 0.1],
          at: [x1 + (x2 - x1) * t, 0, z1 + (z2 - z1) * t],
          color: COLORS.fence,
        }),
      );
    }
    // The gap between the rails would let things through, so an invisible wall backs it up.
    kit.invisibleWall('fenceCollider', {
      size: alongX ? [length, COLLIDER_HEIGHT, 0.06] : [0.06, COLLIDER_HEIGHT, length],
      at: [(x1 + x2) / 2, 0, (z1 + z2) / 2],
    });
  }
  kit.merge('fence', parts);
}

/**
 * Mulch beds: along the front of the house, a ring around the tree, and a flower bed out in
 * the lawn with a stone edging and flowers.
 *
 * @param {Greybox} kit
 */
function buildBeds(kit) {
  const scene = kit.scene;
  kit.flat('houseBed', {
    size: [LAWN.right - FENCE.x, FENCE.back - LAWN.back],
    at: [(FENCE.x + LAWN.right) / 2, LAYER.mulch, (LAWN.back + FENCE.back) / 2],
    color: COLORS.mulch,
  });

  const { tree, flowerBed } = SPOTS;
  for (const [name, shape] of /** @type {const} */ ([
    ['treeRing', tree],
    ['flowerBed', flowerBed],
  ])) {
    const disc = MeshBuilder.CreateDisc(name, { radius: 1, tessellation: 40 }, scene);
    disc.rotation.x = Math.PI / 2; // lie flat, facing up
    disc.scaling.set(shape.radiusX, shape.radiusZ, 1);
    disc.position.set(shape.x, LAYER.mulch, shape.z);
    disc.material = kit.material(COLORS.mulch);
    disc.receiveShadows = true;
  }

  // Stone edging around the flower bed.
  const outline = [];
  for (let i = 0; i <= 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    outline.push(
      new Vector3(
        flowerBed.x + Math.cos(angle) * flowerBed.radiusX,
        0.03,
        flowerBed.z + Math.sin(angle) * flowerBed.radiusZ,
      ),
    );
  }
  const edging = MeshBuilder.CreateTube('bedEdging', { path: outline, radius: 0.05 }, scene);
  kit.addSolid(edging, COLORS.edging, false);

  // Flowers: little colored balls on leafy clumps, scattered inside the bed.
  const random = createRandom(5);
  const flowers = [];
  const leaves = [];
  for (let i = 0; i < 26; i++) {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * 0.8; // spread evenly over the ellipse
    const x = flowerBed.x + Math.cos(angle) * flowerBed.radiusX * reach;
    const z = flowerBed.z + Math.sin(angle) * flowerBed.radiusZ * reach;
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
  kit.merge('flowerLeaves', leaves).checkCollisions = false;
  // Flowers keep their own colors, so they're merged per color by the material.
  for (const color of FLOWER_COLORS) {
    const same = flowers.filter((flower) => flower.material === kit.material(color));
    if (same.length > 0) kit.merge(`flowers${color}`, same).checkCollisions = false;
  }

  // An invisible, tall collider keeps the mower (and you) out of the flowers.
  const fence = MeshBuilder.CreateCylinder(
    'flowerBedCollider',
    { diameter: 2, height: COLLIDER_HEIGHT, tessellation: 24 },
    scene,
  );
  fence.scaling.set(flowerBed.radiusX, 1, flowerBed.radiusZ);
  fence.position.set(flowerBed.x, COLLIDER_HEIGHT / 2, flowerBed.z);
  fence.isVisible = false;
  fence.isPickable = false;
  fence.checkCollisions = true;
}

/** @param {Greybox} kit */
function buildPlants(kit) {
  /** @type {[number, number, number][]} [x, z, size] */
  const trees = [
    [SPOTS.tree.x, SPOTS.tree.z, 1],
    [11, -7, 0.8], // the neighbor's, across the driveway
  ];
  for (const [x, z, size] of trees) {
    const trunkHeight = 2.4 * size;
    kit.cylinder('treeTrunk', {
      diameter: 0.35 * size,
      height: trunkHeight,
      at: [x, 0, z],
      color: COLORS.trunk,
    });
    kit.blob('treeCanopy', {
      radius: 1.9 * size,
      at: [x, trunkHeight - 0.6 * size, z],
      color: COLORS.leaves,
      squash: 0.85,
      solid: false,
    });
  }

  // A row of bushes in the bed along the front of the house, skipping the door and garage.
  for (const x of [-12.9, -11.5, -10.1, -7.4, -6.2, -5, -3.7, -0.4, 0.8]) {
    kit.blob('bush', {
      radius: 0.6,
      at: [x, 0, HOUSE.front - 0.7],
      color: COLORS.bush,
      squash: 0.8,
    });
  }
}

/**
 * Toys left out on the lawn: a ball and a toy dump truck, each with a tall invisible
 * collider, since Babylon would slide the mower up and over something this low.
 *
 * @param {Greybox} kit
 */
function buildToys(kit) {
  const { ball, truck } = SPOTS;
  kit.blob('ball', {
    radius: ball.radiusX,
    at: [ball.x, 0, ball.z],
    color: COLORS.ball,
    solid: false,
  });
  kit.invisibleWall('ballCollider', {
    size: [ball.radiusX * 2, COLLIDER_HEIGHT, ball.radiusX * 2],
    at: [ball.x, 0, ball.z],
  });

  const x = (truck.minX + truck.maxX) / 2;
  const z = (truck.minZ + truck.maxZ) / 2;
  const length = truck.maxX - truck.minX;
  const width = truck.maxZ - truck.minZ;
  const parts = [
    kit.block('truckBed', {
      size: [length * 0.6, 0.12, width * 0.9],
      at: [x - length * 0.18, 0.06, z],
      color: COLORS.truck,
      solid: false,
    }),
    kit.block('truckCab', {
      size: [length * 0.3, 0.16, width * 0.8],
      at: [x + length * 0.3, 0.05, z],
      color: COLORS.truck,
      solid: false,
    }),
  ];
  for (const dx of [-0.32, 0.32]) {
    for (const dz of [-0.5, 0.5]) {
      const wheel = kit.cylinder('truckWheel', {
        diameter: 0.09,
        height: 0.04,
        at: [x + dx * length, 0, z + dz * width],
        color: COLORS.tire,
      });
      wheel.checkCollisions = false;
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = 0.045;
      parts.push(wheel);
    }
  }
  kit.merge('toyTruck', parts).checkCollisions = false;
  kit.invisibleWall('truckCollider', {
    size: [length, COLLIDER_HEIGHT, width],
    at: [x, 0, z],
  });
}

/** @param {Greybox} kit */
function buildProps(kit) {
  // Trash bins beside the garage.
  kit.block('trashBin', { size: [0.6, 1.05, 0.7], at: [7.5, 0, 0.8], color: COLORS.bin });
  kit.block('trashBin', { size: [0.6, 1.05, 0.7], at: [7.5, 0, 0], color: COLORS.bin });

  // Mailbox at the end of the driveway, out on the lawn.
  const { mailbox } = SPOTS;
  kit.cylinder('mailboxPost', {
    diameter: mailbox.radiusX,
    height: 1.05,
    at: [mailbox.x, 0, mailbox.z],
    color: COLORS.mailbox,
  });
  kit.block('mailbox', {
    size: [0.25, 0.28, 0.5],
    at: [mailbox.x, 1.05, mailbox.z],
    color: COLORS.mailbox,
  });
}

/**
 * Invisible walls around the playable area, so the player can't wander off into the fog.
 * You can step onto the street, but not past the far side of it.
 *
 * @param {Greybox} kit
 */
function buildBounds(kit) {
  const bounds = { left: -16, right: 16, front: SIDEWALK.front - 6.5, back: HOUSE.back + 2 };
  const height = 4;
  const width = bounds.right - bounds.left;
  const depth = bounds.back - bounds.front;
  const centerX = (bounds.left + bounds.right) / 2;
  const centerZ = (bounds.front + bounds.back) / 2;
  kit.invisibleWall('boundsFront', { size: [width, height, 1], at: [centerX, 0, bounds.front] });
  kit.invisibleWall('boundsBack', { size: [width, height, 1], at: [centerX, 0, bounds.back] });
  kit.invisibleWall('boundsLeft', { size: [1, height, depth], at: [bounds.left, 0, centerZ] });
  kit.invisibleWall('boundsRight', { size: [1, height, depth], at: [bounds.right, 0, centerZ] });
}
