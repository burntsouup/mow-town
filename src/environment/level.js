import { Mesh } from '@babylonjs/core';
import { buildFrontYard } from './FrontYard.js';
import { DRIVEWAY, frontLawn, HOUSE, SIDEWALK, SPOTS } from './frontYardLayout.js';
import { Greybox } from './greybox.js';
import { buildNextDoor } from './NextDoor.js';
import { NEXT_HOUSE, nextDoorLawn } from './nextDoorLayout.js';
import { leafyMesh } from './foliage.js';
import { buildHouse, buildTree } from './props.js';
import { COLORS, LAYER, SEAM_OVERLAP } from './style.js';
import { createRandom } from '../math/noise.js';
import { circle } from '../math/shapes.js';

const STREET_WIDTH = 7;
/** The sidewalk across the street (ours is SIDEWALK). */
const FAR_SIDEWALK = {
  front: SIDEWALK.front - STREET_WIDTH - (SIDEWALK.back - SIDEWALK.front),
  back: SIDEWALK.front - STREET_WIDTH,
};

/**
 * Builds the greybox level: a stretch of street with our house and front lawn, and the
 * Parkers' bigger lawn next door. Returns where things start, the jobs, and the lawns.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').ShadowGenerator} shadows
 */
export function createLevel(scene, shadows) {
  const kit = new Greybox(scene, shadows);

  const ground = kit.flat('ground', {
    size: [400, 400],
    at: [0, 0, 0],
    surface: 'ground',
    tile: 5,
  });

  buildStreet(kit);
  buildFrontYard(kit);
  buildNextDoor(kit);
  buildBackdrop(kit);
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
    {
      id: 'nextDoor',
      lawn: 'nextDoor',
      name: "the Parkers' lawn next door",
      shortName: "Parkers' lawn",
      title: "Mow the Parkers' lawn",
      hint: 'Next door: along the sidewalk, past the hedge',
      doneTitle: 'Lawn mowed!',
      summary: "The Parkers' lawn mowed in",
    },
  ];

  return {
    ground,
    spawn,
    mowerSpot,
    standSpot,
    closetSpot: { x: SPOTS.coatStand.x, z: SPOTS.coatStand.z }, // the coat stand by the door
    jobs,
    lawns: { frontLawn: frontLawn(), nextDoor: nextDoorLawn() },
  };
}

/** @param {Greybox} kit */
function buildStreet(kit) {
  const streetWidth = STREET_WIDTH;
  const streetZ = SIDEWALK.front - streetWidth / 2;
  kit.flat('street', {
    size: [400, streetWidth + SEAM_OVERLAP],
    at: [0, LAYER.street, streetZ + SEAM_OVERLAP / 2],
    surface: 'asphalt',
    tile: 3,
  });
  // A dashed center line, merged into one mesh.
  const dashes = [];
  for (let x = -120; x < 120; x += 4) {
    dashes.push(
      kit.flat('streetLine', {
        size: [2.2, 0.14],
        at: [x, LAYER.marking, streetZ],
        color: COLORS.streetLine,
      }),
    );
  }
  Mesh.MergeMeshes(dashes, true, true);
  // Sidewalks on both sides, each with a curb along the street.
  const sidewalkWidth = SIDEWALK.back - SIDEWALK.front;
  for (const [front, curbZ] of [
    [SIDEWALK.front, SIDEWALK.front - 0.08],
    [FAR_SIDEWALK.front, FAR_SIDEWALK.back + 0.08],
  ]) {
    kit.flat('sidewalk', {
      size: [400, sidewalkWidth + SEAM_OVERLAP],
      at: [
        0,
        LAYER.sidewalk,
        front + (sidewalkWidth + SEAM_OVERLAP) / 2 - (front === SIDEWALK.front ? 0 : SEAM_OVERLAP),
      ],
      surface: 'concrete',
      tile: sidewalkWidth,
    });
    const curb = kit.rounded('curb', {
      size: [400, 0.12, 0.22],
      at: [0, 0, curbZ],
      color: COLORS.curb,
      radius: 0.04,
      solid: false,
      segments: 2,
    });
    kit.shadows.removeShadowCaster(curb);
  }
}

/**
 * The rest of the neighborhood, just for looks: houses across the street and further along
 * ours, a few trees, and a line of trees on the horizon, so the world doesn't end at our
 * fence. None of it casts shadows (the sun's shadow map would have to stretch to cover it,
 * blurring the shadows up close), and you can't walk there (see buildBounds).
 *
 * @param {Greybox} kit
 */
