import { Color3, MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core';
import { createRandom } from '../math/noise.js';
import { barkMaterial, flowerMesh, leafyMesh } from './foliage.js';
import { COLLIDER_HEIGHT, COLORS, FLOWER_COLORS, LAYER } from './style.js';

// Pieces both yards are built from: houses, trees, flower beds and mailboxes. Units are
// meters; see greybox.js for the kit. Shapes are soft and rounded, like toys.

/**
 * A house: rounded walls on a foundation, a hip roof over a white eave, a chimney, and on
 * the front wall a garage door, a front door with a step, and windows with frames, sills
 * and shutters. Parts of the same color are merged, so a house is a handful of draw calls.
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {{ left: number, right: number, front: number, back: number, wallHeight: number }} house
 * @param {{ walls: string, roof: string, garageX: number, door: { x: number, color: string },
 *   shutters: string, windows: [number, number][] }} look windows: [x, width] pairs.
 */
export function buildHouse(kit, house, look) {
  const width = house.right - house.left;
  const depth = house.back - house.front;
  const centerX = (house.left + house.right) / 2;
  const centerZ = (house.front + house.back) / 2;
  const wall = house.wallHeight;
  /** @type {Map<string, import('@babylonjs/core').Mesh[]>} Parts to merge, by color. */
  const parts = new Map();
  const node = new TransformNode('house', kit.scene);
  /** @param {import('@babylonjs/core').Mesh} mesh */
  const keep = (mesh) => {
    mesh.parent = node;
    return mesh;
  };
  /**
   * @param {string} color
   * @param {number[]} size
   * @param {number[]} at
   * @param {number} [radius]
   */
  const part = (color, size, at, radius = 0.03) => {
    const mesh = kit.rounded('housePart', { size, at, color, radius, segments: 2 });
    if (!parts.has(color)) parts.set(color, []);
    parts.get(color)?.push(mesh);
  };

  // A stone foundation, and walls of lap siding (see WallPatternPlugin).
  keep(
    kit.rounded('foundation', {
      size: [width + 0.12, 0.35, depth + 0.12],
      at: [centerX, 0, centerZ],
      color: COLORS.foundation,
      radius: 0.05,
    }),
  ).material = kit.patterned(COLORS.foundation, 'stone');
  keep(
    kit.rounded('house', {
      size: [width, wall, depth],
      at: [centerX, 0, centerZ],
      color: look.walls,
      radius: 0.12,
    }),
  ).material = kit.patterned(look.walls, 'siding', wall - 0.1);
  // Soft shade on the ground all round its foot.
  const [x0, x1] = [house.left - 0.06, house.right + 0.06];
  const [z0, z1] = [house.front - 0.06, house.back + 0.06];
  for (const [from, to] of [
    [
      [x0, z0],
      [x1, z0],
    ],
    [
      [x1, z0],
      [x1, z1],
    ],
    [
      [x1, z1],
      [x0, z1],
    ],
    [
      [x0, z1],
      [x0, z0],
    ],
  ]) {
    keep(kit.groundShade('houseGroundShade', from, to, 1.3));
  }
  part(COLORS.trim, [width + 0.3, 0.18, depth + 0.3], [centerX, wall - 0.06, centerZ], 0.06);
  const overhang = 0.55;
  const roofWidth = width + overhang * 2;
  const roofDepth = depth + overhang * 2;
  keep(
    kit.pyramid('roof', {
      size: [roofWidth, 2.4, roofDepth],
      at: [centerX, wall + 0.1, centerZ],
      color: look.roof,
      // About 0.55 m per tab around the eaves, and 0.3 m rows up the slopes.
      shingles: [(roofWidth + roofDepth) / 3.3, Math.hypot(2.4, roofDepth / 2) / 1.2],
    }),
  );
  keep(
    kit.rounded('chimney', {
      size: [0.75, 1.9, 0.75],
      at: [house.left + 2.6, wall, centerZ + 2],
      color: COLORS.brick,
      radius: 0.06,
    }),
  ).material = kit.patterned(COLORS.brick, 'brick');
  // Gutters round the roof's edge, and downspouts at the front corners.
  const gutterY = wall + 0.02;
  for (const side of [-1, 1]) {
    part(
      COLORS.gutter,
      [roofWidth + 0.08, 0.1, 0.12],
      [centerX, gutterY, centerZ + side * (roofDepth / 2 + 0.02)],
    );
    part(
      COLORS.gutter,
      [0.12, 0.1, roofDepth + 0.08],
      [centerX + side * (roofWidth / 2 + 0.02), gutterY, centerZ],
    );
    const x = side < 0 ? house.left + 0.25 : house.right - 0.25;
    part(COLORS.gutter, [0.08, wall - 0.05, 0.08], [x, 0.12, house.front - 0.09], 0.025);
    part(COLORS.gutter, [0.08, 0.08, 0.5], [x, wall - 0.04, house.front - 0.33], 0.025);
    part(COLORS.gutter, [0.09, 0.07, 0.24], [x, 0.05, house.front - 0.2], 0.025); // the spout
  }

  // Things on the front wall stick out of it by a few centimeters.
  const face = house.front;
  /** A rectangle of trim around an opening, as four bars. */
  const frame = (
    /** @type {number} */ x,
    /** @type {number} */ bottom,
    /** @type {number} */ w,
    /** @type {number} */ h,
    /** @type {boolean} */ withBottom,
  ) => {
    const t = 0.09;
    part(COLORS.trim, [w + t * 2, t, 0.1], [x, bottom + h, face - 0.05]);
    part(COLORS.trim, [t, h, 0.1], [x - w / 2 - t / 2, bottom, face - 0.05]);
    part(COLORS.trim, [t, h, 0.1], [x + w / 2 + t / 2, bottom, face - 0.05]);
    if (withBottom) part(COLORS.trim, [w + t * 2, t, 0.1], [x, bottom - t, face - 0.05]);
  };

  for (const [x, w] of look.windows) {
    const bottom = 0.95;
    const h = 1.2;
    part(COLORS.glass, [w, h, 0.06], [x, bottom, face - 0.02], 0.01);
    // Curtains drawn back to the sides, behind the glass's cross bars, with a valance.
    for (const side of [-1, 1]) {
      part(
        COLORS.curtains,
        [w * 0.17, h * 0.9, 0.02],
        [x + side * w * 0.41, bottom + 0.04, face - 0.055],
        0.01,
      );
    }
    part(COLORS.curtains, [w * 0.98, 0.1, 0.025], [x, bottom + h - 0.14, face - 0.058], 0.01);
    frame(x, bottom, w, h, false);
    part(COLORS.trim, [0.05, h, 0.08], [x, bottom, face - 0.04]); // the cross in the window
    part(COLORS.trim, [w, 0.05, 0.08], [x, bottom + h / 2 - 0.025, face - 0.04]);
    part(COLORS.trim, [w + 0.34, 0.08, 0.2], [x, bottom - 0.08, face - 0.09]); // sill
    for (const side of [-1, 1]) {
      part(
        look.shutters,
        [0.36, h + 0.1, 0.05],
        [x + side * (w / 2 + 0.3), bottom - 0.05, face - 0.03],
      );
    }
  }

  // The front door, with a knob, a step up to it with a mat, a little roof over it on
  // brackets, and a lantern beside it.
  const door = look.door;
  part(door.color, [1, 2.1, 0.08], [door.x, 0.25, face - 0.03], 0.02);
  frame(door.x, 0.25, 1, 2.1, false);
  part(COLORS.trim, [1.6, 0.1, 0.66], [door.x, 2.6, face - 0.33], 0.04);
  for (const side of [-1, 1]) {
    part(COLORS.trim, [0.08, 0.32, 0.3], [door.x + side * 0.68, 2.28, face - 0.15], 0.02);
  }
  part(COLORS.doormat, [0.9, 0.025, 0.42], [door.x, 0.2, face - 0.3], 0.01);
  part(COLORS.lantern, [0.16, 0.26, 0.16], [door.x - 0.8, 1.65, face - 0.1], 0.03);
  part(COLORS.lanternGlass, [0.12, 0.16, 0.17], [door.x - 0.8, 1.7, face - 0.1], 0.02);
  const knob = MeshBuilder.CreateSphere('doorKnob', { diameter: 0.08, segments: 8 }, kit.scene);
  knob.position.set(door.x + 0.35, 1.25, face - 0.1);
  keep(kit.addSolid(knob, COLORS.knob, false));
  keep(
    kit.rounded('doorStep', {
      size: [1.6, 0.2, 0.55],
      at: [door.x, 0, face - 0.27],
      color: COLORS.step,
      radius: 0.04,
    }),
  );

  // The garage door: panels with grooves across.
  const garageWidth = 4.2;
  const garageHeight = 2.3;
  part(COLORS.garageDoor, [garageWidth, garageHeight, 0.08], [look.garageX, 0, face - 0.03], 0.02);
  for (let i = 1; i < 4; i++) {
    part(
      COLORS.groove,
      [garageWidth - 0.1, 0.04, 0.09],
      [look.garageX, (garageHeight * i) / 4, face - 0.035],
      0.01,
    );
  }
  frame(look.garageX, 0, garageWidth, garageHeight, false);
  // A row of little windows across its top panel, and a light above it.
  for (let i = 0; i < 4; i++) {
    part(
      COLORS.glass,
      [0.72, 0.26, 0.02],
      [look.garageX + (i - 1.5) * 0.98, garageHeight * 0.8, face - 0.08],
      0.02,
    );
  }
  part(COLORS.lantern, [0.3, 0.12, 0.18], [look.garageX, garageHeight + 0.2, face - 0.1], 0.04);

  for (const [color, meshes] of parts)
    keep(kit.merge(`house${color}`, meshes)).checkCollisions = false;
  return node;
}

/**
 * A tree standing in a ring of mulch: a tapered trunk and a cluster of leafy puffs. The
 * leaves aren't solid, and fade out when they get between the camera and you (see
 * ThirdPersonCamera).
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {{ x: number, z: number, radiusX: number, radiusZ: number }} ring
 * @param {number} size 1 = our big tree.
 * @param {number} [seed] Varies the canopy's shape.
 * @param {boolean} [far] Only ever seen from far off (less detail).
 * @returns {import('@babylonjs/core').Mesh[]} The trunk, and the canopy's core and leaves.
 */
export function buildTree(kit, ring, size, seed = 1, far = false) {
  mulchDisc(kit, 'treeRing', ring);
  const trunkHeight = 2.4 * size;
  const trunk = MeshBuilder.CreateCylinder(
    'treeTrunk',
    { diameterTop: 0.2 * size, diameterBottom: 0.38 * size, height: trunkHeight, tessellation: 14 },
    kit.scene,
  );
  trunk.position.set(ring.x, trunkHeight / 2, ring.z);
  trunk.material = barkMaterial(kit.scene, COLORS.trunk);
  kit.addSolid(trunk, null, true);

  const random = createRandom(seed);
  const clumps = [
    [0, 0.2, 0, 1.45],
    [0.95, -0.15, 0.35, 1.0],
    [-0.9, -0.1, 0.4, 1.05],
    [0.2, -0.2, -0.95, 1.0],
    [-0.35, 0.05, -0.6, 0.95],
    [0.15, 1.0, 0.1, 1.0],
  ];
  const squash = 0.88;
  const blobs = clumps.map(([dx, dy, dz, r]) => {
    const radius = r * size * (0.92 + random() * 0.16);
    return {
      x: ring.x + dx * size,
      y: trunkHeight - 0.7 * size + dy * size + radius * squash,
      z: ring.z + dz * size,
      radius,
      squash,
    };
  });
  // A dark core of leafy balls, so you never see through to the sky...
  const puffs = blobs.map((blob) =>
    kit.puff('treeLeaves', {
      radius: blob.radius * 0.84,
      at: [blob.x, blob.y - blob.radius * 0.84 * squash, blob.z],
      color: COLORS.leavesCore,
      squash,
      solid: false,
      shade: 0.4,
    }),
  );
  const core = kit.merge('treeCore', puffs);
  core.checkCollisions = false;
  // ...covered in leaf cards (see foliage.js) that shade as one soft, fluffy ball.
  // (Trees far across the street get fewer, bigger clusters: you can't tell from there.)
  const leaves = leafyMesh(kit.scene, 'treeCanopy', [blobs], {
    color: COLORS.leaves,
    density: (far ? 4 : 10) / (size * size),
    size: (far ? 0.9 : 0.6) * size,
    seed: seed * 7 + 1,
  });
  kit.addSolid(leaves, null, false);
  // Both fade when they come between the camera and you (see ThirdPersonCamera).
  core.metadata = { seeThrough: true };
  leaves.metadata = { seeThrough: true, seeThroughOpacity: 0 };
  return [trunk, core, leaves];
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
        0.035,
        bed.z + Math.sin(angle) * bed.radiusZ,
      ),
    );
  }
  const edging = MeshBuilder.CreateTube(
    `${name}Edging`,
    { path: outline, radius: 0.06, tessellation: 10 },
    scene,
  );
  kit.addSolid(edging, COLORS.edging, false);

  const random = createRandom(planting.seed);
  const cores = [];
  /** @type {import('./foliageMath.js').Blob[][]} */
  const clumps = [];
  /** @type {Parameters<typeof flowerMesh>[1]} */
  const flowers = [];
  const squash = 0.75;
  for (let i = 0; i < planting.flowers; i++) {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * 0.8; // spread evenly over the ellipse
    const x = bed.x + Math.cos(angle) * bed.radiusX * reach;
    const z = bed.z + Math.sin(angle) * bed.radiusZ * reach;
    const radius = 0.14 + random() * 0.06;
    // A leafy clump (a dark core under little leaves)...
    cores.push(
      kit.puff('flowerLeaves', {
        radius: radius * 0.85,
        at: [x, 0, z],
        color: COLORS.bushCore,
        squash,
        solid: false,
      }),
    );
    clumps.push([{ x, y: radius * squash, z, radius, squash }]);
    // ...with a couple of flowers on top.
    for (let f = 0; f < 2; f++) {
      const color = Color3.FromHexString(
        FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)],
      );
      const yellow = color.r > 0.9 && color.g > 0.7;
      flowers.push({
        x: x + (random() - 0.5) * 0.16,
        y: radius * squash * 1.7 + random() * 0.05,
        z: z + (random() - 0.5) * 0.16,
        radius: 0.05 + random() * 0.025,
        petals: 5 + Math.floor(random() * 2),
        color: [color.r, color.g, color.b],
        middle: yellow ? [0.45, 0.28, 0.12] : [0.98, 0.78, 0.2],
        tilt: [(random() - 0.5) * 0.6, (random() - 0.5) * 0.6],
      });
    }
  }
  kit.merge(`${name}Leaves`, cores).checkCollisions = false;
  const leaves = leafyMesh(scene, `${name}Foliage`, clumps, {
    color: COLORS.bush,
    density: 160,
    size: 0.13,
    seed: planting.seed * 5 + 2,
  });
  kit.addSolid(leaves, null, false);
  const blooms = flowerMesh(scene, `${name}Flowers`, flowers);
  kit.addSolid(blooms, null, false);
  kit.shadows.removeShadowCaster(blooms); // too small to matter

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
 * A mailbox on a white post, with its little red flag up.
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {{ x: number, z: number, radiusX: number }} post
 */
