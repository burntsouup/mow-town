// @ts-check

/**
 * Everything Tuft can wear, and the rules for picking it: fur colors, and a style and color
 * for each piece of clothing. Pure data and functions (no Babylon), so outfits are easy to
 * test and to save. TuftOutfit.js builds the meshes for them.
 *
 * @typedef {{ style: string, color: string }} Worn Ids from the slot's styles and colors.
 * @typedef {{ fur: Worn, hat: Worn, glasses: Worn, gloves: Worn, shirt: Worn, shorts: Worn,
 *   shoes: Worn }} Outfit
 * @typedef {keyof Outfit} SlotId
 * @typedef {{ id: string, name: string, hex: string, accent: string }} ClothColor accent: a
 *   second color that goes with it (a sneaker's heel tab, a beanie's pompom).
 * @typedef {{ id: string, name: string, top: string, bottom: string, cheeks: string,
 *   limbs: string, brows: string }} FurColor Hex colors: the fur fades from bottom to top.
 * @typedef {{ id: string, name: string }} Style
 * @typedef {{ id: SlotId, name: string, styles: Style[], colors: { id: string, name: string,
 *   swatch: string }[] }} Slot swatch: a CSS background for the color button.
 */

/** @type {FurColor[]} */
export const FUR_COLORS = [
  {
    id: 'sunset',
    name: 'Sunset',
    top: '#ffc452',
    bottom: '#ff7b54',
    cheeks: '#ff9a8a',
    limbs: '#ffb27d',
    brows: '#c8552e',
  },
  {
    id: 'bubblegum',
    name: 'Bubblegum',
    top: '#ffc2e0',
    bottom: '#ff6fae',
    cheeks: '#ff8fa3',
    limbs: '#ffc9df',
    brows: '#c2417f',
  },
  {
    id: 'mint',
    name: 'Mint',
    top: '#c4f5dc',
    bottom: '#48c78e',
    cheeks: '#ff9e9e',
    limbs: '#cdf3de',
    brows: '#2e8f66',
  },
  {
    id: 'blueberry',
    name: 'Blueberry',
    top: '#a8d0ff',
    bottom: '#4f73f0',
    cheeks: '#ff9ec0',
    limbs: '#bcd9ff',
    brows: '#2f4fb0',
  },
  {
    id: 'grape',
    name: 'Grape',
    top: '#dab8ff',
    bottom: '#8657e8',
    cheeks: '#ff9ad6',
    limbs: '#e0c8ff',
    brows: '#5b35a8',
  },
  {
    id: 'lemon',
    name: 'Lemon',
    top: '#fff59a',
    bottom: '#ffc02e',
    cheeks: '#ffa07a',
    limbs: '#fff0b0',
    brows: '#c9901e',
  },
  {
    id: 'snow',
    name: 'Snow',
    top: '#ffffff',
    bottom: '#d3dde8',
    cheeks: '#ffb3c1',
    limbs: '#f6f3ef',
    brows: '#8f9db0',
  },
  {
    id: 'cocoa',
    name: 'Cocoa',
    top: '#d19a6e',
    bottom: '#7a4a32',
    cheeks: '#eb9a8a',
    limbs: '#e0b08c',
    brows: '#4a2a1a',
  },
];

/** @type {ClothColor[]} */
export const CLOTH_COLORS = [
  { id: 'red', name: 'Red', hex: '#e5484d', accent: '#ffe08a' },
  { id: 'orange', name: 'Orange', hex: '#f7822a', accent: '#3e63dd' },
  { id: 'yellow', name: 'Yellow', hex: '#ffc53d', accent: '#e5484d' },
  { id: 'green', name: 'Green', hex: '#46a758', accent: '#ffe08a' },
  { id: 'teal', name: 'Teal', hex: '#12a594', accent: '#ff8a80' },
  { id: 'blue', name: 'Blue', hex: '#4c6ef5', accent: '#ff6b6b' },
  { id: 'purple', name: 'Purple', hex: '#8e4ec6', accent: '#ffc53d' },
  { id: 'pink', name: 'Pink', hex: '#ff6fae', accent: '#ffffff' },
  { id: 'white', name: 'White', hex: '#f4f1ea', accent: '#4c6ef5' },
  { id: 'denim', name: 'Denim', hex: '#4a6fa5', accent: '#f4f1ea' },
  { id: 'black', name: 'Black', hex: '#2e2e36', accent: '#e5484d' },
];

const NONE = { id: 'none', name: 'None' };
const clothSwatches = CLOTH_COLORS.map(({ id, name, hex }) => ({ id, name, swatch: hex }));

