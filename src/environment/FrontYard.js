import { MeshBuilder } from '@babylonjs/core';
import { config } from '../config.js';
import { createValueNoise, fractalNoise } from '../math/noise.js';
import { Greybox } from './greybox.js';

// Units are meters. +x = right (toward the garage), +z = away from the street, y = up.
// The street runs along x at the front; the house faces the street.

const COLORS = {
  lawn: '#5b8a3c',
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
};

// Flat surfaces are stacked a few millimeters apart so they don't flicker ("z-fighting").
const LAYER = { street: 0.01, marking: 0.02, sidewalk: 0.02, paving: 0.03 };
// Where two flat surfaces meet at different heights, the lower one extends this far under
// the higher one. Otherwise, at low camera angles, you can see the lawn through the seam.
const SEAM_OVERLAP = 0.1;

const HOUSE = { left: -8, right: 8, front: 1.5, back: 11.5, wallHeight: 3.2 };
const DRIVEWAY = { width: 5, length: 10, centerX: 4.5 };
const SIDEWALK = { front: -10, back: -8.5 };
const WALKWAY = { centerX: -2, width: 1.2 };
/** The mowable front lawn: between the sidewalk and the bushes, left of the driveway. */
const LAWN = {
  left: -12,
  right: DRIVEWAY.centerX - DRIVEWAY.width / 2,
  front: SIDEWALK.back,
  back: 0,
};

/**
 * Builds the greybox level: a house with a front lawn, a driveway, the street, trees and a
 * few props.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').ShadowGenerator} shadows
 */
export function createFrontYard(scene, shadows) {
  const kit = new Greybox(scene, shadows);

  const ground = MeshBuilder.CreateGround('ground', { width: 400, height: 400 }, scene);
  ground.material = kit.material(COLORS.lawn);
  ground.receiveShadows = true;

  buildStreet(kit);
  buildDriveway(kit);
  buildHouse(kit);
  buildPlants(kit);
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
  const [shortest, tallest] = config.grass.uncutHeight;
  /** @param {number} x @param {number} z */
  const heightAt = (x, z) => {
    const worldX = LAWN.left + x;
    if (Math.abs(worldX - WALKWAY.centerX) < WALKWAY.width / 2) return 0;
    return shortest + (tallest - shortest) * fractalNoise(noise, x * 0.6, z * 0.6, 3);
  };
  return {
    center: [(LAWN.left + LAWN.right) / 2, (LAWN.front + LAWN.back) / 2],
    width,
    depth,
    heightAt,
    densityAt: () => 1,
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
    size: [WALKWAY.width, HOUSE.front - SIDEWALK.back],
    at: [WALKWAY.centerX, LAYER.paving, (HOUSE.front + SIDEWALK.back) / 2],
    color: COLORS.concrete,
  });
}

/** @param {Greybox} kit */
function buildPlants(kit) {
  /** @type {[number, number, number][]} [x, z, size] */
  const trees = [
    [-8.5, -4.5, 1],
    [11, -6, 0.8],
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
  const bounds = { left: -16, right: 16, front: -16.5, back: HOUSE.back + 2 };
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
