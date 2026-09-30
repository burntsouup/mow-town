import {
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { config } from '../config.js';
import { roundedMesh } from '../environment/toyMeshes.js';
import {
  bodyBand,
  CLOTHES,
  directionAt,
  elevationAtLevel,
  furCover,
  starOutline,
} from './clothesMath.js';
import { bodyPoint, ellipsoidPoint } from './tuftMath.js';
import { clothColor, furColor } from './wardrobe.js';

/** How far along an arm or leg a sleeve reaches, in points along the limb (see Tuft). */
const SLEEVE_POINTS = 5;

/**
 * @typedef {import('./wardrobe.js').Outfit} Outfit
 * @typedef {import('./wardrobe.js').SlotId} SlotId
 * @typedef {import('@babylonjs/core').StandardMaterial} StandardMaterial
 * @typedef {{ tube: Mesh, points: Vector3[], limb: { points: Vector3[] } }} Sleeve
 */

/**
 * Tuft's clothes (see wardrobe.js for what there is). Every style is built once, up front,
 * and switched on or off, so changing clothes in the closet is instant. Clothes are fitted
 * to the body (clothesMath.js), and the fur underneath them is hidden so it doesn't poke
 * through. Sleeves and shorts legs are tubes that follow the arms and legs every frame.
 */
export class TuftOutfit {
  /** @param {import('./Tuft.js').Tuft} tuft */
  constructor(tuft) {
    this.tuft = tuft;
    const fabric = { shine: 0.06, power: 16 };
    this.materials = {
      hat: tuft.material('#ffffff', fabric),
      hatAccent: tuft.material('#ffffff', fabric),
      straw: tuft.material('#e9c46a', { shine: 0.08 }),
      frames: tuft.material('#ffffff', { shine: 0.8, power: 96 }),
      lens: tuft.material('#1b2231', { shine: 1, power: 160 }),
      cuffs: tuft.material('#ffffff', fabric),
      shirt: tuft.material('#ffffff', fabric),
      stripes: tuft.material('#ffffff', fabric),
      shorts: tuft.material('#ffffff', fabric),
      shoes: tuft.material('#ffffff', { shine: 0.25, power: 40 }),
      shoeAccent: tuft.material('#ffffff', { shine: 0.25 }),
      white: tuft.material('#f7f6f2', { shine: 0.15 }),
      boots: tuft.material('#ffffff', { shine: 0.6, power: 90 }),
      bootSole: tuft.material('#34343c', { shine: 0.1 }),
    };
    this.materials.lens.alpha = 0.82;
    this.materials.lens.backFaceCulling = false;
    this.stripes = new DynamicTexture('tuftStripes', { width: 4, height: 64 }, tuft.scene, false);
    this.stripes.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.stripes.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.materials.stripes.diffuseTexture = this.stripes;

    /**
     * Each style's parts, by slot: switched on while it's worn. (Parts can be shared: all
     * shirts share a body.)
     *
     * @type {Record<Exclude<SlotId, 'fur'>, Record<string, TransformNode[]>>}
     */
    this.styles = { hat: {}, glasses: {}, gloves: {}, shirt: {}, shorts: {}, shoes: {} };
    /** @type {Sleeve[]} */
    this.sleeves = [];
    /** @type {import('./FurMaterialPlugin.js').FurMaterialPlugin[]} */
    this.pompom = [];
    this.buildHats();
    this.buildGlasses();
    this.buildGloves();
    this.buildShirts();
    this.buildShorts();
    this.buildShoes();
  }

  /**
   * @param {Outfit} outfit
   */
  wear(outfit) {
    const { tuft, materials } = this;
    const fur = furColor(outfit.fur.color);
    tuft.setFur(fur);
    const cover = furCover(outfit);
    for (const plugin of tuft.bodyPlugins) plugin.cover = cover;

    for (const slot of /** @type {(keyof TuftOutfit['styles'])[]} */ (Object.keys(this.styles))) {
      const styles = this.styles[slot];
      for (const parts of Object.values(styles)) for (const part of parts) part.setEnabled(false);
      for (const part of styles[outfit[slot].style] ?? []) part.setEnabled(true);
    }

    /** @param {StandardMaterial} material @param {string} hex */
    const paint = (material, hex) => material.diffuseColor.copyFrom(Color3.FromHexString(hex));
    const hat = clothColor(outfit.hat.color);
    paint(materials.hat, hat.hex);
    paint(materials.hatAccent, hat.accent);
    for (const plugin of this.pompom) {
      plugin.top = Color3.FromHexString(hat.accent);
      plugin.bottom = plugin.top;
    }
    paint(materials.frames, clothColor(outfit.glasses.color).hex);
    const gloves = clothColor(outfit.gloves.color);
    const gloved = outfit.gloves.style !== 'none';
    paint(tuft.mittMaterial, gloved ? gloves.hex : fur.limbs);
    paint(materials.cuffs, gloves.accent);
    const shirt = clothColor(outfit.shirt.color);
    paint(materials.shirt, shirt.hex);
    this.paintStripes(shirt.hex, shirt.id === 'white' ? '#4c6ef5' : '#f7f5ef');
    paint(materials.shorts, clothColor(outfit.shorts.color).hex);
    const shoes = clothColor(outfit.shoes.color);
    paint(materials.shoes, shoes.hex);
    paint(materials.shoeAccent, shoes.accent);
    paint(materials.boots, shoes.hex);
  }

  /** Sleeves and shorts legs follow the arms and legs (call after they've moved). */
  update() {
    for (const sleeve of this.sleeves) {
      if (!sleeve.tube.isEnabled()) continue;
      sleeve.points.forEach((p, i) => p.copyFrom(sleeve.limb.points[i]));
      MeshBuilder.CreateTube('sleeve', { path: sleeve.points, instance: sleeve.tube });
    }
  }

  /**
   * @param {string} name
   * @param {TransformNode} parent
   */
  node(name, parent) {
    const node = new TransformNode(name, this.tuft.scene);
    node.parent = parent;
    return node;
  }

  /**
   * A mesh from positions, normals, UVs and indices (a bodyBand, say).
   *
   * @param {string} name
   * @param {{ positions: number[], normals: number[], uvs?: number[], indices: number[] }} data
   */
  mesh(name, data) {
    const mesh = new Mesh(name, this.tuft.scene);
    const vertexData = new VertexData();
    vertexData.positions = data.positions;
    vertexData.normals = data.normals;
    if (data.uvs) vertexData.uvs = data.uvs;
    vertexData.indices = data.indices;
    vertexData.applyToMesh(mesh);
    return mesh;
  }

  /**
   * A soft rolled edge (a hem, a hat band) along a closed loop of points.
   *
   * @param {string} name
   * @param {{ x: number, y: number, z: number }[]} loop
   * @param {number} radius
   */
  hem(name, loop, radius) {
    const path = loop.map((p) => new Vector3(p.x, p.y, p.z));
    return MeshBuilder.CreateTube(name, { path, radius, tessellation: 10 }, this.tuft.scene);
  }

  /**
   * Stripes for the striped tee.
   *
   * @param {string} base
   * @param {string} stripe
   */
  paintStripes(base, stripe) {
    const context = this.stripes.getContext();
    const { width, height } = this.stripes.getSize();
    const count = 9;
    for (let i = 0; i < count; i++) {
      context.fillStyle = i % 2 ? stripe : base;
      context.fillRect(0, (i * height) / count, width, height / count + 1);
    }
    this.stripes.update(false);
  }

  buildHats() {
    const { tuft, materials } = this;
    const scene = tuft.scene;
    for (const [style, { line, offset }] of Object.entries(CLOTHES.hats)) {
      const hat = this.node(`tuftHat-${style}`, tuft.bodyNode);
      this.styles.hat[style] = [hat];
      const columns = 36;
      const crown = bodyBand(bodyPoint, { from: line, to: null, offset, rows: 10, columns });
      const crownMaterial = style === 'straw' ? materials.straw : materials.hat;
      tuft.add(this.mesh('tuftHatCrown', crown), crownMaterial, hat);
      // The rim: a ring round the head, tilted back with the hat.
      const loop = crown.bottom.slice(0, -1);
      const center = loop
        .reduce((sum, p) => sum.addInPlaceFromFloats(p.x, p.y, p.z), new Vector3())
        .scaleInPlace(1 / loop.length);
      const radius = loop.reduce((sum, p) => sum + Math.hypot(p.x - center.x, p.z - center.z), 0);
      const rim = { center, radius: radius / loop.length, tilt: -Math.atan(line.tilt) };
      const top = crown.top[0];

      if (style === 'cap') {
        const front = crown.bottom[columns / 2];
        const brim = MeshBuilder.CreateCylinder(
          'tuftCapBrim',
          { height: 0.02, diameter: 0.34, tessellation: 36 },
          scene,
        );
        brim.scaling.z = 0.8;
        brim.position.set(front.x, front.y - 0.012, front.z + 0.08);
        brim.rotation.x = rim.tilt + 0.22;
        tuft.add(brim, materials.hat, hat);
        const button = MeshBuilder.CreateSphere('tuftCapButton', { diameter: 0.05 }, scene);
        button.position.set(top.x, top.y - 0.005, top.z);
        button.scaling.y = 0.6;
        tuft.add(button, materials.hatAccent, hat, false);
      } else if (style === 'beanie') {
        tuft.add(this.hem('tuftBeanieCuff', crown.bottom, 0.032), materials.hat, hat);
        // A fluffy pompom on top: a little furry ball, like Tuft.
        const pompomNode = this.node('tuftPompom', hat);
        pompomNode.position.set(top.x, top.y + 0.04, top.z);
        const pompom = tuft.furryEgg('tuftPompom', {
          surfaceAt: (d) => ellipsoidPoint({ x: 0, y: 0, z: 0 }, POMPOM, d),
          segments: 12,
          fur: config.tuft.pompomFur,
          parent: pompomNode,
        });
        for (const plugin of pompom.plugins) plugin.cheekRadius = 1e-4; // no rosy cheeks
        this.pompom.push(...pompom.plugins);
        tuft.furParts.push({ ...pompom, face: false });
      } else if (style === 'bucket') {
        const brim = MeshBuilder.CreateCylinder(
          'tuftBucketBrim',
          {
            diameterTop: rim.radius * 2,
            diameterBottom: rim.radius * 2 + 0.26,
            height: 0.08,
            tessellation: 40,
            cap: Mesh.NO_CAP,
            sideOrientation: Mesh.DOUBLESIDE,
          },
          scene,
        );
        brim.position.set(rim.center.x, rim.center.y - 0.035, rim.center.z);
        brim.rotation.x = rim.tilt;
        tuft.add(brim, materials.hat, hat);
      } else if (style === 'straw') {
        const brim = MeshBuilder.CreateCylinder(
          'tuftStrawBrim',
          { diameter: rim.radius * 2 + 0.52, height: 0.016, tessellation: 48 },
          scene,
        );
        brim.position.set(rim.center.x, rim.center.y - 0.005, rim.center.z);
        brim.rotation.x = rim.tilt;
        tuft.add(brim, materials.straw, hat);
        const ribbon = crown.bottom.map((p) => ({ x: p.x * 1.02, y: p.y + 0.028, z: p.z * 1.02 }));
        tuft.add(this.hem('tuftStrawRibbon', ribbon, 0.022), materials.hat, hat, false);
      }
    }
  }

  buildGlasses() {
    const { tuft, materials } = this;
    const scene = tuft.scene;
    for (const style of ['round', 'shades', 'stars']) {
      const glasses = this.node(`tuftGlasses-${style}`, tuft.bodyNode);
      this.styles.glasses[style] = [glasses];
      /** @param {Mesh} mesh @param {StandardMaterial} material @param {TransformNode} parent */
      const part = (mesh, material, parent) => {
        tuft.add(mesh, material, parent, false);
        tuft.face.push(mesh); // fades with the face (see Tuft.setOpacity)
        return mesh;
      };
      tuft.eyes.forEach((eye, i) => {
        const side = i === 0 ? -1 : 1;
        // Lined up with the eye, just in front of it.
        const holder = this.node('tuftGlassesEye', glasses);
        holder.position.copyFrom(eye.position);
        if (eye.rotationQuaternion) holder.rotationQuaternion = eye.rotationQuaternion.clone();
        else holder.rotation.copyFrom(eye.rotation);
        const z = 0.135;
        let edge = 0.135; // how far out the frame goes, for the arms
        if (style === 'stars') {
          const star = starOutline(5, 0.16, 0.085).map((p) => new Vector3(p.x, p.y, z));
          const frame = MeshBuilder.CreateTube(
            'tuftStarFrame',
            { path: [...star, star[0]], radius: 0.012, tessellation: 8 },
            scene,
          );
          part(frame, materials.frames, holder);
          part(this.fan('tuftStarLens', star), materials.lens, holder);
          edge = 0.14;
        } else {
          const frame = MeshBuilder.CreateTorus(
            'tuftGlassesFrame',
            { diameter: 0.27, thickness: 0.022, tessellation: 36 },
            scene,
          );
          frame.rotation.x = Math.PI / 2;
          frame.position.z = z;
          part(frame, materials.frames, holder);
          if (style === 'shades') {
            const lens = MeshBuilder.CreateDisc(
              'tuftLens',
              { radius: 0.13, tessellation: 36 },
              scene,
            );
            lens.position.z = z;
            part(lens, materials.lens, holder);
          }
        }
        // An arm from the frame back to the side of the head (worked out in the body's
        // space: the frame is turned with the eye, the head isn't).
        const turn = holder.rotationQuaternion ?? Quaternion.FromEulerVector(holder.rotation);
        const toBody = Matrix.Compose(Vector3.One(), turn, holder.position);
        const hinge = Vector3.TransformCoordinates(new Vector3(side * edge, 0.02, z), toBody);
        const angle = side * 1.2;
        const ear = bodyPoint(
          directionAt(angle, elevationAtLevel(bodyPoint, angle, { height: hinge.y, tilt: 0 })),
        );
        const tucked = new Vector3(ear.point.x, ear.point.y, ear.point.z).addInPlaceFromFloats(
          ear.normal.x * 0.03,
          ear.normal.y * 0.03,
          ear.normal.z * 0.03,
        );
        const arm = MeshBuilder.CreateTube(
          'tuftGlassesArm',
          { path: [hinge, tucked], radius: 0.011, tessellation: 8 },
          scene,
        );
        part(arm, materials.frames, glasses);
      });
    }
  }

  /**
   * A flat, filled shape from its outline (a star lens): triangles fanning out from the
   * middle.
   *
   * @param {string} name
   * @param {Vector3[]} outline
   */
  fan(name, outline) {
    const middle = outline
      .reduce((sum, p) => sum.addInPlace(p), new Vector3())
      .scaleInPlace(1 / outline.length);
    const positions = [middle, ...outline].flatMap((p) => [p.x, p.y, p.z]);
    /** @type {number[]} */
    const indices = [];
    for (let i = 0; i < outline.length; i++) {
      indices.push(0, 1 + ((i + 1) % outline.length), 1 + i);
    }
    /** @type {number[]} */
    const normals = [];
    VertexData.ComputeNormals(positions, indices, normals);
    return this.mesh(name, { positions, normals, indices });
  }

  buildGloves() {
    const { tuft, materials } = this;
    // Gloves recolor the mittens (see wear); these are the cuffs round the wrists.
    this.styles.gloves.garden = tuft.hands.map((hand) => {
      const cuff = MeshBuilder.CreateTorus(
        'tuftGloveCuff',
        { diameter: 0.09, thickness: 0.04, tessellation: 24 },
        tuft.scene,
      );
      cuff.rotation.x = Math.PI / 2;
      cuff.position.z = -0.045;
      return tuft.add(cuff, materials.cuffs, hand, false);
    });
  }

  buildShirts() {
    const { tuft, materials } = this;
    const band = bodyBand(bodyPoint, { ...CLOTHES.shirt, rows: 12, columns: 44 });
    /** @param {string} name @param {StandardMaterial} material */
    const shirtBody = (name, material) => {
      const node = this.node(name, tuft.bodyNode);
      tuft.add(this.mesh('tuftShirt', band), material, node, false);
      tuft.add(this.hem('tuftCollar', band.top, 0.02), materials.shirt, node, false);
      tuft.add(this.hem('tuftHem', band.bottom, 0.014), materials.shirt, node, false);
      return node;
    };
    const plain = shirtBody('tuftShirt-plain', materials.shirt);
    const striped = shirtBody('tuftShirt-striped', materials.stripes);
    const sleeves = this.node('tuftSleeves', tuft.root);
    for (const arm of tuft.arms) this.sleeve('tuftSleeve', arm, 0.068, materials.shirt, sleeves);
    this.styles.shirt = { tee: [plain, sleeves], stripes: [striped, sleeves], tank: [plain] };
  }

  buildShorts() {
    const { tuft, materials } = this;
    const { to, offset } = CLOTHES.shorts;
    const band = bodyBand(bodyPoint, { from: null, to, offset, rows: 8, columns: 40 });
    const shorts = this.node('tuftShorts', tuft.bodyNode);
    tuft.add(this.mesh('tuftShorts', band), materials.shorts, shorts, false);
    tuft.add(this.hem('tuftWaistband', band.top, 0.02), materials.shorts, shorts, false);
    const legs = this.node('tuftShortsLegs', tuft.root);
    for (const leg of tuft.legs) this.sleeve('tuftShortsLeg', leg, 0.078, materials.shorts, legs);
    this.styles.shorts = { shorts: [shorts, legs] };
  }

  /**
   * A sleeve over the top of an arm or leg (reshaped every frame in update).
   *
   * @param {string} name
   * @param {{ points: Vector3[] }} limb
   * @param {number} radius
   * @param {StandardMaterial} material
   * @param {TransformNode} parent
   */
  sleeve(name, limb, radius, material, parent) {
    const points = limb.points.slice(0, SLEEVE_POINTS).map((p) => p.clone());
    const tube = MeshBuilder.CreateTube(
      name,
      { path: points, radius, tessellation: 14, cap: Mesh.CAP_END, updatable: true },
      this.tuft.scene,
    );
    this.tuft.add(tube, material, parent, false);
    this.sleeves.push({ tube, points, limb });
  }

  buildShoes() {
    const { tuft, materials } = this;
    const scene = tuft.scene;
    /** @param {TransformNode} shoe @param {number[]} size @param {number} r @param {number[]} at @param {StandardMaterial} material */
    const piece = (shoe, size, r, [x, y, z], material) => {
      const mesh = roundedMesh('tuftShoePart', size, r, scene);
      mesh.position.set(x, y, z);
      return tuft.add(mesh, material, shoe);
    };
    // Sneakers: a white sole with a toe cap, a colored upper with a stripe, laces, and a
    // heel tab.
    const sneakers = tuft.shoes.map((foot, i) => {
      const side = i === 0 ? -1 : 1;
      const shoe = this.node('tuftSneaker', foot);
      piece(shoe, [0.165, 0.04, 0.285], 0.02, [0, 0.02, 0.03], materials.white); // sole
      piece(shoe, [0.145, 0.1, 0.23], 0.05, [0, 0.085, 0.02], materials.shoes); // upper
      piece(shoe, [0.14, 0.055, 0.09], 0.027, [0, 0.055, 0.125], materials.white); // toe cap
      piece(shoe, [0.01, 0.028, 0.15], 0.005, [side * 0.068, 0.08, 0.0], materials.white);
      piece(shoe, [0.07, 0.05, 0.03], 0.012, [0, 0.12, -0.095], materials.shoeAccent); // heel tab
      for (let lace = 0; lace < 3; lace++) {
        const mesh = MeshBuilder.CreateCapsule(
          'tuftLace',
          { radius: 0.009, height: 0.075, tessellation: 6 },
          scene,
        );
        mesh.rotation.z = Math.PI / 2;
        mesh.position.set(0, 0.137 - lace * 0.008, 0.025 + lace * 0.03);
        tuft.add(mesh, materials.white, shoe, false);
      }
      return shoe;
    });
    // Rain boots: tall, round and glossy, with a dark sole and a rolled top.
    const boots = tuft.shoes.map((foot) => {
      const boot = this.node('tuftBoot', foot);
      piece(boot, [0.17, 0.035, 0.28], 0.016, [0, 0.018, 0.03], materials.bootSole);
      piece(boot, [0.15, 0.25, 0.19], 0.07, [0, 0.14, 0], materials.boots); // leg
      piece(boot, [0.15, 0.1, 0.25], 0.05, [0, 0.07, 0.03], materials.boots); // foot
      const rim = MeshBuilder.CreateTorus(
        'tuftBootRim',
        { diameter: 0.125, thickness: 0.026, tessellation: 24 },
        scene,
      );
      rim.position.y = 0.262;
      tuft.add(rim, materials.boots, boot, false);
      return boot;
    });
    this.styles.shoes = { sneakers, boots };
  }
}

/** The pompom's size (radii, meters). */
const POMPOM = { x: 0.06, y: 0.055, z: 0.06 };
