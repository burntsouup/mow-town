import { Color3, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import {
  drivewayDirt,
  FENCE_BOARD,
  fenceDirt,
  PATIO_PAVER,
  patioDirt,
} from '../cleaning/dirtPatterns.js';
import { Gate } from './Gate.js';
import { Greybox } from './greybox.js';
import { createBoardTexture, createPaverTexture } from './surfaceTextures.js';

// Units are meters. +x = right (toward the garage), +z = away from the street, y = up.
// The street runs along x at the front; the house faces the street.

const COLORS = {
  lawn: '#5b8a3c',
  street: '#3a3b3f',
  streetLine: '#d9b64a',
  sidewalk: '#b9b6ad',
  concrete: '#c4c0b6',
  patio: '#cdbb9f', // warm stone, tinting the paver texture
  walls: '#e3dccd',
  roof: '#5a5552',
  garageDoor: '#f1efe9',
  frontDoor: '#8c3b2e',
  window: '#3f4f5f',
  fence: '#8c857a', // weathered: the back fence cleans up to warm wood, the rest stays grey
  cleanWood: '#b98a5e',
  trunk: '#6b4a32',
  leaves: '#4a7a34',
  bush: '#3f6e2e',
  bin: '#35524a',
  mailbox: '#2f3136',
};

// Flat surfaces are stacked a few millimeters apart so they don't flicker ("z-fighting").
const LAYER = { street: 0.01, marking: 0.02, sidewalk: 0.02, paving: 0.03 };
// Where two flat surfaces meet at different heights, the lower one extends this far under
// the higher one. Otherwise, at low camera angles, you can see the lawn through the seam.
const SEAM_OVERLAP = 0.1;

const HOUSE = { left: -8, right: 8, front: 1.5, back: 11.5, wallHeight: 3.2 };
const FENCE = { gateZ: 7, back: 24, halfWidth: 12, height: 1.6 };
/** Dirt colors on wood: silvery weathering, mud, and dark water stains. */
const WOOD_DIRT = { light: '#8f8c83', grime: '#5a5249', oil: '#3a342e' };
const PATIO = { width: 6, length: 4, centerX: -2 };
/** Dirt colors on stone pavers: a grey-brown film, packed grime, and barbecue grease. */
const STONE_DIRT = { light: '#9c9280', grime: '#5f5446', oil: '#2a2420' };
const DRIVEWAY = { width: 5, length: 10, centerX: 4.5 };
const SIDEWALK = { front: -10, back: -8.5 };

/**
 * Builds the greybox level: house, driveway, street, fence, trees and a few props.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').ShadowGenerator} shadows
 */
export function createBackyard(scene, shadows) {
  const kit = new Greybox(scene, shadows);

  const ground = MeshBuilder.CreateGround('lawn', { width: 400, height: 400 }, scene);
  ground.material = kit.material(COLORS.lawn);
  ground.receiveShadows = true;

  buildStreet(kit);
  const driveway = buildDriveway(kit);
  buildHouse(kit);
  buildFence(kit);
  // The side gate into the backyard, in the gap between the house and the fence. It's shut
  // until the backyard job starts.
  const gate = new Gate(scene, kit, {
    hinge: [HOUSE.right + 1.5, FENCE.gateZ],
    length: 1.5,
    height: FENCE.height,
    color: COLORS.fence,
    openAngle: Math.PI / 2, // swings into the backyard
    openTime: 1.2,
  });
  const backFence = buildBackFenceFace(scene);
  const patio = buildPatio(scene);
  buildPlants(kit);
  buildProps(kit);
  buildBounds(kit);

  // Start at the street end of the driveway, facing the garage (yaw 0 = toward +z).
  const spawn = { position: [DRIVEWAY.centerX, 0, SIDEWALK.back + 1], yaw: 0 };
  // The pressure washer waits on the lawn beside the driveway, just ahead and to the right.
  const washerSpot = { position: [DRIVEWAY.centerX + 3.2, 0, SIDEWALK.back + 2.5], yaw: -0.5 };

  // Surfaces the player can clean. Their UVs run 0..1 across the mesh: u across (x) and
  // v from the street end to the garage end (z), matching the pattern's x and y in meters.
  const cleanables = [
    {
      mesh: driveway,
      job: 'driveway',
      width: DRIVEWAY.width,
      length: DRIVEWAY.length,
      dirt: drivewayDirt({ width: DRIVEWAY.width, length: DRIVEWAY.length, seed: 1 }),
    },
    {
      // The inside of the back fence: u runs along it (+x), v up from the ground.
      mesh: backFence,
      job: 'backyard',
      width: FENCE.halfWidth * 2,
      length: FENCE.height,
      dirt: fenceDirt({ height: FENCE.height, seed: 4 }),
      texelsPerMeter: 40, // 2.5 cm: plenty for boards, and keeps the long fence affordable
      palette: WOOD_DIRT,
    },
    {
      // The patio behind the house: u across (x), v from the house (z) out into the yard.
      mesh: patio,
      job: 'backyard',
      width: PATIO.width,
      length: PATIO.length,
      dirt: patioDirt({ width: PATIO.width, length: PATIO.length, seed: 6 }),
      texelsPerMeter: 64, // ~1.6 cm, so the 3 cm joints are about two texels wide
      palette: STONE_DIRT,
    },
  ];

  // The jobs, in order. Each cleanable surface above names the job it belongs to.
  /** @type {import('../game/jobList.js').JobDefinition[]} */
  const jobs = [
    {
      id: 'driveway',
      name: 'the driveway',
      title: 'Clean the driveway',
      doneTitle: 'Driveway clean!',
      summary: 'Driveway cleaned in',
    },
    {
      id: 'backyard',
      name: 'the backyard',
      title: 'Clean the backyard: fence and patio',
      hint: 'Through the side gate, next to the garage',
      doneTitle: 'Backyard clean!',
      summary: 'Backyard cleaned in',
      unlocks: 'backyardGate',
    },
  ];
  /** Things a job can open when it starts. */
  const unlockables = { backyardGate: gate };

  return { ground, driveway, spawn, washerSpot, cleanables, jobs, unlockables };
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
 * The driveway runs from the sidewalk to the garage door. It will be the cleanable surface,
 * so it's a separate flat mesh whose UVs cover it exactly once.
 *
 * @param {Greybox} kit
 */
function buildDriveway(kit) {
  return kit.flat('driveway', {
    size: [DRIVEWAY.width, DRIVEWAY.length],
    at: [DRIVEWAY.centerX, LAYER.paving, HOUSE.front - DRIVEWAY.length / 2],
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
  kit.block('frontDoor', { size: [1, 2.1, 0.1], at: [-2, 0, faceZ], color: COLORS.frontDoor });
  kit.block('windowLeft', { size: [1.6, 1.2, 0.1], at: [-5.5, 1, faceZ], color: COLORS.window });
  kit.block('windowRight', { size: [1.3, 1.2, 0.1], at: [0.2, 1, faceZ], color: COLORS.window });

  kit.flat('walkway', {
    size: [1.2, HOUSE.front - SIDEWALK.back],
    at: [-2, LAYER.paving, (HOUSE.front + SIDEWALK.back) / 2],
    color: COLORS.concrete,
  });
}

/**
 * Wooden fence enclosing the backyard, with a gate gap on the driveway side.
 *
 * @param {Greybox} kit
 */
function buildFence(kit) {
  const z = FENCE.gateZ; // where the fence meets the sides of the house
  const back = FENCE.back;
  const lot = FENCE.halfWidth;
  /** @type {[number, number, number, number][]} Axis-aligned [x1, z1, x2, z2] runs. */
  const runs = [
    [-lot, z, HOUSE.left, z],
    [-lot, z, -lot, back],
    [-lot, back, lot, back],
    [lot, z, lot, back],
    [HOUSE.right + 1.5, z, lot, z], // leaves a 1.5 m gate gap next to the house
  ];

  const height = FENCE.height;
  const postSpacing = 2.4;
  const parts = [];
  for (const [x1, z1, x2, z2] of runs) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const alongX = z1 === z2;
    parts.push(
      kit.block('fencePanel', {
        size: alongX ? [length, height, 0.05] : [0.05, height, length],
        at: [(x1 + x2) / 2, 0, (z1 + z2) / 2],
        color: COLORS.fence,
      }),
    );
    const posts = Math.ceil(length / postSpacing);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      parts.push(
        kit.block('fencePost', {
          size: [0.12, height + 0.15, 0.12],
          at: [x1 + (x2 - x1) * t, 0, z1 + (z2 - z1) * t],
          color: COLORS.fence,
        }),
      );
    }
  }
  kit.merge('fence', parts);
}

/**
 * The yard-facing side of the back fence, as its own flat panel so it can get dirty and be
 * cleaned. It sits just in front of the solid fence (which still handles collisions), facing
 * the house; the posts stick out through it.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
function buildBackFenceFace(scene) {
  const width = FENCE.halfWidth * 2;
  const face = MeshBuilder.CreatePlane('backFenceFace', { width, height: FENCE.height }, scene);
  face.position.set(0, FENCE.height / 2, FENCE.back - 0.031);
  face.receiveShadows = true;

  const boardsPerTile = 8;
  const boards = createBoardTexture(scene, {
    boardWidth: FENCE_BOARD.width,
    gap: FENCE_BOARD.gap,
    boardsPerTile,
    seed: 9,
  });
  boards.uScale = width / (FENCE_BOARD.width * boardsPerTile); // one tile per 8 boards
  const material = new StandardMaterial('backFenceMat', scene);
  material.diffuseTexture = boards;
  material.diffuseColor = Color3.FromHexString(COLORS.cleanWood);
  material.specularColor = Color3.Black();
  face.material = material;
  return face;
}

/**
 * The paved patio behind the house: its own flat mesh and material, with pavers drawn in code.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
function buildPatio(scene) {
  const { width, length, centerX } = PATIO;
  const patio = MeshBuilder.CreateGround('patio', { width, height: length }, scene);
  patio.position.set(centerX, LAYER.paving, HOUSE.back + length / 2);
  patio.receiveShadows = true;

  const columns = 4;
  const rows = 2;
  const pavers = createPaverTexture(scene, { ...PATIO_PAVER, columns, rows, seed: 12 });
  const module = PATIO_PAVER.size + PATIO_PAVER.joint;
  pavers.uScale = width / (columns * module);
  pavers.vScale = length / (rows * module);
  const material = new StandardMaterial('patioMat', scene);
  material.diffuseTexture = pavers;
  material.diffuseColor = Color3.FromHexString(COLORS.patio);
  material.specularColor = Color3.Black();
  patio.material = material;
  return patio;
}

/** @param {Greybox} kit */
function buildPlants(kit) {
  /** @type {[number, number, number][]} [x, z, size] */
  const trees = [
    [-8.5, -4.5, 1],
    [11, -6, 0.8],
    [-6, 19, 1.2],
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

  // A row of bushes along the front of the house, skipping the door and the garage.
  for (const x of [-7.4, -6.2, -5, -3.7, -0.4, 0.8]) {
    kit.blob('bush', {
      radius: 0.6,
      at: [x, 0, HOUSE.front - 0.7],
      color: COLORS.bush,
      squash: 0.8,
    });
  }
}

/** @param {Greybox} kit */
function buildProps(kit) {
  // Trash bins beside the garage.
  kit.block('trashBin', { size: [0.6, 1.05, 0.7], at: [7.5, 0, 0.8], color: COLORS.bin });
  kit.block('trashBin', { size: [0.6, 1.05, 0.7], at: [7.5, 0, 0], color: COLORS.bin });

  // Mailbox at the end of the driveway.
  kit.cylinder('mailboxPost', {
    diameter: 0.09,
    height: 1.05,
    at: [1.2, 0, SIDEWALK.back + 0.4],
    color: COLORS.mailbox,
  });
  kit.block('mailbox', {
    size: [0.25, 0.28, 0.5],
    at: [1.2, 1.05, SIDEWALK.back + 0.4],
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
  const bounds = { left: -16, right: 16, front: -16.5, back: 27 };
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
