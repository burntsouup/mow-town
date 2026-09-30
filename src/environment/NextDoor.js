import { MeshBuilder, Vector3 } from '@babylonjs/core';
import { SIDEWALK } from './frontYardLayout.js';
import { HEDGE, NEXT_DRIVEWAY, NEXT_HOUSE, NEXT_LAWN, NEXT_SPOTS, SHED } from './nextDoorLayout.js';
import { buildBushes, buildFlowerBed, buildHouse, buildMailbox, buildTree } from './props.js';
import { COLLIDER_HEIGHT, COLORS, FLOWER_COLORS, LAYER } from './style.js';

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
 * A barn-red garden shed at the back of the side yard: board-and-batten walls with white
 * corner boards, a shingled roof, double doors with white Z-braces, and a window with a
 * flower box.
 *
 * @param {import('./greybox.js').Greybox} kit
 */
function buildShed(kit) {
  const width = SHED.right - SHED.left;
  const depth = SHED.back - SHED.front;
  const x = (SHED.left + SHED.right) / 2;
  const z = (SHED.front + SHED.back) / 2;
  const { height } = SHED;
  kit.rounded('shed', {
    size: [width, height, depth],
    at: [x, 0, z],
    color: COLORS.shed,
    radius: 0.04,
  });
  // Battens: thin strips over the board joints, all round (one mesh, one draw call).
  const battens = [];
  const spacing = 0.36;
  for (let i = 1; i * spacing < width - 0.1; i++) {
    for (const face of [SHED.front - 0.012, SHED.back + 0.012]) {
      battens.push(
        kit.rounded('shedBatten', {
          size: [0.05, height - 0.1, 0.03],
          at: [SHED.left + i * spacing, 0.05, face],
          color: COLORS.shedBatten,
          radius: 0.012,
          solid: false,
        }),
      );
    }
  }
  for (let i = 1; i * spacing < depth - 0.1; i++) {
    for (const face of [SHED.left - 0.012, SHED.right + 0.012]) {
      battens.push(
        kit.rounded('shedBatten', {
          size: [0.03, height - 0.1, 0.05],
          at: [face, 0.05, SHED.front + i * spacing],
          color: COLORS.shedBatten,
          radius: 0.012,
          solid: false,
        }),
      );
    }
  }
  kit.merge('shedBattens', battens).checkCollisions = false;
  for (const [cx, cz] of [
    [SHED.left, SHED.front],
    [SHED.right, SHED.front],
    [SHED.left, SHED.back],
    [SHED.right, SHED.back],
  ]) {
    kit.rounded('shedCorner', {
      size: [0.12, height, 0.12],
      at: [cx, 0, cz],
      color: COLORS.trim,
      radius: 0.03,
      solid: false,
    });
  }
  kit.pyramid('shedRoof', {
    size: [width + 0.4, 1, depth + 0.4],
    at: [x, height, z],
    color: COLORS.shedRoof,
    shingles: [(width + depth + 0.8) / 3.3, Math.hypot(1, (depth + 0.4) / 2) / 1.2],
  });
  kit.rounded('shedEave', {
    size: [width + 0.3, 0.1, depth + 0.3],
    at: [x, height - 0.06, z],
    color: COLORS.trim,
    radius: 0.03,
    solid: false,
  });

  // Double doors, each with a white frame and Z-brace, and a round black handle.
  const doorWidth = 0.7;
  const doorHeight = 1.9;
  const doorZ = SHED.front - 0.04;
  for (const side of [-1, 1]) {
    const cx = x + side * (doorWidth / 2 + 0.01);
    kit.rounded('shedDoor', {
      size: [doorWidth, doorHeight, 0.06],
      at: [cx, 0.02, doorZ + 0.01],
      color: COLORS.shed,
      radius: 0.02,
      solid: false,
    });
    for (const y of [0.1, doorHeight - 0.1]) {
      kit.rounded('shedDoorRail', {
        size: [doorWidth - 0.04, 0.1, 0.03],
        at: [cx, y, doorZ - 0.025],
        color: COLORS.trim,
        radius: 0.012,
        solid: false,
      });
    }
    for (const dx of [-1, 1]) {
      kit.rounded('shedDoorStile', {
        size: [0.1, doorHeight - 0.1, 0.03],
        at: [cx + dx * (doorWidth / 2 - 0.07), 0.07, doorZ - 0.025],
        color: COLORS.trim,
        radius: 0.012,
        solid: false,
      });
    }
    const brace = kit.rounded('shedDoorBrace', {
      size: [0.09, Math.hypot(doorWidth - 0.2, doorHeight - 0.3), 0.025],
      at: [cx, doorHeight / 2 - Math.hypot(doorWidth - 0.2, doorHeight - 0.3) / 2, doorZ - 0.025],
      color: COLORS.trim,
      radius: 0.01,
      solid: false,
    });
    brace.rotation.z = side * Math.atan2(doorWidth - 0.2, doorHeight - 0.3);
    kit.blob('shedHandle', {
      radius: 0.035,
      at: [x + side * 0.12, 1.0, doorZ - 0.05],
      color: COLORS.tire,
      solid: false,
    });
  }

  // A window with a white frame, and a flower box underneath.
  const windowX = x + 1.55;
  const windowY = 1.1;
  kit.rounded('shedWindowFrame', {
    size: [0.72, 0.62, 0.05],
    at: [windowX, windowY, SHED.front - 0.02],
    color: COLORS.trim,
    radius: 0.025,
    solid: false,
  });
  kit.rounded('shedWindowGlass', {
    size: [0.56, 0.46, 0.02],
    at: [windowX, windowY + 0.08, SHED.front - 0.045],
    color: COLORS.glass,
    radius: 0.01,
    solid: false,
  });
  kit.rounded('shedWindowBar', {
    size: [0.04, 0.46, 0.03],
    at: [windowX, windowY + 0.08, SHED.front - 0.055],
    color: COLORS.trim,
    radius: 0.01,
    solid: false,
  });
  kit.rounded('shedFlowerBox', {
    size: [0.8, 0.16, 0.2],
    at: [windowX, windowY - 0.18, SHED.front - 0.12],
    color: COLORS.shedBatten,
    radius: 0.03,
    solid: false,
  });
  FLOWER_COLORS.slice(0, 4).forEach((color, i) => {
    const fx = windowX - 0.27 + i * 0.18;
    kit.puff('shedFlowerLeaves', {
      radius: 0.09,
      at: [fx, windowY - 0.06, SHED.front - 0.12],
      color: COLORS.bush,
      shadow: false,
      solid: false,
    });
    kit.puff('shedFlower', {
      radius: 0.045,
      at: [fx + 0.02, windowY + 0.06, SHED.front - 0.17],
      color,
      shadow: false,
      solid: false,
    });
  });
}

