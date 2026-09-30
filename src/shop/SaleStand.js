import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { config } from '../config.js';
import { formatMoney } from '../game/pay.js';
import { plastic, roundedMesh } from '../environment/toyMeshes.js';
import { standPrompt } from './shop.js';

const COLORS = {
  wood: '#c89b62',
  cloth: '#e5484d',
  deck: '#e03c31',
  dark: '#26282d',
  blade: '#dfe3e8',
  box: '#c9a46c',
};

/**
 * A garage-sale table by the garage, with an upgrade on display and a hand-painted sign.
 * Walk up and press E to buy (the Game checks the money; see shop.js). Once it's sold, the
 * display is gone and the sign says so.
 *
 * Local +z is the front, where you stand to buy.
 */
export class SaleStand {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('@babylonjs/core').ShadowGenerator} shadows
   * @param {{ position: number[], yaw: number }} spot
   * @param {import('./shop.js').ShopItem & { sign: string }} item sign: the big text on the
   *   sign, e.g. '30" DECK'.
   */
  constructor(scene, shadows, spot, item) {
    this.item = item;
    this.owned = false;
    this.root = new TransformNode('saleStand', scene);
    this.root.position.set(spot.position[0], spot.position[1], spot.position[2]);
    this.root.rotation.y = spot.yaw;

    /**
     * @template {import('@babylonjs/core').Mesh} T
     * @param {T} mesh
     * @param {StandardMaterial} material
     * @param {number[]} at
     * @param {TransformNode} [parent]
     */
    const add = (mesh, material, [x, y, z], parent = this.root) => {
      mesh.material = material;
      mesh.parent = parent;
      mesh.position.set(x, y, z);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      shadows.addShadowCaster(mesh);
      return mesh;
    };
    const wood = plastic(scene, COLORS.wood, { shine: 0.12, power: 20 });

    // A wooden folding table under a gingham tablecloth.
    const cloth = new StandardMaterial('standCloth', scene);
    cloth.diffuseTexture = ginghamTexture(scene);
    cloth.specularColor = Color3.Black();
    add(roundedMesh('standTop', [1.3, 0.05, 0.65], 0.02, scene), wood, [0, 0.715, 0]);
    add(roundedMesh('standCloth', [1.36, 0.018, 0.71], 0.008, scene), cloth, [0, 0.749, 0]);
    const drape = plastic(scene, COLORS.cloth, { shine: 0.02 });
    for (const z of [-0.35, 0.35]) {
      add(roundedMesh('standDrape', [1.36, 0.16, 0.014], 0.007, scene), drape, [0, 0.68, z]);
    }
    for (const [x, z] of [
      [-0.6, -0.27],
      [0.6, -0.27],
      [-0.6, 0.27],
      [0.6, 0.27],
    ]) {
      add(roundedMesh('standLeg', [0.05, 0.7, 0.05], 0.02, scene), wood, [x, 0.35, z]);
    }

    // The deck on display: a glossy red shell, upside down to show off its blade.
    this.display = new TransformNode('standDisplay', scene);
    this.display.parent = this.root;
    add(
      roundedMesh('standDeck', [0.76, 0.1, 0.5], 0.04, scene, 4),
      plastic(scene, COLORS.deck, { shine: 0.55, power: 64 }),
      [0.1, 0.81, 0.02],
      this.display,
    );
    add(
      roundedMesh('standUnderside', [0.7, 0.012, 0.44], 0.006, scene),
      plastic(scene, COLORS.dark, { shine: 0.2 }),
      [0.1, 0.862, 0.02],
      this.display,
    );
    const blade = add(
      roundedMesh('standBlade', [0.62, 0.012, 0.07], 0.006, scene),
      plastic(scene, COLORS.blade, { shine: 0.9, power: 110 }),
      [0.1, 0.874, 0.02],
      this.display,
    );
    blade.rotation.y = 0.4;
    // A box of odds and ends, as at any garage sale.
    const box = plastic(scene, COLORS.box, { shine: 0.05 });
    add(roundedMesh('standBox', [0.3, 0.2, 0.24], 0.015, scene), box, [-0.45, 0.858, -0.05]);
    for (const [x, z, angle] of [
      [-0.45 - 0.15, -0.05, 0.5],
      [-0.45 + 0.15, -0.05, -0.5],
    ]) {
      const flap = add(roundedMesh('standBoxFlap', [0.012, 0.1, 0.23], 0.005, scene), box, [
        x,
        0.99,
        z,
      ]);
      flap.rotation.z = angle;
    }
    for (const [x, z, hex, size] of [
      [-0.5, -0.08, '#4c6ef5', 0.07],
      [-0.4, 0.0, '#ffc53d', 0.06],
      [-0.42, -0.12, '#46a758', 0.05],
    ]) {
      add(
        MeshBuilder.CreateSphere('standToy', { diameter: size * 2, segments: 12 }, scene),
        plastic(scene, hex, { shine: 0.5 }),
        [x, 0.95 + size * 0.4, z],
      );
    }

    // A hand-painted sign on a post behind the table, facing the front.
    add(roundedMesh('standPost', [0.05, 1.5, 0.05], 0.02, scene), wood, [0.5, 0.75, -0.32]);
    add(roundedMesh('standBoard', [0.88, 0.48, 0.04], 0.02, scene), wood, [0.5, 1.4, -0.3]);
    this.signTexture = new DynamicTexture('standSign', { width: 512, height: 256 }, scene, true);
    const signMaterial = new StandardMaterial('standSignMat', scene);
    signMaterial.diffuseTexture = this.signTexture;
    signMaterial.emissiveColor = new Color3(0.35, 0.35, 0.35); // readable in the shade
    signMaterial.specularColor = Color3.Black();
    const sign = MeshBuilder.CreatePlane('standSign', { width: 0.8, height: 0.4 }, scene);
    sign.material = signMaterial;
    sign.parent = this.root;
    sign.position.set(0.5, 1.4, -0.278);
    sign.rotation.y = Math.PI; // planes face -z; turn it to face the front (+z)
    sign.isPickable = false;
    this.paintSign(item.sign, formatMoney(item.price));

    // An invisible box you can't walk through. Tall, like the mower's (see PushMower).
    const blocker = MeshBuilder.CreateBox(
      'standBlocker',
      { width: 1.35, height: 1.6, depth: 0.7 },
      scene,
    );
    blocker.parent = this.root;
    blocker.position.y = 0.8;
    blocker.isVisible = false;
    blocker.isPickable = false;
    blocker.checkCollisions = true;

    // Where you stand to buy: just in front of the table.
    this.front = Vector3.TransformCoordinates(
      new Vector3(0, 0, 0.9),
      this.root.computeWorldMatrix(true),
    );
  }

  /**
   * @param {Vector3} feet The player's position.
   */
  isPlayerNear(feet) {
    return Math.hypot(feet.x - this.front.x, feet.z - this.front.z) < config.shop.buyRange;
  }

  /**
   * What the stand says as you walk up (see standPrompt), or null.
   *
   * @param {Vector3} feet
   * @param {number} money
   */
  promptFor(feet, money) {
    return this.isPlayerNear(feet) ? standPrompt(this.item, money, this.owned) : null;
  }

  markSold() {
    this.owned = true;
    this.display.setEnabled(false);
    this.paintSign('SOLD', 'Thank you!');
  }

  /**
   * @param {string} big
   * @param {string} small
   */
  paintSign(big, small) {
    const context = /** @type {CanvasRenderingContext2D} */ (
      /** @type {unknown} */ (this.signTexture.getContext())
    );
    context.fillStyle = '#f7efdc';
    context.fillRect(0, 0, 512, 256);
    context.fillStyle = '#c7372f';
    context.textAlign = 'center';
    context.font = 'bold 96px system-ui, sans-serif';
    context.fillText(big, 256, 120);
    context.fillStyle = '#2b2b2b';
    context.font = 'bold 72px system-ui, sans-serif';
    context.fillText(small, 256, 210);
    this.signTexture.update();
  }
}

/**
 * A red-and-white checked tablecloth pattern.
 *
 * @param {import('@babylonjs/core').Scene} scene
 */
function ginghamTexture(scene) {
  const texture = new DynamicTexture('standGingham', { width: 256, height: 128 }, scene, true);
  const context = /** @type {CanvasRenderingContext2D} */ (
    /** @type {unknown} */ (texture.getContext())
  );
  const size = 256 / 14;
  context.fillStyle = '#fbf6ee';
  context.fillRect(0, 0, 256, 128);
  context.fillStyle = 'rgb(229 72 77 / 0.55)';
  for (let i = 0; i < 14; i += 2) {
    context.fillRect(i * size, 0, size, 128); // stripes one way...
    context.fillRect(0, i * size, 256, size); // ...and the other: darker where they cross
  }
  texture.update();
  return texture;
}