/** @type {Slot[]} In the order the closet lists them. */
export const SLOTS = [
  {
    id: 'fur',
    name: 'Fur',
    styles: [{ id: 'fluffy', name: 'Fluffy' }],
    colors: FUR_COLORS.map(({ id, name, top, bottom }) => ({
      id,
      name,
      swatch: `linear-gradient(${top}, ${bottom})`,
    })),
  },
  {
    id: 'hat',
    name: 'Hat',
    styles: [
      NONE,
      { id: 'cap', name: 'Cap' },
      { id: 'beanie', name: 'Beanie' },
      { id: 'bucket', name: 'Bucket hat' },
      { id: 'straw', name: 'Sun hat' },
    ],
    colors: clothSwatches,
  },
  {
    id: 'glasses',
    name: 'Glasses',
    styles: [
      NONE,
      { id: 'round', name: 'Round specs' },
      { id: 'shades', name: 'Sunglasses' },
      { id: 'stars', name: 'Star shades' },
    ],
    colors: clothSwatches,
  },
  {
    id: 'gloves',
    name: 'Gloves',
    styles: [NONE, { id: 'garden', name: 'Garden gloves' }],
    colors: clothSwatches,
  },
  {
    id: 'shirt',
    name: 'Shirt',
    styles: [
      NONE,
      { id: 'tee', name: 'T-shirt' },
      { id: 'stripes', name: 'Striped tee' },
      { id: 'tank', name: 'Tank top' },
    ],
    colors: clothSwatches,
  },
  {
    id: 'shorts',
    name: 'Shorts',
    styles: [NONE, { id: 'shorts', name: 'Shorts' }],
    colors: clothSwatches,
  },
  {
    id: 'shoes',
    name: 'Shoes',
    styles: [
      { id: 'sneakers', name: 'Sneakers' },
      { id: 'boots', name: 'Rain boots' },
    ],
    colors: clothSwatches,
  },
];

/** @type {Outfit} What Tuft wears to begin with: just sneakers. */
export const DEFAULT_OUTFIT = {
  fur: { style: 'fluffy', color: 'sunset' },
  hat: { style: 'none', color: 'red' },
  glasses: { style: 'none', color: 'black' },
  gloves: { style: 'none', color: 'green' },
  shirt: { style: 'none', color: 'white' },
  shorts: { style: 'none', color: 'denim' },
  shoes: { style: 'sneakers', color: 'blue' },
};

/** @param {SlotId} id */
function slot(id) {
  return /** @type {Slot} */ (SLOTS.find((s) => s.id === id));
}

/**
 * An outfit made safe to use: anything missing or unknown (an old save, a typo) is replaced
 * by the default for that slot.
 *
 * @param {unknown} value
 * @returns {Outfit}
 */
export function sanitizeOutfit(value) {
  const input = /** @type {Record<string, any>} */ (
    typeof value === 'object' && value !== null ? value : {}
  );
  const outfit = /** @type {Outfit} */ ({});
  for (const { id, styles, colors } of SLOTS) {
    const worn = input[id] ?? {};
    const fallback = DEFAULT_OUTFIT[id];
    outfit[id] = {
      style: styles.some((s) => s.id === worn.style) ? worn.style : fallback.style,
      color: colors.some((c) => c.id === worn.color) ? worn.color : fallback.color,
    };
  }
  return outfit;
}

/**
 * The next (or previous) style for a slot, wrapping around.
 *
 * @param {Outfit} outfit
 * @param {SlotId} id
 * @param {number} step +1 for the next style, -1 for the previous one.
 * @returns {Outfit} A new outfit (the one passed in is left alone).
 */
export function cycleStyle(outfit, id, step) {
  const { styles } = slot(id);
  const index = styles.findIndex((s) => s.id === outfit[id].style);
  const next = styles[(((index + step) % styles.length) + styles.length) % styles.length];
  return { ...outfit, [id]: { ...outfit[id], style: next.id } };
}

/**
 * @param {Outfit} outfit
 * @param {SlotId} id
 * @param {string} color One of the slot's color ids.
 * @returns {Outfit} A new outfit.
 */
export function pickColor(outfit, id, color) {
  if (!slot(id).colors.some((c) => c.id === color)) return outfit;
  return { ...outfit, [id]: { ...outfit[id], color } };
}

/**
 * A random outfit, for the "Surprise me" button. Hats, glasses and so on are left off about
 * half the time, so it isn't always everything at once.
 *
 * @param {() => number} random Returns numbers in [0, 1).
 * @returns {Outfit}
 */
export function randomOutfit(random) {
  /** @template T @param {T[]} list */
  const pick = (list) => list[Math.floor(random() * list.length)];
  const outfit = /** @type {Outfit} */ ({});
  for (const { id, styles, colors } of SLOTS) {
    const worn = styles.filter((s) => s.id !== 'none');
    const skip = worn.length < styles.length && random() < 0.5;
    outfit[id] = { style: skip ? 'none' : pick(worn).id, color: pick(colors).id };
  }
  return outfit;
}

/** @param {string} id */
export function furColor(id) {
  return FUR_COLORS.find((c) => c.id === id) ?? FUR_COLORS[0];
}

/** @param {string} id */
export function clothColor(id) {
  return CLOTH_COLORS.find((c) => c.id === id) ?? CLOTH_COLORS[0];
}

/**
 * The name shown for what's worn in a slot, e.g. "Cap" or "None".
 *
 * @param {Outfit} outfit
 * @param {SlotId} id
 */
export function styleName(outfit, id) {
  return slot(id).styles.find((s) => s.id === outfit[id].style)?.name ?? '';
}
