import {
  Color3,
  Material,
  Matrix,
  Mesh,
  MeshBuilder,
  Ray,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { config } from '../config.js';
import { createRandom } from '../math/noise.js';
import { roundedBox } from '../math/roundedBox.js';
import { furShells } from './furGeometry.js';
import { FurMaterialPlugin } from './FurMaterialPlugin.js';
import {
  advanceWalk,
  Blinker,
  bodyBob,
  ellipsoidPoint,
  footOffset,
  limbCurve,
} from './tuftMath.js';

/** The egg-shaped body, relative to its bottom (which sits on the hips). Meters. */
const BODY = { center: { x: 0, y: 0.5, z: 0 }, radii: { x: 0.42, y: 0.5, z: 0.4 } };
/** Where the body sits: its bottom, above the feet. */
const BODY_BASE = 0.45;
const HIP = { x: 0.14, y: 0.52 };
const LIMB_SEGMENTS = 10;
const LIMB_RADIUS = 0.045;

/**
 * Tuft: a round, fluffy critter with big glossy eyes, rosy cheeks, eyebrow tufts, and soft
 * rubbery arms and legs ending in mittens and sneakers. Our own character, animated entirely
 * in code (no skeleton): each frame the body bobs and squashes, the feet step (planted, then
 * swung), and the arms swing, or reach for whatever you're holding.
 *
 * Everything hangs off `root`, at your feet; local +z is the way you face.
 */
export class Tuft {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {import('@babylonjs/core').ShadowGenerator} shadows
   * @param {TransformNode} parent The player's root (at the feet, turning with them).
   */
  constructor(scene, shadows, parent) {
    this.scene = scene;
    const colors = config.tuft.colors;
    this.root = new TransformNode('tuft', scene);
    this.root.parent = parent;
    /** The body's bottom: it bobs and squashes from here. */
    this.bodyNode = new TransformNode('tuftBody', scene);
    this.bodyNode.parent = this.root;
    this.bodyNode.position.y = BODY_BASE;
    /** @type {import('@babylonjs/core').AbstractMesh[]} Everything that fades with you. */
    this.meshes = [];
    /** @type {import('@babylonjs/core').AbstractMesh[]} The face: it fades out first. */
    this.face = [];

    /**
     * @param {string} hex
     * @param {{ shine?: number, power?: number }} [finish] shine: how strong the highlight
     *   is (0..1); power: how small and sharp it is.
     */
    const material = (hex, { shine = 0.1, power = 32 } = {}) => {
      const mat = new StandardMaterial(`tuft${hex}`, scene);
      mat.diffuseColor = Color3.FromHexString(hex);
      mat.specularColor = new Color3(shine, shine, shine);
      mat.specularPower = power;
      return mat;
    };
    /**
     * @param {Mesh} mesh
     * @param {StandardMaterial} mat
     * @param {TransformNode} parentNode
     */
    const add = (mesh, mat, parentNode, castShadow = true) => {
      mesh.material = mat;
      mesh.parent = parentNode;
      mesh.isPickable = false;
      if (castShadow) shadows.addShadowCaster(mesh);
      this.meshes.push(mesh);
      return mesh;
    };

    /** @type {FurMaterialPlugin[]} */
    this.bodyPlugins = [];
    /** @type {FurMaterialPlugin[]} */
    this.browPlugins = [];
    /** @type {Mesh[]} */
    this.browSkins = [];
    const body = this.furryEgg('tuft', {
      center: BODY.center,
      radii: BODY.radii,
      segments: 22,
      fur: config.tuft.fur,
      parent: this.bodyNode,
    });
    this.bodyPlugins = body.plugins;
    const { skin, fur } = body;
    shadows.addShadowCaster(skin);
    // Rosy cheeks, just under the eyes.
    const cheeks = [-1, 1].map((side) => {
      const { point } = ellipsoidPoint(BODY.center, BODY.radii, { x: side * 0.5, y: 0.2, z: 1 });
      return new Vector3(point.x, point.y, point.z);
    });
    for (const plugin of this.bodyPlugins) {
      plugin.cheeks = cheeks;
      plugin.cheekRadius = 0.1;
    }

    // Big glossy eyes up on top of the head: a white, a colored iris, a pupil and two
    // sparkles. They blink.
    const eyeWhite = material('#fbfbf8', { shine: 0.9, power: 110 });
    const iris = material(colors.eyes, { shine: 0.7, power: 90 });
    const pupil = material('#15131f', { shine: 1, power: 128 });
    const sparkle = new StandardMaterial('tuftSparkle', scene);
    sparkle.emissiveColor = Color3.White();
    sparkle.disableLighting = true;
    /** @type {TransformNode[]} */
    this.eyes = [];
    for (const side of [-1, 1]) {
      const { point, normal } = ellipsoidPoint(BODY.center, BODY.radii, {
        x: side * 0.3,
        y: 0.55,
        z: 1,
      });
      const eye = new TransformNode('tuftEye', scene);
      eye.parent = this.bodyNode;
      eye.position.set(
        point.x + normal.x * 0.07,
        point.y + normal.y * 0.07,
        point.z + normal.z * 0.07,
      );
      // Look mostly straight ahead, turned out a touch.
      eye.lookAt(eye.position.add(new Vector3(side * 0.18, 0.05, 1)));
      /** @param {Mesh} mesh @param {number[]} at @param {StandardMaterial} mat */
      const part = (mesh, [x, y, z], mat) => {
        mesh.position.set(x, y, z);
        this.face.push(add(mesh, mat, eye, false));
        return mesh;
      };
      part(
        MeshBuilder.CreateSphere('tuftEyeWhite', { diameter: 0.25, segments: 24 }, scene),
        [0, 0, 0],
        eyeWhite,
      );
      part(
        MeshBuilder.CreateSphere('tuftIris', { diameter: 0.14, segments: 20 }, scene),
        [0, 0, 0.1],
        iris,
      ).scaling.z = 0.4;
      part(
        MeshBuilder.CreateSphere('tuftPupil', { diameter: 0.075, segments: 16 }, scene),
        [0, 0, 0.12],
        pupil,
      ).scaling.z = 0.4;
      part(
        MeshBuilder.CreateSphere('tuftSparkle', { diameter: 0.036, segments: 8 }, scene),
        [0.028, 0.032, 0.126],
        sparkle,
      );
      part(
        MeshBuilder.CreateSphere('tuftSparkle', { diameter: 0.016, segments: 6 }, scene),
        [-0.024, -0.022, 0.127],
        sparkle,
      );
      this.eyes.push(eye);

      // A fuzzy eyebrow tuft above each eye.
      const brow = new TransformNode('tuftBrow', scene);
      brow.parent = this.bodyNode;
      brow.position.set(point.x * 1.05 + normal.x * 0.05, point.y + 0.2, point.z + normal.z * 0.03);
      brow.rotation.set(0, -side * 0.35, -side * 0.22); // outer ends down: friendly, not cross
      const tuft = this.furryEgg('tuftBrow', {
        center: { x: 0, y: 0, z: 0 },
        radii: { x: 0.085, y: 0.028, z: 0.035 },
        segments: 12,
        fur: config.tuft.browFur,
        parent: brow,
      });
      this.browPlugins.push(...tuft.plugins);
      this.browSkins.push(tuft.skin);
    }
    // A small, happy smile.
    const smile = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 6 - 1;
      const { point, normal } = ellipsoidPoint(BODY.center, BODY.radii, {
        x: t * 0.26,
        y: 0.26 - 0.1 * (1 - t * t),
        z: 1,
      });
      const out = 0.075;
      smile.push(
        new Vector3(point.x + normal.x * out, point.y + normal.y * out, point.z + normal.z * out),
      );
    }
    this.face.push(
      add(
        MeshBuilder.CreateTube('tuftSmile', { path: smile, radius: 0.02, tessellation: 8 }, scene),
        material(colors.mouth, { shine: 0.3 }),
        this.bodyNode,
        false,
      ),
    );

    // Soft, rubbery arms and legs (tubes, reshaped every frame).
    const limb = material(colors.limbs, { shine: 0.28, power: 20 });
    /** @param {string} name */
    const noodle = (name) => {
      const points = Array.from({ length: LIMB_SEGMENTS + 1 }, () => new Vector3());
      const tube = MeshBuilder.CreateTube(
        name,
        { path: points, radius: LIMB_RADIUS, tessellation: 12, updatable: true },
        scene,
      );
      add(tube, limb, this.root);
      return { tube, points };
    };
    this.arms = [noodle('tuftArmLeft'), noodle('tuftArmRight')];
    this.legs = [noodle('tuftLegLeft'), noodle('tuftLegRight')];
    // Mittens with a thumb, pointing along the arm.
    this.hands = [-1, 1].map((side) => {
      const hand = new TransformNode('tuftHand', scene);
      hand.parent = this.root;
      const palm = MeshBuilder.CreateSphere('tuftMitt', { diameter: 0.15, segments: 16 }, scene);
      palm.scaling.set(0.95, 0.8, 1.2);
      palm.position.z = 0.03;
      add(palm, limb, hand);
      const thumb = MeshBuilder.CreateCapsule(
        'tuftThumb',
        { radius: 0.028, height: 0.09, tessellation: 10 },
        scene,
      );
      thumb.position.set(-side * 0.055, 0.035, 0.02);
      thumb.rotation.set(0.9, 0, -side * 0.6);
      add(thumb, limb, hand);
      return hand;
    });
    // Sneakers: a white sole with a toe cap, a colored upper with a stripe, laces, and a
    // heel tab.
    const upper = material(colors.shoes, { shine: 0.25, power: 40 });
    const white = material('#f7f6f2', { shine: 0.15 });
    const accent = material(colors.shoeAccent, { shine: 0.25 });
    this.shoes = [-1, 1].map((side) => {
      const shoe = new TransformNode('tuftShoe', scene);
      shoe.parent = this.root;
      /** @param {number[]} size @param {number} r @param {number[]} at @param {StandardMaterial} mat */
      const piece = (size, r, [x, y, z], mat) => {
        const mesh = roundedMesh('tuftShoePart', size, r, scene);
        mesh.position.set(x, y, z);
        return add(mesh, mat, shoe);
      };
      piece([0.165, 0.04, 0.285], 0.02, [0, 0.02, 0.03], white); // sole
      piece([0.145, 0.1, 0.23], 0.05, [0, 0.085, 0.02], upper); // upper
      piece([0.14, 0.055, 0.09], 0.027, [0, 0.055, 0.125], white); // toe cap
      piece([0.01, 0.028, 0.15], 0.005, [side * 0.068, 0.08, 0.0], white); // side stripe
      piece([0.07, 0.05, 0.03], 0.012, [0, 0.12, -0.095], accent); // heel tab
      for (let i = 0; i < 3; i++) {
        const lace = MeshBuilder.CreateCapsule(
          'tuftLace',
          { radius: 0.009, height: 0.075, tessellation: 6 },
          scene,
        );
        lace.rotation.z = Math.PI / 2;
        lace.position.set(0, 0.137 - i * 0.008, 0.025 + i * 0.03);
        add(lace, white, shoe, false);
      }
      return shoe;
    });

    this.setColors(colors);

    // Animation state.
    this.phase = 0; // walk cycle, radians
    this.walking = 0; // 0 standing .. 1 walking: eases, so steps start and stop smoothly
    this.time = 0;
    this.blinker = new Blinker(createRandom(23), { every: [2.2, 5.5], closedFor: 0.13 });
    this.lastPosition = null;
    this.drag = new Vector3();
    this.toLocal = new Matrix(); // world → root space, reused every frame
    this.shade = 1; // 1 in the sun, less in shadow (the fur lights itself, see there)
    this.sunRay = new Ray(new Vector3(), new Vector3(0, 1, 0), 80);
    this.skin = skin;
    this.fur = fur;
  }

  /**
   * A furry egg shape (the body, an eyebrow): a solid skin, and fur shells over it, both
   * drawn with FurMaterialPlugin (the shells blended, see there).
   *
   * @param {string} name
   * @param {{ center: { x: number, y: number, z: number },
   *   radii: { x: number, y: number, z: number }, segments: number,
   *   fur: { shells: number, length: number, density: number, thickness: number,
   *     softness: number, sheen: number }, parent: TransformNode }} shape
   */
  furryEgg(name, { center, radii, segments, fur: settings, parent }) {
    const scene = this.scene;
    // A unit sphere, stretched into the egg; normals worked out for the stretched shape.
    const sphere = MeshBuilder.CreateSphere(`${name}Sphere`, { diameter: 2, segments }, scene);
    const unit = sphere.getVerticesData('position') ?? [];
    const indices = sphere.getIndices() ?? [];
    sphere.dispose();
    const positions = [];
    const normals = [];
    for (let i = 0; i < unit.length; i += 3) {
      const [x, y, z] = [unit[i], unit[i + 1], unit[i + 2]];
      positions.push(center.x + x * radii.x, center.y + y * radii.y, center.z + z * radii.z);
      const n = new Vector3(x / radii.x, y / radii.y, z / radii.z).normalize();
      normals.push(n.x, n.y, n.z);
    }
    const surface = { positions, normals, indices };
    /** @type {FurMaterialPlugin[]} */
    const plugins = [];
    /** @param {string} part @param {ReturnType<typeof furShells>} data @param {boolean} blended */
    const build = (part, data, blended) => {
      const mesh = new Mesh(`${name}${part}`, scene);
      const vertexData = new VertexData();
      vertexData.positions = data.positions;
      vertexData.normals = data.normals;
      vertexData.indices = data.indices;
      vertexData.applyToMesh(mesh);
      mesh.setVerticesData('furBase', data.furBase, false, 3);
      mesh.setVerticesData('furShell', data.furShell, false, 1);
      mesh.parent = parent;
      mesh.isPickable = false;
      const material = new StandardMaterial(`${name}${part}Mat`, scene);
      material.diffuseColor = Color3.White();
      material.specularColor = new Color3(0.04, 0.04, 0.04);
      if (blended) {
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
        material.disableDepthWrite = true; // the skin underneath already hides what's behind
      }
      const plugin = new FurMaterialPlugin(material);
      plugin.density = settings.density;
      plugin.thickness = settings.thickness;
      plugin.softness = settings.softness;
      plugin.sheen = settings.sheen;
      plugin.range = { bottom: center.y - radii.y, top: center.y + radii.y };
      plugins.push(plugin);
      mesh.material = material;
      this.meshes.push(mesh);
      return mesh;
    };
    const skin = build('Skin', furShells(surface, { shells: 0, length: 0 }), false);
    const fur = build('Fur', furShells(surface, { ...settings, skin: false }), true);
    // When see-through, the skin must be drawn before the fur over it.
    skin.alphaIndex = 0;
    fur.alphaIndex = 1;
    return { skin, fur, plugins, shells: settings.shells };
  }

  /**
   * @param {{ furTop: string, furBottom: string, cheeks: string }} colors
   */
  setColors(colors) {
    for (const plugin of this.bodyPlugins) {
      plugin.top = Color3.FromHexString(colors.furTop);
      plugin.bottom = Color3.FromHexString(colors.furBottom);
      plugin.cheek = Color3.FromHexString(colors.cheeks);
    }
    for (const plugin of this.browPlugins) {
      plugin.top = Color3.FromHexString(colors.brows);
      plugin.bottom = plugin.top;
    }
  }

  /** @param {number} opacity 0..1: fades Tuft so the camera can see past. */
  setOpacity(opacity) {
    // The face fades out first: seen through a see-through Tuft from behind, it would look
    // like eyes in the back of its head.
    const face = Math.min(1, Math.max(0, (opacity - 0.7) / 0.25));
    // Fur is many layers deep, and even faint layers stack up to solid, so each layer gets
    // only its share: together they let through about as much as `opacity` asks for. (Each
    // layer is only partly covered by strands, about 40%, hence counting fewer layers.)
    /** @param {number} total @param {number} layers */
    const perLayer = (total, layers) => 1 - Math.pow(1 - total, 1 / (layers * 0.4));
    const { shells } = config.tuft.fur;
    this.bodyPlugins[1].opacity = perLayer(opacity, shells);
    this.browPlugins.forEach((plugin, i) => {
      plugin.opacity = i % 2 ? perLayer(face, config.tuft.browFur.shells) : 1;
    });
    if (this.skin.material) this.skin.material.alpha = opacity;
    for (const skin of this.browSkins) if (skin.material) skin.material.alpha = face;
    for (const mesh of this.meshes) {
      if (isFur(mesh)) continue;
      mesh.visibility = this.face.includes(mesh) ? face : opacity;
    }
  }

  /**
   * @param {number} dt Seconds since the previous frame.
   * @param {Vector3[] | null} hands Where the hands should hold on, in world space (left,
   *   right), or null to swing them.
   * @param {number} lean 0..1: how far to lean in (pushing the mower).
   */
  update(dt, hands, lean) {
    const settings = config.tuft;
    this.time += dt;
    const world = this.root.computeWorldMatrix(true);
    world.invertToRef(this.toLocal);
    const position = this.root.getAbsolutePosition();
    // How far we walked this frame, and which way (for the fur to trail behind).
    let distance = 0;
    if (this.lastPosition && dt > 0) {
      const moved = position.subtract(this.lastPosition);
      moved.y = 0;
      distance = moved.length();
      if (distance > 0.5) distance = 0; // a teleport, not a step
      const local = Vector3.TransformNormal(moved.scale(1 / dt), this.toLocal);
      const trail = local.scale(-settings.fur.trail);
      this.drag = Vector3.Lerp(this.drag, trail, 1 - Math.exp(-8 * dt));
      for (const plugin of this.bodyPlugins) plugin.drag.copyFrom(this.drag);
    }
    this.lastPosition = position.clone();
    const speed = dt > 0 ? distance / dt : 0;
    const target = Math.min(1, speed / settings.walk.fullAt);
    this.walking += (target - this.walking) * (1 - Math.exp(-10 * dt));
    this.phase = advanceWalk(this.phase, distance, settings.walk.stride);
    const w = this.walking;

    // Body: bob and squash with each step; breathe while standing; lean in to push.
    const bob = bodyBob(this.phase);
    const breathe = Math.sin(this.time * 2.2) * (1 - w);
    const body = this.bodyNode;
    body.position.y = BODY_BASE + bob * settings.walk.bob * w;
    const squash = settings.walk.squash * (bob - 0.5) * w + 0.012 * breathe;
    body.scaling.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    body.rotation.x = 0.07 * w + 0.13 * lean;

    // Feet: planted, then swung forward; back to standing when you stop.
    /** @type {number[]} */
    const footForward = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const foot = footOffset(this.phase + i * Math.PI, settings.walk);
      footForward.push(foot.forward * w);
      const ankle = new Vector3(side * 0.15, 0.1 + foot.up * w, foot.forward * w - 0.02);
      this.shoes[i].position.set(side * 0.15, foot.up * w, foot.forward * w);
      this.shoes[i].rotation.x = -foot.up * w * 3;
      const hip = new Vector3(side * HIP.x, body.position.y + HIP.y - BODY_BASE + 0.05, 0);
      this.shapeLimb(this.legs[i], hip, ankle, new Vector3(0, 0, 0.04));
    }

    // Arms: swing opposite the legs, or reach for the handles.
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const shoulder = new Vector3(
        side * 0.36,
        body.position.y + 0.5,
        0.02 + body.rotation.x * 0.4,
      );
      let hand;
      if (hands) {
        hand = Vector3.TransformCoordinates(hands[i], this.toLocal);
      } else {
        const swing = -footForward[1 - i] * settings.walk.armSwing;
        hand = new Vector3(
          side * 0.52,
          0.66 + Math.abs(swing) * 0.4 + 0.01 * breathe,
          swing + 0.04,
        );
      }
      const bend = new Vector3(side * 0.08, -0.07, 0);
      const wrist = this.shapeLimb(this.arms[i], shoulder, hand, bend);
      // The mitten sits on the end of the arm, pointing the way the arm goes.
      const handNode = this.hands[i];
      handNode.position.copyFrom(hand);
      handNode.lookAt(hand.add(hand.subtract(wrist)));
    }

    // Eyes: blink now and then.
    const open = this.blinker.update(dt);
    for (const eye of this.eyes) eye.scaling.y = 0.1 + 0.9 * open;

    this.lightFur(dt);
  }

  /**
   * The fur lights itself (see FurMaterialPlugin), so it's told where the sun is, and
   * whether something (a house, a tree) stands between Tuft and the sun: one ray a frame.
   *
   * @param {number} dt
   */
  lightFur(dt) {
    const { sun, fill } = config.render;
    const ray = this.sunRay;
    ray.direction.set(-sun.direction[0], -sun.direction[1], -sun.direction[2]).normalize();
    ray.origin.copyFrom(this.bodyNode.getAbsolutePosition());
    ray.origin.y += 0.6;
    const blocked = this.scene.pickWithRay(
      ray,
      (mesh) => mesh.isPickable && mesh.isVisible && mesh.isEnabled(),
      true,
    )?.hit;
    const target = blocked ? sun.shadowDarkness : 1;
    this.shade += (target - this.shade) * (1 - Math.exp(-8 * dt));
    const sunColor = Color3.FromHexString(sun.color).scale(sun.intensity * this.shade);
    const sky = Color3.FromHexString(fill.skyColor).scale(fill.intensity);
    const ground = Color3.FromHexString(fill.groundColor).scale(fill.intensity);
    for (const plugin of [...this.bodyPlugins, ...this.browPlugins]) {
      plugin.sunDirection.copyFrom(ray.direction);
      plugin.sunColor.copyFrom(sunColor);
      plugin.skyColor.copyFrom(sky);
      plugin.groundColor.copyFrom(ground);
    }
  }

  /**
   * Bends a noodle limb from one point to another (both in root space).
   *
   * @param {{ tube: Mesh, points: Vector3[] }} limb
   * @param {Vector3} from
   * @param {Vector3} to
   * @param {Vector3} bend
   * @returns {Vector3} The point just before the end, for pointing a hand along the limb.
   */
  shapeLimb(limb, from, to, bend) {
    const curve = limbCurve(from, to, bend, LIMB_SEGMENTS);
    curve.forEach((p, i) => limb.points[i].set(p.x, p.y, p.z));
    MeshBuilder.CreateTube('limb', { path: limb.points, instance: limb.tube });
    return limb.points[LIMB_SEGMENTS - 1];
  }
}

/**
 * Whether a mesh is drawn with fur (it fades through its plugin, not `visibility`).
 *
 * @param {import('@babylonjs/core').AbstractMesh} mesh
 */
function isFur(mesh) {
  return mesh.getVerticesData?.('furShell') != null;
}

/**
 * A mesh from roundedBox, centered on its middle.
 *
 * @param {string} name
 * @param {number[]} size
 * @param {number} radius
 * @param {import('@babylonjs/core').Scene} scene
 */
function roundedMesh(name, [width, height, depth], radius, scene) {
  const shape = roundedBox({ width, height, depth, radius, segments: 3 });
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = shape.positions;
  data.normals = shape.normals;
  data.uvs = shape.uvs;
  data.indices = shape.indices;
  data.applyToMesh(mesh);
  return mesh;
}
