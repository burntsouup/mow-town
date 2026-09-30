import { DRIVEWAY, FENCE, HOUSE, LAWN, SIDEWALK, SPOTS, WALKWAY } from './frontYardLayout.js';
import {
  buildBushes,
  buildCoatStand,
  buildFlowerBed,
  buildHouse,
  buildMailbox,
  buildTree,
} from './props.js';
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
    shutters: COLORS.shutters,
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
    surface: 'concrete',
    tile: 1.2,
  });
  buildFence(kit);
  kit.flat('houseBed', {
    size: [LAWN.right - FENCE.x, FENCE.back - LAWN.back],
    at: [(FENCE.x + LAWN.right) / 2, LAYER.mulch, (LAWN.back + FENCE.back) / 2],
    surface: 'mulch',
    tile: 1.5,
  });
  buildTree(kit, SPOTS.tree, 1);
  buildFlowerBed(kit, 'flowerBed', SPOTS.flowerBed, { seed: 5, flowers: 26 });
  // A row of bushes in the bed along the front of the house, skipping the door and garage.
  buildBushes(kit, [-12.9, -11.5, -10.1, -7.4, -6.2, -5, -3.7, -0.4, 0.8], HOUSE.front - 0.7, 3);
  buildToys(kit);
  // Trash bins beside the garage, lids on.
  for (const z of [0, 0.8]) {
    kit.rounded('trashBin', {
      size: [0.6, 0.98, 0.7],
      at: [7.5, 0, z],
      color: COLORS.bin,
      radius: 0.06,
    });
    kit.rounded('trashBinLid', {
      size: [0.66, 0.08, 0.76],
      at: [7.5, 0.98, z],
      color: '#355f56',
      radius: 0.035,
    });
    kit.contactShadow(7.5, z, 0.6);
  }
  buildMailbox(kit, SPOTS.mailbox);
  buildCoatStand(kit, SPOTS.coatStand);
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
    surface: 'concrete',
    tile: 2.5,
  });
}

/**
 * A white picket fence down the left side of the lot, then across to the house: posts with
 * caps, two rails, and rounded pickets.
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
  const pickets = 0.15;
  const parts = [];
  for (const [x1, z1, x2, z2] of runs) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const alongX = z1 === z2;
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    for (const y of [0.2, 0.62]) {
      parts.push(
        kit.rounded('fenceRail', {
          size: alongX ? [length, 0.08, 0.04] : [0.04, 0.08, length],
          at: [midX, y, midZ],
          color: COLORS.fence,
          radius: 0.015,
          segments: 1,
        }),
      );
    }
    const count = Math.floor(length / pickets);
    for (let i = 0; i <= count; i++) {
      const t = (i + 0.5) / (count + 1);
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      const offset = 0.035; // pickets sit on the lawn side of the rails
      parts.push(
        kit.rounded('fencePicket', {
          size: alongX ? [0.075, 0.9, 0.022] : [0.022, 0.9, 0.075],
          at: [alongX ? x : x + offset, 0.02, alongX ? z - offset : z],
          color: COLORS.fence,
          radius: 0.0375,
          segments: 1,
        }),
      );
    }
    const posts = Math.ceil(length / postSpacing);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      parts.push(
        kit.rounded('fencePost', {
          size: [0.11, FENCE.height, 0.11],
          at: [x, 0, z],
          color: COLORS.fence,
          radius: 0.02,
          segments: 1,
        }),
        kit.rounded('fencePostCap', {
          size: [0.15, 0.05, 0.15],
          at: [x, FENCE.height, z],
          color: COLORS.fence,
          radius: 0.02,
          segments: 1,
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
  kit.puff('ball', {
    radius: ball.radiusX,
    at: [ball.x, 0, ball.z],
    color: COLORS.ball,
    solid: false,
    shade: 0.3,
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
    kit.rounded('truckBed', {
      size: [length * 0.6, 0.12, width * 0.9],
      at: [x - length * 0.18, 0.06, z],
      color: COLORS.truck,
      solid: false,
      radius: 0.025,
    }),
    kit.rounded('truckCab', {
      size: [length * 0.3, 0.16, width * 0.8],
      at: [x + length * 0.3, 0.05, z],
      color: COLORS.truck,
      solid: false,
      radius: 0.035,
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
