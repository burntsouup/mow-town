import { MeshBuilder } from '@babylonjs/core';
import { SIDEWALK } from './frontYardLayout.js';
import { HEDGE, NEXT_DRIVEWAY, NEXT_HOUSE, NEXT_LAWN, NEXT_SPOTS, SHED } from './nextDoorLayout.js';
import { buildBushes, buildFlowerBed, buildHouse, buildMailbox, buildTree } from './props.js';
import { COLLIDER_HEIGHT, COLORS, LAYER } from './style.js';

// The Parkers' place next door: a bigger, L-shaped lawn behind a low hedge, with a tree, an
// island flower bed, a birdbath, a garden gnome and a shed at the back of the side yard.
// Units are meters (see nextDoorLayout.js for the layout).

/**
 * @param {import('./greybox.js').Greybox} kit
 */
export function buildNextDoor(kit) {
  const drivewayLength = NEXT_HOUSE.front - SIDEWALK.back;
  kit.flat('theirDriveway', {
    size: [NEXT_DRIVEWAY.width, drivewayLength],
    at: [NEXT_DRIVEWAY.centerX, LAYER.paving, NEXT_HOUSE.front - drivewayLength / 2],
    surface: 'concrete',
    tile: 2.2,
  });
  const doorX = 19.5;
  buildHouse(kit, NEXT_HOUSE, {
    walls: COLORS.theirWalls,
    roof: COLORS.theirRoof,
    shutters: '#4f6f8f',
    garageX: NEXT_DRIVEWAY.centerX,
    door: { x: doorX, color: COLORS.theirDoor },
    windows: [
      [16.4, 1.5],
      [22.7, 1.4],
    ],
  });

  // Beds along the front of the house and down its side, with a path through to the door.
  const { front, side } = NEXT_LAWN;
  const bedFront = front.back;
  kit.flat('theirHouseBed', {
    size: [front.right - side.right, NEXT_HOUSE.front - bedFront],
    at: [(side.right + front.right) / 2, LAYER.mulch, (bedFront + NEXT_HOUSE.front) / 2],
    surface: 'mulch',
    tile: 1.5,
  });
  kit.flat('theirSideBed', {
    size: [NEXT_HOUSE.left - side.right, side.back - NEXT_HOUSE.front],
    at: [(side.right + NEXT_HOUSE.left) / 2, LAYER.mulch, (NEXT_HOUSE.front + side.back) / 2],
    surface: 'mulch',
    tile: 1.5,
  });
  kit.flat('theirPath', {
    size: [1, NEXT_HOUSE.front - bedFront],
    at: [doorX, LAYER.paving, (bedFront + NEXT_HOUSE.front) / 2],
    surface: 'concrete',
    tile: 1.2,
  });
  buildBushes(kit, [15.1, 16.4, 17.7, 21.3, 22.6, 23.9], NEXT_HOUSE.front - 0.65, 8);

  buildHedge(kit);
  buildShed(kit);
  buildTree(kit, NEXT_SPOTS.tree, 0.8, 4);
  buildFlowerBed(kit, 'islandBed', NEXT_SPOTS.islandBed, { seed: 12, flowers: 44 });
  buildBirdbath(kit);
  buildGnome(kit);
  buildMailbox(kit, NEXT_SPOTS.mailbox);
}

/**
 * A low hedge along the property line: leafy blobs you can see over, backed by an invisible
 * wall (you'd slide right over blobs this low).
 *
 * @param {import('./greybox.js').Greybox} kit
 */
function buildHedge(kit) {
  const length = HEDGE.back - HEDGE.front;
  const count = Math.round(length / 0.6);
  const blobs = [];
  for (let i = 0; i <= count; i++) {
    blobs.push(
      kit.puff('hedge', {
        radius: 0.44,
        at: [HEDGE.x, 0, HEDGE.front + (length * i) / count],
        color: COLORS.hedge,
        squash: 1.05,
        solid: false,
      }),
    );
  }
  kit.merge('hedge', blobs).checkCollisions = false;
  kit.invisibleWall('hedgeCollider', {
    size: [0.7, COLLIDER_HEIGHT, length + 0.4],
    at: [HEDGE.x, 0, (HEDGE.front + HEDGE.back) / 2],
  });
}

