// @ts-check

/**
 * Pure geometry for leafy plants: little clusters of leaves (each leaf a flat, pointed
 * diamond, fanned out round the cluster's middle) scattered over the surface of a plant's
 * rough shape (a few overlapping balls). The trick that makes stylized trees look soft and
 * full: every leaf's lighting uses a normal pointing out from the middle of the whole plant,
 * not the leaf's own facing, so the crowd of leaves shades like one fluffy ball.
 *
 * Leaves are real triangles rather than pictures of leaves on squares: their edges stay
 * crisp and smooth at any distance, and nothing has to be cut out pixel by pixel.
 *
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{ x: number, y: number, z: number, radius: number, squash?: number }} Blob A
 *   ball of leaves: center, radius (meters), and squash (< 1 flattens it).
 */

/**
 * @param {Blob[]} blobs The plant's shape.
 * @param {{ density: number, size: number, random: () => number, leaves?: number,
 *   softness?: number, shade?: number }} options density: clusters per square meter of
 *   surface; size: a cluster's width (meters); leaves: how many leaves in each; softness:
 *   0 = each ball shades on its own, 1 = the whole plant shades as one; shade: how much
 *   darker the underside is (0..1).
 * @returns {{ positions: number[], normals: number[], colors: number[], indices: number[],
 *   count: number }} count: how many clusters. Each leaf is 4 points and 2 triangles.
 */
export function leafCards(blobs, options) {
  const { density, size, random, leaves = 5, softness = 0.6, shade = 0.45 } = options;
  const middle = centroid(blobs);
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {number[]} */
  const colors = [];
  /** @type {number[]} */
  const indices = [];
  let count = 0;
  for (const blob of blobs) {
    const squash = blob.squash ?? 1;
    const cards = Math.round(4 * Math.PI * blob.radius * blob.radius * squash * density);
    for (let k = 0; k < cards; k++) {
      const dir = randomDirection(random);
      const reach = blob.radius * (0.9 + 0.15 * random());
      const at = {
        x: blob.x + dir.x * reach,
        y: blob.y + dir.y * reach * squash,
        z: blob.z + dir.z * reach,
      };
      // Buried deep inside a neighbor: nobody would ever see it.
      if (blobs.some((other) => other !== blob && inside(at, other, 0.8))) continue;
      const outward = normalize(sub(at, middle));
      const normal = normalize(lerp(dir, outward, softness));
      // Each card faces roughly outward, tipped a bit at random, and spun round.
      const facing = normalize({
        x: normal.x + (random() - 0.5) * 1.2,
        y: normal.y + (random() - 0.5) * 1.2,
        z: normal.z + (random() - 0.5) * 1.2,
      });
      const helper = Math.abs(facing.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      const across = normalize(cross(facing, helper));
      const up = cross(across, facing);
      const spin = random() * Math.PI * 2;
      const u = add(scale(across, Math.cos(spin)), scale(up, Math.sin(spin)));
      const v = add(scale(across, -Math.sin(spin)), scale(up, Math.cos(spin)));
      const length = (size / 2) * (0.8 + 0.4 * random());
      // Darker underneath and on the inside, lighter on top; each cluster a touch different.
      const light = Math.max(0.3, 1 - shade * (0.5 - 0.5 * normal.y) * 1.2);
      const tint = 0.88 + 0.24 * random();
      for (let l = 0; l < leaves; l++) {
        // Leaves fan out round the middle, each its own length and a little off its slot.
        const angle = ((l + 0.3 * random()) / leaves) * Math.PI * 2;
        const along = add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle)));
        const side = add(scale(u, -Math.sin(angle)), scale(v, Math.cos(angle)));
        const leafLength = length * (0.75 + 0.35 * random());
        const width = leafLength * 0.42;
        const base = add(at, scale(along, length * 0.12));
        const tip = add(base, scale(along, leafLength));
        const widest = add(base, scale(along, leafLength * 0.38));
        const first = positions.length / 3;
        // The base, one side, the tip, the other side; the tip catches more light.
        for (const [point, bright] of /** @type {[Vec3, number][]} */ ([
          [base, 0.82],
          [add(widest, scale(side, width / 2)), 1],
          [tip, 1.12],
          [add(widest, scale(side, -width / 2)), 1],
        ])) {
          positions.push(point.x, point.y, point.z);
          normals.push(normal.x, normal.y, normal.z);
          const c = light * tint * bright;
          colors.push(c, c, c, 1);
        }
        indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
      }
      count++;
    }
  }
  return { positions, normals, colors, indices, count };
}

