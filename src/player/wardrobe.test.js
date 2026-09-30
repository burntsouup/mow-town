import { describe, expect, it } from 'vitest';
import { createRandom } from '../math/noise.js';
import {
  CLOTH_COLORS,
  cycleStyle,
  DEFAULT_OUTFIT,
  FUR_COLORS,
  pickColor,
  randomOutfit,
  sanitizeOutfit,
  SLOTS,
  styleName,
} from './wardrobe.js';

describe('the wardrobe', () => {
  it('has every slot in the default outfit, wearing a real style and color', () => {
    expect(sanitizeOutfit(DEFAULT_OUTFIT)).toEqual(DEFAULT_OUTFIT);
    expect(Object.keys(DEFAULT_OUTFIT).sort()).toEqual(SLOTS.map((s) => s.id).sort());
  });

  it('starts out as the Tuft we know: sunset fur and blue sneakers, nothing else', () => {
    expect(DEFAULT_OUTFIT.fur.color).toBe('sunset');
    expect(DEFAULT_OUTFIT.shoes).toEqual({ style: 'sneakers', color: 'blue' });
    for (const id of /** @type {const} */ (['hat', 'glasses', 'gloves', 'shirt', 'shorts'])) {
      expect(DEFAULT_OUTFIT[id].style).toBe('none');
    }
  });

  it('uses unique ids and valid hex colors', () => {
    for (const list of [FUR_COLORS, CLOTH_COLORS, ...SLOTS.map((s) => s.styles)]) {
      const ids = list.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const c of CLOTH_COLORS) {
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.accent).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const c of FUR_COLORS) {
      for (const hex of [c.top, c.bottom, c.cheeks, c.limbs, c.brows]) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('sanitizeOutfit', () => {
  it('fills in anything missing or unknown with the default', () => {
    const outfit = sanitizeOutfit({
      hat: { style: 'cap', color: 'plaid' },
      glasses: { style: 'monocle', color: 'red' },
      shirt: 'tee',
    });
    expect(outfit.hat).toEqual({ style: 'cap', color: DEFAULT_OUTFIT.hat.color });
    expect(outfit.glasses).toEqual({ style: 'none', color: 'red' });
    expect(outfit.shirt).toEqual(DEFAULT_OUTFIT.shirt);
    expect(outfit.fur).toEqual(DEFAULT_OUTFIT.fur);
  });

  it('copes with nonsense', () => {
    for (const junk of [null, undefined, 42, 'hat', []]) {
      expect(sanitizeOutfit(junk)).toEqual(DEFAULT_OUTFIT);
    }
  });
});

describe('changing an outfit', () => {
  it('cycles through a slot’s styles both ways, wrapping around', () => {
    let outfit = DEFAULT_OUTFIT;
    const seen = [];
    for (let i = 0; i < 5; i++) {
      seen.push(outfit.hat.style);
      outfit = cycleStyle(outfit, 'hat', 1);
    }
    expect(seen).toEqual(['none', 'cap', 'beanie', 'bucket', 'straw']);
    expect(outfit.hat.style).toBe('none'); // back round to the start
    expect(cycleStyle(DEFAULT_OUTFIT, 'hat', -1).hat.style).toBe('straw');
  });

  it('leaves the original outfit alone', () => {
    const before = structuredClone(DEFAULT_OUTFIT);
    cycleStyle(DEFAULT_OUTFIT, 'shirt', 1);
    pickColor(DEFAULT_OUTFIT, 'shirt', 'red');
    expect(DEFAULT_OUTFIT).toEqual(before);
  });

  it('picks colors from the slot’s own list only', () => {
    expect(pickColor(DEFAULT_OUTFIT, 'shirt', 'red').shirt.color).toBe('red');
    expect(pickColor(DEFAULT_OUTFIT, 'fur', 'mint').fur.color).toBe('mint');
    expect(pickColor(DEFAULT_OUTFIT, 'fur', 'red')).toBe(DEFAULT_OUTFIT); // not a fur color
  });

  it('names what’s worn', () => {
    expect(styleName(DEFAULT_OUTFIT, 'hat')).toBe('None');
    expect(styleName(cycleStyle(DEFAULT_OUTFIT, 'hat', 1), 'hat')).toBe('Cap');
  });
});

describe('randomOutfit', () => {
  it('always makes a valid outfit', () => {
    const random = createRandom(7);
    for (let i = 0; i < 50; i++) {
      const outfit = randomOutfit(random);
      expect(sanitizeOutfit(outfit)).toEqual(outfit);
    }
  });

  it('sometimes leaves things off, but never the shoes', () => {
    const random = createRandom(3);
    const outfits = Array.from({ length: 60 }, () => randomOutfit(random));
    expect(outfits.some((o) => o.hat.style === 'none')).toBe(true);
    expect(outfits.some((o) => o.hat.style !== 'none')).toBe(true);
    expect(outfits.every((o) => o.shoes.style !== 'none')).toBe(true);
  });
});