function buildBackdrop(kit) {
  const looks = [
    { walls: '#f4d9c6', roof: '#7a5c52', shutters: '#8a4f45', door: '#c9553f' },
    { walls: '#dfe8d2', roof: '#5f6f5a', shutters: '#55704d', door: '#f0c05a' },
    { walls: '#f2ead8', roof: '#6b6f7a', shutters: '#3f5f8a', door: '#3f5f8a' },
    { walls: '#e8d8ee', roof: '#6a5a72', shutters: '#7a5a8a', door: '#e07a9a' },
    { walls: '#d9e6ef', roof: '#b9654b', shutters: '#b9654b', door: '#3f8f86' },
  ];
  const random = createRandom(29);
  /** @type {import('@babylonjs/core').AbstractMesh[]} */
  const scenery = [];
  const house = { left: -7, right: 7, front: -5, back: 5, wallHeight: 3 };
  /**
   * @param {number} x The middle of the house.
   * @param {number} frontZ Where its front wall is.
   * @param {1 | -1} facing -1: facing -z (our side of the street); 1: facing +z (across).
   * @param {number} index Which look.
   */
  const place = (x, frontZ, facing, index) => {
    const look = looks[index % looks.length];
    const garageX = 3.8;
    const node = buildHouse(kit, house, {
      walls: look.walls,
      roof: look.roof,
      shutters: look.shutters,
      garageX,
      door: { x: -1.2, color: look.door },
      windows: [
        [-4.4, 1.5],
        [0.9, 1.1],
      ],
    });
    node.rotation.y = facing === 1 ? Math.PI : 0;
    // Turned around (facing +z), the house's front and its garage side swap over.
    node.position.set(x, 0, frontZ + facing * house.front);
    scenery.push(...node.getChildMeshes());
    // A driveway out to the sidewalk, and a tree in the yard.
    const sidewalkEdge = facing === -1 ? SIDEWALK.back : FAR_SIDEWALK.front;
    const length = Math.abs(frontZ - sidewalkEdge);
    const driveX = x - facing * garageX;
    scenery.push(
      kit.flat('backdropDriveway', {
        size: [4.4, length],
        at: [driveX, LAYER.paving, (frontZ + sidewalkEdge) / 2],
        surface: 'concrete',
        tile: 2.5,
      }),
    );
    const treeX = x + facing * (4 + random() * 2.5); // on the other side from the garage
    const treeZ = (frontZ + sidewalkEdge) / 2 + (random() - 0.5) * 3;
    scenery.push(
      ...buildTree(kit, circle(treeX, treeZ, 0.6), 0.8 + random() * 0.35, index + 9, true),
    );
  };
  for (let i = 0; i < 7; i++) place(-54 + i * 18, FAR_SIDEWALK.front - 9.5, 1, i);
  place(-32, HOUSE.front, -1, 2);
  place(NEXT_HOUSE.right + 14, HOUSE.front, -1, 4);

  // A line of trees along the horizon, both ways, fading into the haze: dark cores under
  // big leaves (small leaves would be lost at this distance).
  const puffs = [];
  /** @type {import('./foliageMath.js').Blob[][]} */
  const treeline = [];
  for (const [z, count] of [
    [-62, 26],
    [48, 26],
  ]) {
    for (let i = 0; i < count; i++) {
      const radius = 4 + random() * 3;
      const squash = 0.8 + random() * 0.3;
      const x = -130 + (i / (count - 1)) * 260 + (random() - 0.5) * 6;
      const tz = z + (random() - 0.5) * 8;
      puffs.push(
        kit.puff('treeline', {
          radius: radius * 0.9,
          at: [x, 0, tz],
          color: '#4a7a36',
          squash,
          solid: false,
        }),
      );
      treeline.push([{ x, y: radius * squash, z: tz, radius, squash }]);
    }
  }
  scenery.push(kit.merge('treeline', puffs));
  scenery.push(
    kit.addSolid(
      leafyMesh(kit.scene, 'treelineLeaves', treeline, {
        color: '#5b8c42',
        density: 1.1,
        size: 1.4,
        seed: 77,
        leaves: 3,
        softness: 0.9,
      }),
      null,
      false,
    ),
  );

  for (const mesh of scenery) {
    kit.shadows.removeShadowCaster(mesh);
    mesh.checkCollisions = false;
    mesh.metadata = null; // no fading trees out here: the camera never gets close
  }
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
    right: NEXT_HOUSE.right + 3,
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
