import { Mesh, MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core';
import { plastic, roundedMesh } from '../environment/toyMeshes.js';

const COLORS = {
  deck: '#e03c31',
  stripe: '#fbf8f0',
  engine: '#3b3f46',
  shroud: '#26282d',
  fuelCap: '#ffc53d',
  rubber: '#1f2023',
  hub: '#dfe3e8',
  handle: '#6a717b',
};
/** Wheel radius in meters (also used to spin the wheels at the right speed). */
export const WHEEL_RADIUS = 0.09;
/** The deck is built this wide (meters); setDeckWidth stretches it for bigger decks. */
const DECK_WIDTH = 0.56;
const DECK_DEPTH = 0.62;

/**
 * Builds a toy-like push mower: a glossy red deck with a domed top and a white stripe, an
 * engine under a rounded shroud (fuel cap, pull-start), chunky rubber wheels with shiny hubs,
 * a side chute, and a handle with a foam grip and a red safety bar. Local +z is the front,
 * the origin is the middle of the deck at ground level.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').ShadowGenerator} shadows
 */
export function createMowerModel(scene, shadows) {
  const root = new TransformNode('mower', scene);
  // Everything but the wheels hangs off the chassis, so it can shake while the engine runs.
  const chassis = new TransformNode('mowerChassis', scene);
  chassis.parent = root;
  const materials = {
    deck: plastic(scene, COLORS.deck, { shine: 0.55, power: 64 }),
    stripe: plastic(scene, COLORS.stripe, { shine: 0.3 }),
    engine: plastic(scene, COLORS.engine, { shine: 0.4, power: 40 }),
    shroud: plastic(scene, COLORS.shroud, { shine: 0.45, power: 56 }),
    fuelCap: plastic(scene, COLORS.fuelCap, { shine: 0.4 }),
    rubber: plastic(scene, COLORS.rubber, { shine: 0.08, power: 16 }),
    hub: plastic(scene, COLORS.hub, { shine: 0.8, power: 90 }),
    handle: plastic(scene, COLORS.handle, { shine: 0.6, power: 70 }),
  };
  /** @type {import('@babylonjs/core').Mesh[]} */
  const parts = [];
  /**
   * @template {import('@babylonjs/core').Mesh} T
   * @param {T} mesh
   * @param {import('@babylonjs/core').StandardMaterial} mat
   * @param {number[]} at
   * @param {TransformNode} parent
   */
  const add = (mesh, mat, [x, y, z], parent = chassis) => {
    mesh.material = mat;
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh);
    parts.push(mesh);
    return mesh;
  };
  /** @param {number[][]} points @param {number} radius @param {string} name */
  const tube = (points, radius, name = 'mowerTube') =>
    MeshBuilder.CreateTube(
      name,
      {
        path: points.map(([x, y, z]) => new Vector3(x, y, z)),
        radius,
        tessellation: 12,
        cap: Mesh.CAP_ALL, // closed ends
      },
      scene,
    );

  // The deck: a rounded skirt with a gently domed top, and a white stripe round its base.
  const deck = add(
    roundedMesh('mowerDeck', [DECK_WIDTH, 0.1, DECK_DEPTH], 0.045, scene, 4),
    materials.deck,
    [0, 0.105, 0],
  );
  const dome = add(
    MeshBuilder.CreateSphere('mowerDome', { diameter: 1, segments: 24 }, scene),
    materials.deck,
    [0, 0.14, 0],
  );
  dome.scaling.set(DECK_WIDTH - 0.03, 0.13, DECK_DEPTH - 0.03);
  const stripe = add(
    roundedMesh('mowerStripe', [DECK_WIDTH + 0.008, 0.02, DECK_DEPTH + 0.008], 0.01, scene),
    materials.stripe,
    [0, 0.08, 0],
  );
  // A rubber flap across the back, to stop stones flying at your feet.
  add(
    roundedMesh('mowerFlap', [0.4, 0.07, 0.018], 0.008, scene),
    materials.rubber,
    [0, 0.07, -0.32],
  );

  // The engine: a block under a rounded shroud, with a yellow fuel cap, an air filter and a
  // pull-start handle.
  add(
    MeshBuilder.CreateCylinder(
      'mowerEngine',
      { diameter: 0.25, height: 0.12, tessellation: 24 },
      scene,
    ),
    materials.engine,
    [0, 0.26, 0.02],
  );
  const shroud = add(
    MeshBuilder.CreateSphere('mowerShroud', { diameter: 1, segments: 20 }, scene),
    materials.shroud,
    [0, 0.315, 0.02],
  );
  shroud.scaling.set(0.29, 0.17, 0.29);
  add(
    MeshBuilder.CreateCylinder(
      'mowerFuelCap',
      { diameter: 0.06, height: 0.03, tessellation: 16 },
      scene,
    ),
    materials.fuelCap,
    [0.07, 0.39, 0.06],
  );
  add(
    roundedMesh('mowerAirFilter', [0.11, 0.08, 0.09], 0.03, scene),
    materials.shroud,
    [-0.14, 0.29, 0.13],
  );
  const pull = add(
    MeshBuilder.CreateCapsule('mowerPull', { radius: 0.014, height: 0.08, tessellation: 8 }, scene),
    materials.rubber,
    [-0.04, 0.37, -0.1],
  );
  pull.rotation.set(-0.5, 0, Math.PI / 2); // resting on the back of the shroud

  // Clippings fly out of the chute on the right-hand side.
  const chute = add(
    roundedMesh('mowerChute', [0.14, 0.09, 0.22], 0.035, scene),
    materials.shroud,
    [0.32, 0.11, 0.02],
  );
  chute.rotation.z = -0.25;

  // The handle: two bars rising back from the deck with folding knobs, a thick foam grip,
  // and the red safety bar you hold against it.
  for (const side of [-1, 1]) {
    add(
      tube(
        [
          [0.22 * side, 0.16, -0.28],
          [0.22 * side, 0.55, -0.62],
          [0.24 * side, 0.95, -0.95],
        ],
        0.016,
        'mowerHandleBar',
      ),
      materials.handle,
      [0, 0, 0],
    );
    add(
      MeshBuilder.CreateSphere('mowerKnob', { diameter: 0.05, segments: 10 }, scene),
      materials.rubber,
      [0.22 * side + side * 0.02, 0.55, -0.62],
    );
    add(roundedMesh('mowerBracket', [0.04, 0.06, 0.06], 0.015, scene), materials.shroud, [
      0.22 * side,
      0.15,
      -0.28,
    ]);
  }
  add(
    tube(
      [
        [-0.27, 0.95, -0.95],
        [0.27, 0.95, -0.95],
      ],
      0.024,
      'mowerGrip',
    ),
    materials.rubber,
    [0, 0, 0],
  );
  add(
    tube(
      [
        [-0.23, 0.95, -0.93],
        [-0.21, 0.89, -0.87],
        [0.21, 0.89, -0.87],
        [0.23, 0.95, -0.93],
      ],
      0.011,
      'mowerBail',
    ),
    materials.deck,
    [0, 0, 0],
  );

  // Chunky wheels: a rubber tire round a shiny hub with a red center and bolts (so you can
  // see them turn). Each turns round its axle (local x).
  /** @type {TransformNode[]} */
  const wheels = [];
  for (const [x, z] of [
    [-0.3, 0.22],
    [0.3, 0.22],
    [-0.3, -0.22],
    [0.3, -0.22],
  ]) {
    const axle = new TransformNode('mowerAxle', scene);
    axle.parent = root;
    axle.position.set(x, WHEEL_RADIUS, z);
    const side = Math.sign(x);
    const tire = add(
      MeshBuilder.CreateTorus(
        'mowerTire',
        { diameter: WHEEL_RADIUS * 2 - 0.06, thickness: 0.06, tessellation: 28 },
        scene,
      ),
      materials.rubber,
      [0, 0, 0],
      axle,
    );
    tire.rotation.z = Math.PI / 2;
    const hub = add(
      MeshBuilder.CreateCylinder(
        'mowerHub',
        { diameter: 0.1, height: 0.05, tessellation: 20 },
        scene,
      ),
      materials.hub,
      [0, 0, 0],
      axle,
    );
    hub.rotation.z = Math.PI / 2;
    const cap = add(
      MeshBuilder.CreateCylinder(
        'mowerHubCap',
        { diameter: 0.035, height: 0.058, tessellation: 12 },
        scene,
      ),
      materials.deck,
      [0, 0, 0],
      axle,
    );
    cap.rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      add(
        MeshBuilder.CreateSphere('mowerBolt', { diameter: 0.014, segments: 6 }, scene),
        materials.handle,
        [side * 0.026, Math.sin(angle) * 0.03, Math.cos(angle) * 0.03],
        axle,
      );
    }
    wheels.push(axle);
  }

  // What stretches with a wider deck, and how wide each was built.
  const stretch = [deck, dome, stripe].map((mesh) => ({ mesh, x: mesh.scaling.x }));
  return { root, chassis, deck, stretch, chute, wheels, parts };
}

/**
 * Stretches the deck to a new cutting width (e.g. after an upgrade), moving the wheels and
 * the side chute out to its sides.
 *
 * @param {ReturnType<typeof createMowerModel>} model
 * @param {number} width Meters.
 */
export function setDeckWidth(model, width) {
  const stretch = width / DECK_WIDTH;
  for (const { mesh, x } of model.stretch) mesh.scaling.x = x * stretch;
  for (const axle of model.wheels)
    axle.position.x = Math.sign(axle.position.x) * (width / 2 + 0.02);
  model.chute.position.x = width / 2 + 0.04;
}
