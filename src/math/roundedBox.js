// @ts-check

/**
 * Geometry for a box with rounded edges and corners: the chunky, soft shape that makes
 * things look like toys. Pure math, no Babylon (see Greybox.rounded for the mesh).
 *
 * How it works: build a box out of a grid on each face, then pull every point toward a
 * smaller "inner" box and push it back out by `radius` along the way it points. Points in the
 * middle of a face stay flat; points near an edge or corner land on a quarter circle (or an
 * eighth of a sphere), with smooth normals all the way round.
 *
 * Triangles wind the way Babylon expects for front faces (clockwise, seen from outside).
 *
 * @param {{ width: number, height: number, depth: number, radius: number,
 *   segments?: number }} options Meters. segments: steps around each rounded edge (more is
 *   smoother); radius is clamped to half the smallest side.
 * @returns {{ positions: number[], normals: number[], uvs: number[], indices: number[] }}
 *   uvs: 0..1 across each face (so it can be merged with other meshes, which all have them).
 */
export function roundedBox({ width, height, depth, radius, segments = 3 }) {
  const half = [width / 2, height / 2, depth / 2];
  const r = Math.max(0, Math.min(radius, ...half));
  const coords = half.map((h) => axisSteps(h, r, segments));
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {number[]} */
  const uvs = [];
  /** @type {number[]} */
  const indices = [];

  // Each face: the axis it faces along (0 = x, 1 = y, 2 = z), which way, and its two
  // in-plane axes, ordered so the triangles come out wound for Babylon.
  /** @type {[number, number, number, number][]} [axis, sign, u, v] */
  const faces = [
    [0, 1, 2, 1],
    [0, -1, 1, 2],
    [1, 1, 0, 2],
    [1, -1, 2, 0],
    [2, 1, 1, 0],
    [2, -1, 0, 1],
  ];
  for (const [axis, sign, uAxis, vAxis] of faces) {
    const us = coords[uAxis];
    const vs = coords[vAxis];
    const start = positions.length / 3;
    for (const v of vs) {
      for (const u of us) {
        const p = [0, 0, 0];
        p[axis] = sign * half[axis];
        p[uAxis] = u;
        p[vAxis] = v;
        const inner = p.map((value, i) => Math.max(-half[i] + r, Math.min(half[i] - r, value)));
        const out = p.map((value, i) => value - inner[i]);
        const length = Math.hypot(out[0], out[1], out[2]);
        const normal = length > 1e-9 ? out.map((value) => value / length) : [0, 0, 0];
        if (length <= 1e-9) normal[axis] = sign;
        positions.push(...inner.map((value, i) => value + normal[i] * r));
        normals.push(...normal);
        uvs.push((u / half[uAxis] + 1) / 2, (v / half[vAxis] + 1) / 2);
      }
    }
    const row = us.length;
    for (let j = 0; j < vs.length - 1; j++) {
      for (let i = 0; i < row - 1; i++) {
        const a = start + j * row + i;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  return { positions, normals, uvs, indices };
}

/**
 * Where the grid lines go along one side: evenly around each rounded end (so the curve is
 * smooth), and one long step across the flat middle.
 *
 * @param {number} half Half the side's length.
 * @param {number} r Rounding radius.
 * @param {number} segments
 */
function axisSteps(half, r, segments) {
  const flat = half - r;
  const end = [];
  // Each face covers 45° of an edge's rounding; the neighboring face covers the rest.
  for (let i = segments; i >= 1; i--) end.push(flat + r * Math.tan((Math.PI / 4) * (i / segments)));
  const steps = [...end.map((x) => -x), -flat, flat, ...end.reverse()];
  return steps.filter((x, i) => i === 0 || x - steps[i - 1] > 1e-9);
}
