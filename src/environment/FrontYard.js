import { DRIVEWAY, FENCE, HOUSE, LAWN, SIDEWALK, SPOTS, WALKWAY } from './frontYardLayout.js';
import { buildFlowerBed, buildHouse, buildMailbox, buildTree } from './props.js';
import { COLLIDER_HEIGHT, COLORS, LAYER } from './style.js';

// Our place: the house, the driveway, and the fenced front lawn with a tree, a flower bed and
// a couple of toys in the way. Units are meters (see frontYardLayout.js for the layout).

/**
 * @param {import('./greybox.js').Greybox} kit
 */
export function buildFrontYard(kit) {
  buildDriveway(kit);
  buildHouse(kit, HOUSE, {
    walls: COLORS.walls,
    roof: COLORS.roof,
    garageX: DRIVEWAY.centerX,
    door: { x: WALKWAY.centerX, color: COLORS.frontDoor },
    windows: [
      [-5.5, 1.6],
      [0.2, 1.3],
    ],
  });
  const walkway = SPOTS.walkway;
  kit.flat('walkway', {
    size: [walkway.maxX - walkway.minX, walkway.maxZ - walkway.minZ],
    at: [WALKWAY.centerX, LAYER.paving, (walkway.minZ + walkway.maxZ) / 2],
    color: COLORS.concrete,
  });
  buildFence(kit);
  kit.flat('houseBed', {
    size: [LAWN.right - FENCE.x, FENCE.back - LAWN.back],
    at: [(FENCE.x + LAWN.right) / 2, LAYER.mulch, (LAWN.back + FENCE.back) / 2],
    color: COLORS.mulch,
  });
  buildTree(kit, SPOTS.tree, 1);
  buildFlowerBed(kit, 'flowerBed', SPOTS.flowerBed, { seed: 5, flowers: 26 });
  // A row of bushes in the bed along the front of the house, skipping the door and garage.
  for (const x of [-12.9, -11.5, -10.1, -7.4, -6.2, -5, -3.7, -0.4, 0.8]) {
    kit.blob('bush', {
      radius: 0.6,
      at: [x, 0, HOUSE.front - 0.7],
      color: COLORS.bush,
      squash: 0.8,
    });
  }
  buildToys(kit);
  // Trash bins beside the garage.
  kit.block('trashBin', { size: [0.6, 1.05, 0.7], at: [7.5, 0, 0.8], color: COLORS.bin });
  kit.block('trashBin', { size: [0.6, 1.05, 0.7], at: [7.5, 0, 0], color: COLORS.bin });
  buildMailbox(kit, SPOTS.mailbox);
}

/**
 * The driveway runs from the sidewalk to the garage door.
 *
 * @param {import('./greybox.js').Greybox} kit
 */
function buildDriveway(kit) {
  const length = HOUSE.front - SIDEWALK.back;
  kit.flat('driveway', {
    size: [DRIVEWAY.width, length],
    at: [DRIVEWAY.centerX, LAYER.paving, HOUSE.front - length / 2],
    color: COLORS.concrete,
  });
}

/**
 * A low wooden fence down the left side of the lot, then across to the house.
 *
 * @param {import('./greybox.js').Greybox} kit
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
 * Toys left out on the lawn: a ball and a toy dump truck, each with a tall invisible
 * collider, since Babylon would slide the mower up and over something this low.
 *
 * @param {import('./greybox.js').Greybox} kit
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
