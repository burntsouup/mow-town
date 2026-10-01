import { describe, expect, it } from 'vitest';
import { fileName, postcardCaption, postcardLayout } from './postcard.js';

describe('postcardLayout', () => {
  const photo = { width: 1600, height: 1000 };
  const card = postcardLayout(photo);

  it('frames the photo at full size, with a border all round and a caption below', () => {
    expect(card.photo).toEqual({ x: card.border, y: card.border, ...photo });
    expect(card.width).toBe(photo.width + 2 * card.border);
    expect(card.caption.y).toBeGreaterThan(card.photo.y + card.photo.height);
    expect(card.caption.y + card.caption.height).toBeLessThanOrEqual(card.height);
  });

  it('fits the stamp inside the caption strip, on the right', () => {
    const { stamp, caption } = card;
    expect(stamp.x + stamp.width).toBeCloseTo(caption.x + caption.width);
    expect(stamp.y).toBeGreaterThanOrEqual(caption.y);
    expect(stamp.y + stamp.height).toBeLessThanOrEqual(caption.y + caption.height);
    expect(card.titleSize).toBeGreaterThan(card.lineSize);
  });
});

describe('postcardCaption', () => {
  const base = { place: 'Our front lawn', pattern: 'Checkerboard', score: null, progress: 0 };

  it('says how well a finished lawn matches its pattern', () => {
    const caption = postcardCaption({ ...base, score: 0.937, progress: 1 });
    expect(caption.title).toBe('Greetings from mow-town!');
    expect(caption.line).toBe('Our front lawn · Checkerboard 93%');
  });

  it('says how far along a lawn is, or that it is waiting', () => {
    expect(postcardCaption({ ...base, progress: 0.42 }).line).toBe('Our front lawn · 42% mowed');
    expect(postcardCaption(base).line).toBe('Our front lawn, waiting for a mow');
    expect(postcardCaption({ ...base, place: null }).line).toBe('A sunny day on the street');
  });
});

describe('fileName', () => {
  it('names saved files by what they are and the day', () => {
    expect(fileName('postcard', new Date(2026, 8, 30), 'jpg')).toBe(
      'mow-town-postcard-2026-09-30.jpg',
    );
  });
});
