// @ts-check

/**
 * Builds the shells for fur: copies of a surface pushed out along its normals, like the
 * grass's layers but wrapped around a body. The shader (FurMaterialPlugin) then keeps, in
 * each shell, only the dots where a strand of fur passes through, so the stack reads as fuzz.
 *
 * Every copy remembers where on the surface it came from (`furBase`) and how far out it is
 * (`furShell`, 0 at the skin, 1 at the tips), so a strand lines up through all the layers.
 * Pure math, no Babylon.
 *
 * @param {{ positions: ArrayLike<number>, normals: ArrayLike<number>,
 *   indices: ArrayLike<number> }} surface The skin.
 * @param {{ shells: number, length: number }} fur shells: how many layers above the skin
 *   (the skin itself comes first, as shell 0); length: meters from the skin to the tips.
 * @returns {{ positions: number[], normals: number[], indices: number[], furBase: number[],
 *   furShell: number[] }}
 */
export function furShells(surface, { shells, length }) {
  const count = surface.positions.length / 3;
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {number[]} */
  const indices = [];
  /** @type {number[]} */
  const furBase = [];
  /** @type {number[]} */
  const furShell = [];
  for (let shell = 0; shell <= shells; shell++) {
    const out = shell / shells;
    const first = positions.length / 3;
    for (let i = 0; i < count; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const base = surface.positions[i * 3 + axis];
        const normal = surface.normals[i * 3 + axis];
        positions.push(base + normal * length * out);
        normals.push(normal);
        furBase.push(base);
      }
      furShell.push(out);
    }
    for (let i = 0; i < surface.indices.length; i++) indices.push(first + surface.indices[i]);
  }
  return { positions, normals, indices, furBase, furShell };
}