export function buildMailbox(kit, post) {
  const size = Math.max(0.08, post.radiusX * 1.1);
  kit.rounded('mailboxPost', {
    size: [size, 1.02, size],
    at: [post.x, 0, post.z],
    color: COLORS.post,
    radius: 0.015,
  });
  kit.rounded('mailbox', {
    size: [0.27, 0.27, 0.5],
    at: [post.x, 1.0, post.z],
    color: COLORS.mailbox,
    radius: 0.12,
  });
  kit.rounded('mailboxFlagPole', {
    size: [0.02, 0.2, 0.02],
    at: [post.x + 0.15, 1.12, post.z + 0.12],
    color: COLORS.mailboxFlag,
    radius: 0.008,
  });
  kit.rounded('mailboxFlag', {
    size: [0.02, 0.08, 0.12],
    at: [post.x + 0.15, 1.24, post.z + 0.17],
    color: COLORS.mailboxFlag,
    radius: 0.008,
  });
}

/**
 * A wooden coat stand by the front door, with a few things hanging on it: Tuft's closet.
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {{ x: number, z: number }} spot
 */
export function buildCoatStand(kit, { x, z }) {
  const wood = COLORS.coatStand;
  kit.rounded('coatStandBase', {
    size: [0.42, 0.05, 0.42],
    at: [x, 0, z],
    color: wood,
    radius: 0.02,
  });
  kit.rounded('coatStandPole', {
    size: [0.06, 1.7, 0.06],
    at: [x, 0, z],
    color: wood,
    radius: 0.025,
  });
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    kit.puff('coatStandHook', {
      radius: 0.03,
      at: [x + dx * 0.07, 1.55, z + dz * 0.07],
      color: wood,
      shadow: false,
    });
  }
  // A red cap on top, a yellow beanie with a pompom on one hook, a teal scarf on another.
  kit.puff('coatStandCap', { radius: 0.12, at: [x, 1.66, z], color: '#e5484d', squash: 0.6 });
  kit.rounded('coatStandCapBrim', {
    size: [0.18, 0.02, 0.14],
    at: [x, 1.68, z - 0.13],
    color: '#e5484d',
    radius: 0.01,
  });
  kit.puff('coatStandBeanie', { radius: 0.11, at: [x + 0.15, 1.3, z], color: '#ffc53d' });
  kit.puff('coatStandPompom', {
    radius: 0.045,
    at: [x + 0.15, 1.51, z],
    color: '#e5484d',
    shadow: false,
  });
  kit.rounded('coatStandScarf', {
    size: [0.12, 0.75, 0.03],
    at: [x - 0.1, 0.8, z],
    color: '#12a594',
    radius: 0.014,
  });
  kit.contactShadow(x, z, 0.3);
}

