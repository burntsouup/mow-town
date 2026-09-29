import { MeshBuilder } from '@babylonjs/core';
import { buildFrontYard } from './FrontYard.js';
import { DRIVEWAY, frontLawn, HOUSE, SIDEWALK } from './frontYardLayout.js';
import { Greybox } from './greybox.js';
import { COLORS, LAYER, SEAM_OVERLAP } from './style.js';

/**
 * Builds the greybox level: a stretch of street with our house and front lawn. Returns where
 * things start, the jobs, and the lawns.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').ShadowGenerator} shadows
 */
export function createLevel(scene, shadows) {
  const kit = new Greybox(scene, shadows);

  const ground = MeshBuilder.CreateGround('ground', { width: 400, height: 400 }, scene);
  ground.material = kit.material(COLORS.ground);
  ground.receiveShadows = true;

  buildStreet(kit);
  buildFrontYard(kit);
  buildBounds(kit);

  // Start at the street end of the driveway, facing the house (yaw 0 = toward +z).
  const spawn = { position: [DRIVEWAY.centerX, 0, SIDEWALK.back + 1], yaw: 0 };
  // The mower waits on the driveway, pointing at the lawn (yaw -π/2 = toward -x).
  const mowerSpot = { position: [DRIVEWAY.centerX - 1.3, 0, SIDEWALK.back + 3], yaw: -Math.PI / 2 };
  // A garage-sale table at the top of the driveway, beside the garage, facing the driveway.
  const standSpot = { position: [DRIVEWAY.centerX + 1.8, 0, HOUSE.front - 2.4], yaw: -Math.PI / 2 };

  // The jobs, in order (see game/jobList.js); `lawn` says which of `lawns` each one is.
  /** @type {import('../game/jobList.js').JobDefinition[]} */
  const jobs = [
    {
      id: 'frontLawn',
      lawn: 'frontLawn',
      name: 'the front lawn',
      shortName: 'Front lawn',
      title: 'Mow the front lawn',
      hint: 'Hold F to see what you missed',
      doneTitle: 'Lawn mowed!',
      summary: 'Front lawn mowed in',
    },
  ];

  return {
    ground,
    spawn,
    mowerSpot,
    standSpot,
    jobs,
    lawns: { frontLawn: frontLawn() },
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
 * Invisible walls around the playable area, so the player can't wander off into the fog.
 * You can step onto the street, but not past the far side of it.
 *
 * @param {Greybox} kit
 */
function buildBounds(kit) {
  const bounds = {
    left: -16,
    right: 16,
    front: SIDEWALK.front - 6.5,
    back: HOUSE.back + 2,
  };
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
