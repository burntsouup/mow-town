// @ts-check

/**
 * Pure conversions between a surface's real size (meters), its UV coordinates (0..1 across
 * the mesh), and its dirt grid (texels).
 */

/**
 * How many texels a surface's dirt grid needs for a given detail level.
 *
 * @param {number} widthMeters
 * @param {number} lengthMeters
 * @param {number} texelsPerMeter
 * @returns {{ width: number, height: number }} Texels across and down (at least 1 each).
 */
export function gridSize(widthMeters, lengthMeters, texelsPerMeter) {
  return {
    width: Math.max(1, Math.round(widthMeters * texelsPerMeter)),
    height: Math.max(1, Math.round(lengthMeters * texelsPerMeter)),
  };
}

/**
 * Where a UV coordinate (e.g. from a raycast hit) lands on the dirt grid.
 *
 * @param {number} u 0..1 across the surface.
 * @param {number} v 0..1 along the surface.
 * @param {{ width: number, height: number }} grid
 * @returns {{ x: number, y: number }} Texel coordinates (fractional).
 */
export function uvToTexel(u, v, grid) {
  return { x: clamp01(u) * grid.width, y: clamp01(v) * grid.height };
}

/**
 * The real-world position of a texel's center, measured from the surface's corner.
 *
 * @param {number} x Texel column.
 * @param {number} y Texel row.
 * @param {{ width: number, height: number }} grid
 * @param {number} widthMeters
 * @param {number} lengthMeters
 * @returns {{ x: number, y: number }} Meters.
 */
export function texelCenterInMeters(x, y, grid, widthMeters, lengthMeters) {
  return {
    x: ((x + 0.5) / grid.width) * widthMeters,
    y: ((y + 0.5) / grid.height) * lengthMeters,
  };
}

/**
 * Which directions a flat surface's texture runs in: the world direction of increasing u
 * (across) and of increasing v (along), from one triangle's corners and their UVs. Needed to
 * lay an elliptical spray footprint onto the dirt grid the right way round.
 *
 * @param {number[][]} corners Three [x, y, z] positions (world space).
 * @param {number[][]} uvs The three matching [u, v] texture coordinates.
 * @returns {{ u: number[], v: number[] }} Unit vectors [x, y, z].
 */
export function uvAxesFromTriangle(corners, uvs) {
  const [p0, p1, p2] = corners;
  const [t0, t1, t2] = uvs;
  const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const du1 = t1[0] - t0[0];
  const dv1 = t1[1] - t0[1];
  const du2 = t2[0] - t0[0];
  const dv2 = t2[1] - t0[1];
  const r = 1 / (du1 * dv2 - du2 * dv1);
  const u = e1.map((_, i) => (e1[i] * dv2 - e2[i] * dv1) * r);
  const v = e1.map((_, i) => (e2[i] * du1 - e1[i] * du2) * r);
  return { u: unit(u), v: unit(v) };
}

/** @param {number[]} vector */
function unit(vector) {
  const length = Math.hypot(...vector);
  return vector.map((c) => c / length);
}

/** @param {number} value */
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