/**
 * A row of soft, round bushes (two overlapping puffs each, so they're not perfect balls),
 * each sitting in a soft shadow.
 *
 * @param {import('./greybox.js').Greybox} kit
 * @param {number[]} xs
 * @param {number} z
 * @param {number} seed
 */
export function buildBushes(kit, xs, z, seed) {
  const random = createRandom(seed);
  const puffs = [];
  /** @type {import('./foliageMath.js').Blob[][]} */
  const plants = [];
  const squash = 0.85;
  for (const x of xs) {
    const size = 0.52 + random() * 0.12;
    const top = {
      x: x + (random() - 0.5) * 0.5,
      z: z + (random() - 0.5) * 0.3,
      radius: size * 0.7,
    };
    // A dark core (the lower one solid, so you can't walk through)...
    puffs.push(
      kit.puff('bush', { radius: size * 0.85, at: [x, 0, z], color: COLORS.bushCore, squash }),
    );
    puffs.push(
      kit.puff('bush', {
        radius: top.radius * 0.85,
        at: [top.x, size * 0.6, top.z],
        color: COLORS.bushCore,
        squash,
        solid: false,
      }),
    );
    // ...covered in leaves.
    plants.push([
      { x, y: size * squash, z, radius: size, squash },
      { ...top, y: size * 0.6 + top.radius * squash, squash },
    ]);
    kit.contactShadow(x, z, size * 1.5);
  }
  kit.merge('bushes', puffs);
  const leaves = leafyMesh(kit.scene, 'bushLeaves', plants, {
    color: COLORS.bush,
    density: 42,
    size: 0.3,
    seed: seed * 13 + 3,
  });
  kit.addSolid(leaves, null, false);
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
  disc.bakeCurrentTransformIntoVertices();
  disc.position.set(shape.x, LAYER.mulch, shape.z);
  disc.material = kit.surface('mulch');
  kit.worldUVs(disc, 1.5);
  disc.receiveShadows = true;
}
