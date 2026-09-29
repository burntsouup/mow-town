import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';

const COLORS = { deck: '#c7372f', engine: '#4a4d52', dark: '#1f2023', hub: '#b9bcc2' };
/** Wheel radius in meters (also used to spin the wheels at the right speed). */
export const WHEEL_RADIUS = 0.09;
/** The deck is built this wide (meters); setDeckWidth stretches it for bigger decks. */
const DECK_WIDTH = 0.56;

/**
 * Builds a greybox push mower: a red deck, an engine on top, four wheels, a side chute
 * and a handle reaching back to the player. Local +z is the front, origin is the middle of the
 * deck at ground level.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').ShadowGenerator} shadows
 */
export function createMowerModel(scene, shadows) {
  const root = new TransformNode('mower', scene);
  // Everything but the wheels hangs off the chassis, so it can shake while the engine runs.
  const chassis = new TransformNode('mowerChassis', scene);
  chassis.parent = root;
  /** @param {string} hex */
  const material = (hex) => {
    const mat = new StandardMaterial(`mower${hex}`, scene);
    mat.diffuseColor = Color3.FromHexString(hex);
    mat.specularColor = new Color3(0.15, 0.15, 0.15);
    return mat;
  };
  const materials = {
    deck: material(COLORS.deck),
    engine: material(COLORS.engine),
    dark: material(COLORS.dark),
    hub: material(COLORS.hub),
  };
  /** @type {import('@babylonjs/core').Mesh[]} */
  const parts = [];
  /**
   * @param {import('@babylonjs/core').Mesh} mesh
   * @param {StandardMaterial} mat
   * @param {TransformNode} parent
   */
  const add = (mesh, mat, parent = chassis) => {
    mesh.material = mat;
    mesh.parent = parent;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh);
    parts.push(mesh);
    return mesh;
  };

  const deck = add(
    MeshBuilder.CreateBox('mowerDeck', { width: DECK_WIDTH, height: 0.1, depth: 0.62 }, scene),
    materials.deck,
  );
  deck.position.y = 0.11;
  const skirt = add(
    MeshBuilder.CreateCylinder(
      'mowerSkirt',
      { diameter: DECK_WIDTH, height: 0.1, tessellation: 20 },
      scene,
    ),
    materials.deck,
  );
  skirt.position.set(0, 0.11, 0.2); // rounds off the front of the deck

  const engine = add(
    MeshBuilder.CreateCylinder(
      'mowerEngine',
      { diameter: 0.28, height: 0.2, tessellation: 16 },
      scene,
    ),
    materials.engine,
  );
  engine.position.set(0, 0.26, 0.02);
  const cap = add(
    MeshBuilder.CreateCylinder(
      'mowerCap',
      { diameter: 0.2, height: 0.05, tessellation: 16 },
      scene,
    ),
    materials.dark,
  );
  cap.position.set(0, 0.385, 0.02);
  const airFilter = add(
    MeshBuilder.CreateBox('mowerAirFilter', { width: 0.1, height: 0.08, depth: 0.08 }, scene),
    materials.dark,
  );
  airFilter.position.set(-0.12, 0.3, 0.14);

  // Clippings fly out of the chute on the right-hand side.
  const chute = add(
    MeshBuilder.CreateBox('mowerChute', { width: 0.14, height: 0.08, depth: 0.2 }, scene),
    materials.dark,
  );
  chute.position.set(0.32, 0.1, 0.02);
  chute.rotation.z = -0.25;

  // The handle: two bars rising back from the deck, a grip, and the red safety bar you hold.
  /** @param {number[][]} points @param {number} radius */
  const tube = (points, radius) =>
    MeshBuilder.CreateTube(
      'mowerHandle',
      { path: points.map(([x, y, z]) => new Vector3(x, y, z)), radius, tessellation: 8 },
      scene,
    );
  for (const side of [-1, 1]) {
    add(
      tube(
        [
          [0.22 * side, 0.16, -0.28],
          [0.22 * side, 0.55, -0.62],
          [0.24 * side, 0.95, -0.95],
        ],
        0.013,
      ),
      materials.dark,
    );
  }
  add(
    tube(
      [
        [-0.26, 0.95, -0.95],
        [0.26, 0.95, -0.95],
      ],
      0.022,
    ),
    materials.dark,
  );
  add(
    tube(
      [
        [-0.22, 0.9, -0.88],
        [0.22, 0.9, -0.88],
      ],
      0.012,
    ),
    materials.deck,
  );

  // Wheels turn around their axle (local x after rotating the cylinder onto its side). A
  // light hub mark off-center makes the spin visible.
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
    const wheel = add(
      MeshBuilder.CreateCylinder(
        'mowerWheel',
        { diameter: WHEEL_RADIUS * 2, height: 0.05, tessellation: 16 },
        scene,
      ),
      materials.dark,
      axle,
    );
    wheel.rotation.z = Math.PI / 2;
    const hub = add(
      MeshBuilder.CreateBox('mowerHub', { width: 0.012, height: 0.05, depth: 0.03 }, scene),
      materials.hub,
      axle,
    );
    hub.position.set(Math.sign(x) * 0.026, 0.035, 0);
    wheels.push(axle);
  }

  return { root, chassis, deck, skirt, chute, wheels, parts };
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
  model.deck.scaling.x = stretch;
  model.skirt.scaling.x = stretch;
  for (const axle of model.wheels)
    axle.position.x = Math.sign(axle.position.x) * (width / 2 + 0.02);
  model.chute.position.x = width / 2 + 0.04;
}