/**
 * Little flowers, each a flat, cupped head facing the sky (tipped a little): a round middle,
 * and petals (lobes round the edge) in the flower's color.
 *
 * @param {{ x: number, y: number, z: number, radius: number, petals: number,
 *   color: number[], middle: number[], tilt: number[] }[]} flowers color, middle: RGB 0..1;
 *   tilt: [x, z], how far the head tips each way (radians, small).
 * @returns {{ positions: number[], normals: number[], colors: number[], indices: number[] }}
 */
export function flowerHeads(flowers) {
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {number[]} */
  const colors = [];
  /** @type {number[]} */
  const indices = [];
  const steps = 30;
  for (const flower of flowers) {
    const [tiltX, tiltZ] = flower.tilt;
    // A small tip of the head: its up direction, and where a point (dx, dy, dz) ends up.
    const up = normalize({ x: tiltZ, y: 1, z: -tiltX });
    /** @param {number} dx @param {number} dy @param {number} dz */
    const place = (dx, dy, dz) => ({
      x: flower.x + dx + up.x * dy,
      y: flower.y + dy - tiltZ * dx + tiltX * dz,
      z: flower.z + dz + up.z * dy,
    });
    const first = positions.length / 3;
    /** @param {Vec3} p @param {number[]} rgb */
    const point = (p, rgb) => {
      positions.push(p.x, p.y, p.z);
      normals.push(up.x, up.y, up.z);
      colors.push(rgb[0], rgb[1], rgb[2], 1);
    };
    point(place(0, flower.radius * 0.12, 0), flower.middle); // the middle, domed
    // The middle's edge, then the petals' edge: lobes, curling up a little at the tips.
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      const inner = flower.radius * 0.3;
      point(place(c * inner, 0.02 * flower.radius, s * inner), flower.middle);
      const lobe = Math.pow(Math.abs(Math.cos((flower.petals / 2) * angle)), 0.7);
      const outer = flower.radius * (0.45 + 0.55 * lobe);
      point(place(c * outer, 0.25 * flower.radius * lobe, s * outer), flower.color);
    }
    for (let i = 0; i < steps; i++) {
      const next = (i + 1) % steps;
      const [inner, outer] = [first + 1 + i * 2, first + 2 + i * 2];
      const [innerNext, outerNext] = [first + 1 + next * 2, first + 2 + next * 2];
      indices.push(first, innerNext, inner); // the middle
      indices.push(inner, innerNext, outer, outer, innerNext, outerNext); // a petal band
    }
  }
  return { positions, normals, colors, indices };
}

/**
 * The middle of a plant, weighted by how big each ball is.
 *
 * @param {Blob[]} blobs
 * @returns {Vec3}
 */
export function centroid(blobs) {
  let total = 0;
  const sum = { x: 0, y: 0, z: 0 };
  for (const b of blobs) {
    const weight = b.radius ** 3;
    total += weight;
    sum.x += b.x * weight;
    sum.y += b.y * weight;
    sum.z += b.z * weight;
  }
  return total > 0 ? scale(sum, 1 / total) : sum;
}

/**
 * @param {Vec3} p
 * @param {Blob} blob
 * @param {number} depth Fraction of the radius that counts as inside.
 */
function inside(p, blob, depth) {
  const squash = blob.squash ?? 1;
  const dx = (p.x - blob.x) / blob.radius;
  const dy = (p.y - blob.y) / (blob.radius * squash);
  const dz = (p.z - blob.z) / blob.radius;
  return dx * dx + dy * dy + dz * dz < depth * depth;
}

/** @param {() => number} random A uniformly random direction. */
function randomDirection(random) {
  const y = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const r = Math.sqrt(1 - y * y);
  return { x: r * Math.cos(angle), y, z: r * Math.sin(angle) };
}

/** @param {Vec3} a @param {Vec3} b */
function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** @param {Vec3} a @param {Vec3} b */
function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** @param {Vec3} a @param {number} s */
function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/** @param {Vec3} a @param {Vec3} b @param {number} t */
function lerp(a, b, t) {
  return add(scale(a, 1 - t), scale(b, t));
}

/** @param {Vec3} a @param {Vec3} b */
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** @param {Vec3} a */
function normalize(a) {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / length);
}
