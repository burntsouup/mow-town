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
import { standPrompt } from './shop.js';

const COLORS = { wood: '#b08a5a', legs: '#4a4d52', deck: '#c7372f', dark: '#1f2023' };

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

    /** @param {string} hex */
    const material = (hex) => {
      const mat = new StandardMaterial(`stand${hex}`, scene);
      mat.diffuseColor = Color3.FromHexString(hex);
      mat.specularColor = new Color3(0.1, 0.1, 0.1);
      return mat;
    };
    /**
     * @param {import('@babylonjs/core').Mesh} mesh
     * @param {string} hex
     * @param {number[]} at
     */
    const add = (mesh, hex, [x, y, z]) => {
      mesh.material = material(hex);
      mesh.parent = this.root;
      mesh.position.set(x, y, z);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      shadows.addShadowCaster(mesh);
      return mesh;
    };

    const top = MeshBuilder.CreateBox('standTop', { width: 1.3, height: 0.05, depth: 0.65 }, scene);
    add(top, COLORS.wood, [0, 0.74, 0]);
    for (const [x, z] of [
      [-0.6, -0.27],
      [0.6, -0.27],
      [-0.6, 0.27],
      [0.6, 0.27],
    ]) {
      const leg = MeshBuilder.CreateBox(
        'standLeg',
        { width: 0.04, height: 0.72, depth: 0.04 },
        scene,
      );
      add(leg, COLORS.legs, [x, 0.36, z]);
    }

    // The deck on display: a red shell, upside down so you can see the blade.
    this.display = new TransformNode('standDisplay', scene);
    this.display.parent = this.root;
    const shell = MeshBuilder.CreateBox(
      'standDeck',
      { width: 0.76, height: 0.1, depth: 0.5 },
      scene,
    );
    add(shell, COLORS.deck, [0, 0.82, 0]).parent = this.display;
    const blade = MeshBuilder.CreateBox(
      'standBlade',
      { width: 0.66, height: 0.015, depth: 0.06 },
      scene,
    );
    add(blade, COLORS.dark, [0, 0.88, 0]).parent = this.display;
    blade.rotation.y = 0.4;

    // A sign on a post behind the table, facing the front.
    const post = MeshBuilder.CreateBox(
      'standPost',
      { width: 0.05, height: 1.5, depth: 0.05 },
      scene,
    );
    add(post, COLORS.wood, [0.5, 0.75, -0.3]);
    this.signTexture = new DynamicTexture('standSign', { width: 512, height: 256 }, scene, true);
    const signMaterial = new StandardMaterial('standSignMat', scene);
    signMaterial.diffuseTexture = this.signTexture;
    signMaterial.emissiveColor = new Color3(0.35, 0.35, 0.35); // readable in the shade
    signMaterial.specularColor = Color3.Black();
    const sign = MeshBuilder.CreatePlane('standSign', { width: 0.8, height: 0.4 }, scene);
    sign.material = signMaterial;
    sign.parent = this.root;
    sign.position.set(0.5, 1.4, -0.27);
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
    context.fillStyle = '#f4ecd8';
    context.fillRect(0, 0, 512, 256);
    context.strokeStyle = '#7a5c3a';
    context.lineWidth = 12;
    context.strokeRect(6, 6, 500, 244);
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
