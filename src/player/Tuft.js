import {
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
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
const LIMB_SEGMENTS = 8;

/**
 * Tuft: a round, furry critter with big googly eyes, eyebrow tufts, and noodle arms and legs
 * ending in mitts and sneakers. Our own character, animated entirely in code (no skeleton):
 * each frame the body bobs and squashes, the feet step (planted, then swung), and the arms
 * swing, or reach for whatever you're holding.
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
    /** @type {import('@babylonjs/core').AbstractMesh[]} */
    this.meshes = [];
    /** @type {StandardMaterial[]} Materials that fade with setOpacity. */
    this.fading = [];
    /** @type {import('@babylonjs/core').AbstractMesh[]} The face: it fades out first. */
    this.face = [];

    /** @param {string} hex @param {number} [shine] */
    const material = (hex, shine = 0.1) => {
      const mat = new StandardMaterial(`tuft${hex}`, scene);
      mat.diffuseColor = Color3.FromHexString(hex);
      mat.specularColor = new Color3(shine, shine, shine);
      this.fading.push(mat);
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

    this.fur = this.buildFur(scene);
    shadows.addShadowCaster(this.fur);
    this.meshes.push(this.fur);

    // The face: googly eyes (they blink and glance about), eyebrow tufts and a smile.
    const eyeWhite = material('#ffffff', 0.5);
    const pupil = material('#1d1b2c', 0.6);
    const brow = material(colors.brows);
    /** @type {TransformNode[]} */
    this.eyes = [];
    for (const side of [-1, 1]) {
      const { point, normal } = ellipsoidPoint(BODY.center, BODY.radii, {
        x: side * 0.34,
        y: 0.36,
        z: 1,
      });
      const eye = new TransformNode('tuftEye', scene);
      eye.parent = this.bodyNode;
      eye.position.set(
        point.x + normal.x * 0.035,
        point.y + normal.y * 0.035,
        point.z + normal.z * 0.035,
      );
      eye.lookAt(eye.position.add(new Vector3(normal.x * 0.4, normal.y * 0.2, normal.z)));
      const white = MeshBuilder.CreateSphere(
        'tuftEyeWhite',
        { diameter: 0.21, segments: 16 },
        scene,
      );
      this.face.push(add(white, eyeWhite, eye, false));
      const dot = MeshBuilder.CreateSphere('tuftPupil', { diameter: 0.11, segments: 12 }, scene);
      dot.position.z = 0.078;
      dot.scaling.z = 0.6;
      this.face.push(add(dot, pupil, eye, false));
      const glint = MeshBuilder.CreateSphere('tuftGlint', { diameter: 0.03, segments: 6 }, scene);
      glint.position.set(0.02, 0.024, 0.11);
      this.face.push(add(glint, eyeWhite, eye, false));
      glint.material = this.glowMaterial(scene);
      this.eyes.push(eye);

      const tuftBrow = MeshBuilder.CreateCapsule(
        'tuftBrow',
        { radius: 0.024, height: 0.15, tessellation: 8 },
        scene,
      );
      tuftBrow.position.set(point.x + normal.x * 0.05, point.y + 0.14, point.z + normal.z * 0.02);
      tuftBrow.rotation.z = Math.PI / 2 - side * 0.22; // outer ends down: friendly, not cross
      this.face.push(add(tuftBrow, brow, this.bodyNode, false));
    }
    const smile = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 5 - 1;
      const { point, normal } = ellipsoidPoint(BODY.center, BODY.radii, {
        x: t * 0.28,
        y: 0.1 - 0.1 * (1 - t * t),
        z: 1,
      });
      smile.push(
        new Vector3(
          point.x + normal.x * 0.035,
          point.y + normal.y * 0.035,
          point.z + normal.z * 0.035,
        ),
      );
    }
    this.face.push(
      add(
        MeshBuilder.CreateTube('tuftSmile', { path: smile, radius: 0.018, tessellation: 6 }, scene),
        material(colors.mouth),
        this.bodyNode,
        false,
      ),
    );

    // Noodle arms and legs (tubes, reshaped every frame), with mitts and sneakers.
    const limb = material(colors.limbs);
    const shoe = material(colors.shoes, 0.2);
    const sole = material('#f6f4ef');
    /** @param {string} name */
    const noodle = (name) => {
      const points = Array.from({ length: LIMB_SEGMENTS + 1 }, () => new Vector3());
      const tube = MeshBuilder.CreateTube(
        name,
        { path: points, radius: 0.034, tessellation: 8, updatable: true },
        scene,
      );
      add(tube, limb, this.root);
      return { tube, points };
    };
    this.arms = [noodle('tuftArmLeft'), noodle('tuftArmRight')];
    this.legs = [noodle('tuftLegLeft'), noodle('tuftLegRight')];
    this.mitts = [-1, 1].map(() => {
      const mitt = MeshBuilder.CreateSphere('tuftMitt', { diameter: 0.14, segments: 12 }, scene);
      mitt.scaling.set(1, 0.85, 1.15);
      return add(mitt, limb, this.root);
    });
    this.shoes = [-1, 1].map(() => {
      const node = new TransformNode('tuftShoe', scene);
      node.parent = this.root;
      add(roundedMesh('tuftShoeTop', [0.13, 0.085, 0.22], 0.04, scene), shoe, node).position.set(
        0,
        0.06,
        0.02,
      );
      add(roundedMesh('tuftSole', [0.145, 0.03, 0.24], 0.012, scene), sole, node).position.set(
        0,
        0.015,
        0.02,
      );
      return node;
    });

    // Animation state.
    this.phase = 0; // walk cycle, radians
    this.walking = 0; // 0 standing .. 1 walking: eases, so steps start and stop smoothly
    this.time = 0;
    this.blinker = new Blinker(createRandom(23), { every: [2.2, 5.5], closedFor: 0.13 });
    this.lastPosition = null;
    this.drag = new Vector3();
    this.toLocal = new Matrix(); // world → root space, reused every frame
  }

  /**
   * The furry body: a solid skin plus shells, in one mesh drawn with FurMaterialPlugin.
   *
   * @param {import('@babylonjs/core').Scene} scene
   */
  buildFur(scene) {
    const { fur } = config.tuft;
    // A unit sphere, stretched into the egg; normals worked out for the stretched shape.
    const sphere = MeshBuilder.CreateSphere('tuftSkin', { diameter: 2, segments: 28 }, scene);
    const unit = sphere.getVerticesData('position') ?? [];
    const indices = sphere.getIndices() ?? [];
    sphere.dispose();
    const { radii, center } = BODY;
    const positions = [];
    const normals = [];
    for (let i = 0; i < unit.length; i += 3) {
      const [x, y, z] = [unit[i], unit[i + 1], unit[i + 2]];
      positions.push(center.x + x * radii.x, center.y + y * radii.y, center.z + z * radii.z);
      const n = new Vector3(x / radii.x, y / radii.y, z / radii.z).normalize();
      normals.push(n.x, n.y, n.z);
    }
    const shells = furShells({ positions, normals, indices }, fur);
    const mesh = new Mesh('tuftFur', scene);
    const data = new VertexData();
    data.positions = shells.positions;
    data.normals = shells.normals;
    data.indices = shells.indices;
    data.applyToMesh(mesh);
    mesh.setVerticesData('furBase', shells.furBase, false, 3);
    mesh.setVerticesData('furShell', shells.furShell, false, 1);
    mesh.parent = this.bodyNode;
    mesh.isPickable = false;

    const material = new StandardMaterial('tuftFurMat', scene);
    material.diffuseColor = Color3.White();
    material.specularColor = new Color3(0.05, 0.05, 0.05);
    material.backFaceCulling = false; // see the far side of the strands, too
    this.furPlugin = new FurMaterialPlugin(material);
    this.furPlugin.density = fur.density;
    this.furPlugin.thickness = fur.thickness;
    this.furPlugin.range = { bottom: 0, top: BODY.radii.y * 2 };
    this.setColors(config.tuft.colors);
    mesh.material = material;
    return mesh;
  }

  /** @param {import('@babylonjs/core').Scene} scene */
  glowMaterial(scene) {
    const mat = new StandardMaterial('tuftGlint', scene);
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    this.fading.push(mat);
    return mat;
  }

  /**
   * @param {{ furTop: string, furBottom: string }} colors
   */
  setColors(colors) {
    if (!this.furPlugin) return;
    this.furPlugin.top = Color3.FromHexString(colors.furTop);
    this.furPlugin.bottom = Color3.FromHexString(colors.furBottom);
  }

  /** @param {number} opacity 0..1: fades Tuft so the camera can see past. */
  setOpacity(opacity) {
    if (this.furPlugin) this.furPlugin.opacity = opacity;
    // The face fades out first: seen through a see-through Tuft from behind, it would look
    // like eyes in the back of its head.
    const face = Math.min(1, Math.max(0, (opacity - 0.7) / 0.25));
    for (const mesh of this.meshes) {
      if (mesh !== this.fur) mesh.visibility = this.face.includes(mesh) ? face : opacity;
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
      if (this.furPlugin) this.furPlugin.drag.copyFrom(this.drag);
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
      const ankle = new Vector3(side * 0.15, 0.07 + foot.up * w, foot.forward * w);
      this.shoes[i].position.set(ankle.x, foot.up * w, ankle.z);
      this.shoes[i].rotation.x = -foot.up * w * 3;
      const hip = new Vector3(side * HIP.x, body.position.y + HIP.y - BODY_BASE + 0.05, 0);
      this.shapeLimb(this.legs[i], hip, ankle, new Vector3(0, 0, 0.04));
    }

    // Arms: swing opposite the legs, or reach for the handles.
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const shoulder = new Vector3(
        side * 0.36,
        body.position.y + 0.52,
        0.02 + body.rotation.x * 0.4,
      );
      let hand;
      if (hands) {
        hand = Vector3.TransformCoordinates(hands[i], this.toLocal);
      } else {
        const swing = -footForward[1 - i] * settings.walk.armSwing;
        hand = new Vector3(side * 0.5, 0.68 + Math.abs(swing) * 0.4 + 0.01 * breathe, swing + 0.04);
      }
      this.mitts[i].position.copyFrom(hand);
      this.shapeLimb(this.arms[i], shoulder, hand, new Vector3(side * 0.07, -0.06, 0));
    }

    // Eyes: blink now and then.
    const open = this.blinker.update(dt);
    for (const eye of this.eyes) eye.scaling.y = 0.1 + 0.9 * open;
  }

  /**
   * Bends a noodle limb from one point to another (both in root space).
   *
   * @param {{ tube: Mesh, points: Vector3[] }} limb
   * @param {Vector3} from
   * @param {Vector3} to
   * @param {Vector3} bend
   */
  shapeLimb(limb, from, to, bend) {
    const curve = limbCurve(from, to, bend, LIMB_SEGMENTS);
    curve.forEach((p, i) => limb.points[i].set(p.x, p.y, p.z));
    MeshBuilder.CreateTube('limb', { path: limb.points, instance: limb.tube });
  }
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
  const shape = roundedBox({ width, height, depth, radius, segments: 2 });
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = shape.positions;
  data.normals = shape.normals;
  data.uvs = shape.uvs;
  data.indices = shape.indices;
  data.applyToMesh(mesh);
  return mesh;
}
