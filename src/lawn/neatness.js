// @ts-check

/**
 * How neat the stripes on a lawn are, from 0 (a scribble) to 1 (perfectly parallel rows).
 *
 * The lawn is split into square patches. In each patch we check how parallel the mowing
 * directions are: a row and the next one, mowed the other way, count as parallel, because
 * that's exactly what makes stripes. So tidy rows score high in any direction, and even
 * rows that change direction around a tree only lose a little, in the patches where they
 * bend. The patches are averaged by how much mowed lawn they have.
 *
 * The trick for "opposite directions count as the same": double each direction's angle
 * before averaging. Pointing +x (0°) and -x (180°) both become 0° (and 360°), so they add
 * up, while +x and +z (90° → 180°) cancel out. The length of the average is the score.
 *
 * @param {{ columns: number, rows: number, texelsPerMeter: number, mask: Uint8Array,
 *   mowX: Float32Array, mowZ: Float32Array }} grid A GrassGrid (only these fields are used).
 * @param {number} patchSize Meters along each side of a patch.
 * @returns {number} 0..1, or 0 if nothing has been mowed.
 */
export function stripeNeatness(grid, patchSize) {
  const texels = Math.max(1, Math.round(patchSize * grid.texelsPerMeter));
  const patchColumns = Math.ceil(grid.columns / texels);
  const patchCount = patchColumns * Math.ceil(grid.rows / texels);
  const sumCos = new Float64Array(patchCount);
  const sumSin = new Float64Array(patchCount);
  let mowed = 0;
  for (let row = 0; row < grid.rows; row++) {
    const patchRow = Math.floor(row / texels) * patchColumns;
    for (let column = 0; column < grid.columns; column++) {
      const i = row * grid.columns + column;
      const x = grid.mowX[i];
      const z = grid.mowZ[i];
      if (!grid.mask[i] || (x === 0 && z === 0)) continue;
      // For a unit vector at angle a: cos 2a = x² - z², sin 2a = 2xz.
      const patch = patchRow + Math.floor(column / texels);
      sumCos[patch] += x * x - z * z;
      sumSin[patch] += 2 * x * z;
      mowed++;
    }
  }
  if (mowed === 0) return 0;
  // Each patch's score is |sum| / count; weighting by count, the counts cancel.
  let total = 0;
  for (let patch = 0; patch < patchCount; patch++) {
    total += Math.hypot(sumCos[patch], sumSin[patch]);
  }
  return Math.min(1, total / mowed);
}