/**
 * A stone birdbath out on the lawn (something small and round to trim around), with a
 * little bluebird perched on its rim.
 *
 * @param {import('./greybox.js').Greybox} kit
 */
function buildBirdbath(kit) {
  const { x, z } = NEXT_SPOTS.birdbath;
  // Its outline (radius, height), spun round to make a smooth, curvy pedestal and bowl.
  const outline = [
    [0, 0],
    [0.17, 0],
    [0.17, 0.05],
    [0.09, 0.1],
    [0.06, 0.3],
    [0.065, 0.55],
    [0.11, 0.66],
    [0.27, 0.73],
    [0.29, 0.79],
    [0.26, 0.8],
    [0.21, 0.77],
    [0, 0.77],
  ].map(([r, y]) => new Vector3(r, y, 0));
  const stone = MeshBuilder.CreateLathe(
    'birdbath',
    { shape: outline, tessellation: 32 },
    kit.scene,
  );
  stone.position.set(x, 0, z);
  kit.addSolid(stone, COLORS.stone, false);
  const water = MeshBuilder.CreateDisc(
    'birdbathWater',
    { radius: 0.22, tessellation: 32 },
    kit.scene,
  );
  water.rotation.x = Math.PI / 2;
  water.position.set(x, 0.775, z);
  water.material = kit.material(COLORS.water);
  // The bird: a round body, a head, a beak and a tail, facing out over the lawn.
  const bird = { x: x - 0.2, y: 0.8, z: z - 0.14 };
  kit.puff('birdBody', {
    radius: 0.05,
    at: [bird.x, bird.y, bird.z],
    color: COLORS.bird,
    shadow: false,
    solid: false,
    smooth: true,
  });
  kit.puff('birdBelly', {
    radius: 0.035,
    at: [bird.x - 0.012, bird.y + 0.01, bird.z - 0.03],
    color: COLORS.birdBelly,
    shadow: false,
    solid: false,
    smooth: true,
  });
  kit.puff('birdHead', {
    radius: 0.032,
    at: [bird.x - 0.02, bird.y + 0.08, bird.z - 0.03],
    color: COLORS.bird,
    shadow: false,
    solid: false,
    smooth: true,
  });
  const beak = MeshBuilder.CreateCylinder(
    'birdBeak',
    { diameterTop: 0, diameterBottom: 0.018, height: 0.03, tessellation: 8 },
    kit.scene,
  );
  beak.rotation.x = -Math.PI / 2; // pointing out over the lawn (-z)
  beak.position.set(bird.x - 0.025, bird.y + 0.115, bird.z - 0.07);
  kit.addSolid(beak, COLORS.birdBeak, false);
  kit.invisibleWall('birdbathCollider', {
    size: [0.34, COLLIDER_HEIGHT, 0.34],
    at: [x, 0, z],
  });
}