/**
 * A garden shed at the back of the side yard.
 *
 * @param {import('./greybox.js').Greybox} kit
 */
function buildShed(kit) {
  const width = SHED.right - SHED.left;
  const depth = SHED.back - SHED.front;
  const x = (SHED.left + SHED.right) / 2;
  const z = (SHED.front + SHED.back) / 2;
  kit.rounded('shed', {
    size: [width, SHED.height, depth],
    at: [x, 0, z],
    color: COLORS.shed,
    radius: 0.08,
  });
  kit.pyramid('shedRoof', {
    size: [width + 0.3, 1, depth + 0.3],
    at: [x, SHED.height, z],
    color: COLORS.shedRoof,
  });
  kit.rounded('shedDoor', {
    size: [1.4, 1.9, 0.08],
    at: [x, 0, SHED.front - 0.03],
    color: COLORS.shedRoof,
    radius: 0.03,
  });
}

/**
 * A stone birdbath out on the lawn: something small and round to trim around.
 *
 * @param {import('./greybox.js').Greybox} kit
 */
function buildBirdbath(kit) {
  const { x, z } = NEXT_SPOTS.birdbath;
  kit.cylinder('birdbathBase', {
    diameter: 0.34,
    height: 0.08,
    at: [x, 0, z],
    color: COLORS.stone,
  });
  kit.cylinder('birdbathPedestal', {
    diameter: 0.16,
    height: 0.62,
    at: [x, 0.08, z],
    color: COLORS.stone,
  });
  kit.cylinder('birdbathBowl', {
    diameter: 0.56,
    height: 0.1,
    at: [x, 0.7, z],
    color: COLORS.stone,
  });
  const water = MeshBuilder.CreateDisc(
    'birdbathWater',
    { radius: 0.23, tessellation: 24 },
    kit.scene,
  );
  water.rotation.x = Math.PI / 2;
  water.position.set(x, 0.805, z);
  water.material = kit.material(COLORS.water);
  kit.invisibleWall('birdbathCollider', {
    size: [0.34, COLLIDER_HEIGHT, 0.34],
    at: [x, 0, z],
  });
}

/**
 * A garden gnome by the sidewalk, in a red hat.
 *
 * @param {import('./greybox.js').Greybox} kit
 */
function buildGnome(kit) {
  const { x, z } = NEXT_SPOTS.gnome;
  const scene = kit.scene;
  /** @param {import('@babylonjs/core').Mesh} mesh @param {string} color @param {number} y */
  const place = (mesh, color, y) => {
    mesh.position.set(x, y, z);
    kit.addSolid(mesh, color, false);
    return mesh;
  };
  place(
    MeshBuilder.CreateCylinder(
      'gnomeCoat',
      { diameterTop: 0.1, diameterBottom: 0.2, height: 0.2 },
      scene,
    ),
    COLORS.gnomeCoat,
    0.1,
  );
  place(
    MeshBuilder.CreateSphere('gnomeFace', { diameter: 0.1, segments: 8 }, scene),
    COLORS.gnomeFace,
    0.24,
  );
  place(
    MeshBuilder.CreateCylinder(
      'gnomeBeard',
      { diameterTop: 0.09, diameterBottom: 0.02, height: 0.09 },
      scene,
    ),
    COLORS.gnomeBeard,
    0.19,
  ).position.z -= 0.035;
  place(
    MeshBuilder.CreateCylinder(
      'gnomeHat',
      { diameterTop: 0, diameterBottom: 0.11, height: 0.16 },
      scene,
    ),
    COLORS.gnomeHat,
    0.35,
  );
  kit.invisibleWall('gnomeCollider', { size: [0.22, COLLIDER_HEIGHT, 0.22], at: [x, 0, z] });
}
