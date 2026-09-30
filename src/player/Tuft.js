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
import { furShells } from './furGeometry.js';
import { FurMaterialPlugin } from './FurMaterialPlugin.js';
import { TuftOutfit } from './TuftOutfit.js';
import {
  advanceWalk,
  Blinker,
  bodyBob,
  bodyPoint,
  ellipsoidPoint,
  footOffset,
  limbCurve,
  springStep,
} from './tuftMath.js';
import { DEFAULT_OUTFIT } from './wardrobe.js';

/** Where the body sits: its bottom, above the feet. */
const BODY_BASE = 0.45;
const HIP = { x: 0.14, y: 0.52 };
const LIMB_SEGMENTS = 10;
const LIMB_RADIUS = 0.045;

/**
 * Tuft: a soft, fluffy gumdrop of a critter with big glossy eyes, rosy cheeks, eyebrow
 * tufts, and soft rubbery arms and legs ending in mittens and sneakers. Our own character,
 * animated entirely in code (no skeleton): each frame the body bobs, squashes and wobbles
 * like jelly, the feet step (planted, then swung), and the arms swing, or reach for whatever
 * you're holding.
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
    this.shadows = shadows;
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
     * Everything furry (the body, the eyebrows, a pompom): each is a skin and fur shells.
     *
     * @type {(ReturnType<Tuft['furryEgg']> & { face: boolean })[]}
     */
    this.furParts = [];
    const material = this.material.bind(this);
    const add = this.add.bind(this);

    /** @type {FurMaterialPlugin[]} */
    this.browPlugins = [];
    const body = this.furryEgg('tuft', {
      surfaceAt: bodyPoint,
      segments: 24,
      fur: config.tuft.fur,
      parent: this.bodyNode,
    });
    this.furParts.push({ ...body, face: false });
    this.bodyPlugins = body.plugins;
    shadows.addShadowCaster(body.skin);
    // Rosy cheeks, just under the eyes.
    const cheeks = [-1, 1].map((side) => {
      const { point } = bodyPoint({ x: side * 0.5, y: 0.2, z: 1 });
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
      const { point, normal } = bodyPoint({
        x: side * 0.3,
        y: 0.55,
        z: 1,
      });
      const eye = new TransformNode('tuftEye', scene);
      eye.parent = this.bodyNode;
      // Nestled into the fur, not stuck on top of it.
      eye.position.set(
        point.x + normal.x * 0.04,
        point.y + normal.y * 0.04,
        point.z + normal.z * 0.04,
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

      // A fuzzy eyebrow tuft above each eye, lying on the head (the top slopes back, so a
      // brow placed straight above the eye would float in front of it).
      const brow = new TransformNode('tuftBrow', scene);
      brow.parent = this.bodyNode;
      const browAt = bodyPoint({ x: side * 0.13, y: 0.36, z: 0.2 });
      const browOut = 0.05;
      brow.position.set(
        browAt.point.x + browAt.normal.x * browOut,
        browAt.point.y + browAt.normal.y * browOut,
        browAt.point.z + browAt.normal.z * browOut,
      );
      // Tipped back along the head; outer ends down: friendly, not cross.
      brow.rotation.set(-Math.asin(browAt.normal.y) * 0.7, -side * 0.35, -side * 0.22);
      const browShape = { x: 0.085, y: 0.028, z: 0.035 };
      const tuft = this.furryEgg('tuftBrow', {
        surfaceAt: (d) => ellipsoidPoint({ x: 0, y: 0, z: 0 }, browShape, d),
        segments: 12,
        fur: config.tuft.browFur,
        parent: brow,
      });
      this.browPlugins.push(...tuft.plugins);
      this.furParts.push({ ...tuft, face: true });
    }
    // A small, happy smile.
    const smile = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 6 - 1;
      const { point, normal } = bodyPoint({
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

    // Soft, rubbery arms and legs (tubes, reshaped every frame), in a color to go with the
    // fur (see setFur).
    const limb = material('#ffffff', { shine: 0.28, power: 20 });
    this.limbMaterial = limb;
    // The mittens: the same, unless you're wearing gloves.
    this.mittMaterial = material('#ffffff', { shine: 0.28, power: 20 });
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
      add(palm, this.mittMaterial, hand);
      const thumb = MeshBuilder.CreateCapsule(
        'tuftThumb',
        { radius: 0.028, height: 0.09, tessellation: 10 },
        scene,
      );
      thumb.position.set(-side * 0.055, 0.035, 0.02);
      thumb.rotation.set(0.9, 0, -side * 0.6);
      add(thumb, this.mittMaterial, hand);
      return hand;
    });
    // Where the shoes go (TuftOutfit puts sneakers or boots in them).
    this.shoes = [-1, 1].map(() => {
      const shoe = new TransformNode('tuftShoe', scene);
      shoe.parent = this.root;
      return shoe;
    });

    // Animation state.
    this.phase = 0; // walk cycle, radians
    this.walking = 0; // 0 standing .. 1 walking: eases, so steps start and stop smoothly
    this.time = 0;
    this.blinker = new Blinker(createRandom(23), { every: [2.2, 5.5], closedFor: 0.13 });
    this.lastPosition = null;
    this.drag = new Vector3();
    this.toLocal = new Matrix(); // world → root space, reused every frame
    this.shade = 1; // 1 in the sun, less in shadow (the fur lights itself, see there)
    // The jelly: the body's lean forward/back and side to side, and its squash, on springs.
    this.jelly = {
      pitch: { value: 0, velocity: 0 },
      roll: { value: 0, velocity: 0 },
      squash: { value: 0, velocity: 0 },
    };
    this.localVelocity = new Vector3();
    this.sunRay = new Ray(new Vector3(), new Vector3(0, 1, 0), 80);

    this.outfit = new TuftOutfit(this);
    this.wear(DEFAULT_OUTFIT);
  }

  /**
   * @param {string} hex
   * @param {{ shine?: number, power?: number }} [finish] shine: how strong the highlight is
   *   (0..1); power: how small and sharp it is.
   */
  material(hex, { shine = 0.1, power = 32 } = {}) {
    const mat = new StandardMaterial(`tuft${hex}`, this.scene);
    mat.diffuseColor = Color3.FromHexString(hex);
    mat.specularColor = new Color3(shine, shine, shine);
    mat.specularPower = power;
    return mat;
  }

  /**
   * Attaches a mesh to Tuft: it fades with Tuft and (unless told not to) casts a shadow.
   *
   * @template {Mesh} T
   * @param {T} mesh
   * @param {import('@babylonjs/core').Material} mat
   * @param {TransformNode} parent
   */
  add(mesh, mat, parent, castShadow = true) {
    mesh.material = mat;
    mesh.parent = parent;
    mesh.isPickable = false;
    if (castShadow) this.shadows.addShadowCaster(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  /**
   * Puts on an outfit (see wardrobe.js): fur colors, and clothes.
   *
   * @param {import('./wardrobe.js').Outfit} outfit
   */
  wear(outfit) {
    this.outfit.wear(outfit);
  }

  /**
   * A furry blob (the body, an eyebrow): a solid skin, and fur shells over it, both
   * drawn with FurMaterialPlugin (the shells blended, see there).
   *
   * @param {string} name
   * @param {{ surfaceAt: (direction: { x: number, y: number, z: number }) =>
   *   ReturnType<typeof bodyPoint>, segments: number,
   *   fur: { shells: number, length: number, density: number, thickness: number,
   *     softness: number, sheen: number }, parent: TransformNode }} shape surfaceAt: the
   *   point on the surface in a direction from the middle, and its normal.
   */
  furryEgg(name, { surfaceAt, segments, fur: settings, parent }) {
    const scene = this.scene;
    // A sphere's directions, each moved out to the surface (and facing the way it does).
    const sphere = MeshBuilder.CreateSphere(`${name}Sphere`, { diameter: 2, segments }, scene);
    const unit = sphere.getVerticesData('position') ?? [];
    const indices = sphere.getIndices() ?? [];
    sphere.dispose();
    const positions = [];
    const normals = [];
    let bottom = Infinity;
    let top = -Infinity;
    for (let i = 0; i < unit.length; i += 3) {
      const { point, normal } = surfaceAt({ x: unit[i], y: unit[i + 1], z: unit[i + 2] });
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
      bottom = Math.min(bottom, point.y);
      top = Math.max(top, point.y);
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
      plugin.range = { bottom, top };
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
   * Colors the fur, and the limbs and eyebrows to go with it.
   *
   * @param {import('./wardrobe.js').FurColor} fur
   */
  setFur(fur) {
    for (const plugin of this.bodyPlugins) {
      plugin.top = Color3.FromHexString(fur.top);
      plugin.bottom = Color3.FromHexString(fur.bottom);
      plugin.cheek = Color3.FromHexString(fur.cheeks);
    }
    for (const plugin of this.browPlugins) {
      plugin.top = Color3.FromHexString(fur.brows);
      plugin.bottom = plugin.top;
    }
    this.limbMaterial.diffuseColor = Color3.FromHexString(fur.limbs);
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
    for (const part of this.furParts) {
      const amount = part.face ? face : opacity;
      part.plugins[1].opacity = perLayer(amount, part.shells);
      if (part.skin.material) part.skin.material.alpha = amount;
    }
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
      const teleported = distance > 0.5;
      if (teleported) {
        distance = 0; // not a step
        moved.set(0, 0, 0);
        this.localVelocity.set(0, 0, 0);
      }
      const local = Vector3.TransformNormal(moved.scale(1 / dt), this.toLocal);
      // Speeding up, slowing down or turning, the top of the body lags, then springs back.
      const accel = local.subtract(this.localVelocity).scale(1 / dt);
      this.localVelocity.copyFrom(local);
      const { jelly } = settings;
      const clampLean = (/** @type {number} */ v) =>
        Math.max(-jelly.maxLean, Math.min(jelly.maxLean, v));
      this.jelly.pitch = springStep(this.jelly.pitch, clampLean(-accel.z * jelly.lean), dt, jelly);
      this.jelly.roll = springStep(this.jelly.roll, clampLean(accel.x * jelly.lean), dt, jelly);
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
    const squashTarget = settings.walk.squash * (bob - 0.5) * w + 0.012 * breathe;
    this.jelly.squash = springStep(this.jelly.squash, squashTarget, dt, settings.jelly);
    const squash = this.jelly.squash.value;
    body.scaling.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    body.rotation.x = 0.07 * w + 0.13 * lean + this.jelly.pitch.value;
    body.rotation.z = this.jelly.roll.value;
    for (const plugin of this.bodyPlugins) {
      plugin.wobble = settings.jelly.ripple * (0.5 + w);
      plugin.time = this.time;
    }

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

    this.outfit.update(); // sleeves and shorts follow the arms and legs

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
    for (const plugin of this.furParts.flatMap((part) => part.plugins)) {
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