/**
 * A garden gnome by the sidewalk: boots, a round blue coat, a fluffy white beard, a big
 * nose and a tall red hat.
 *
 * @param {import('./greybox.js').Greybox} kit
 */
function buildGnome(kit) {
  const { x, z } = NEXT_SPOTS.gnome;
  const soft = { shadow: false, solid: false, smooth: true };
  for (const side of [-1, 1]) {
    kit.puff('gnomeBoot', {
      radius: 0.035,
      at: [x + side * 0.04, 0, z - 0.02],
      color: COLORS.gnomeBoot,
      ...soft,
    });
  }
  kit.puff('gnomeCoat', {
    radius: 0.085,
    at: [x, 0.02, z],
    color: COLORS.gnomeCoat,
    squash: 1.15,
    ...soft,
  });
  kit.puff('gnomeFace', {
    radius: 0.05,
    at: [x, 0.2, z - 0.005],
    color: COLORS.gnomeFace,
    ...soft,
  });
  kit.puff('gnomeBeard', {
    radius: 0.058,
    at: [x, 0.1, z - 0.045],
    color: COLORS.gnomeBeard,
    squash: 1.1,
    ...soft,
  });
  kit.puff('gnomeNose', {
    radius: 0.02,
    at: [x, 0.215, z - 0.058],
    color: COLORS.gnomeNose,
    ...soft,
  });
  for (const side of [-1, 1]) {
    kit.puff('gnomeEye', {
      radius: 0.008,
      at: [x + side * 0.02, 0.255, z - 0.047],
      color: COLORS.tire,
      ...soft,
    });
  }
  const hat = MeshBuilder.CreateCylinder(
    'gnomeHat',
    { diameterTop: 0, diameterBottom: 0.11, height: 0.2, tessellation: 20 },
    kit.scene,
  );
  hat.position.set(x, 0.385, z + 0.01);
  hat.rotation.x = 0.18; // flopping back a little
  kit.addSolid(hat, COLORS.gnomeHat, false);
  kit.invisibleWall('gnomeCollider', { size: [0.22, COLLIDER_HEIGHT, 0.22], at: [x, 0, z] });
}
