import { describe, expect, it } from 'vitest';
import { cycleStyle, DEFAULT_OUTFIT } from '../player/wardrobe.js';
import { readSave, resetProgress, SAVE_KEY, SAVE_VERSION, writeSave } from './save.js';

/** A stand-in for localStorage. */
function memoryStorage() {
  /** @type {Map<string, string>} */
  const items = new Map();
  return {
    items,
    /** @param {string} key */
    getItem: (key) => items.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => void items.set(key, value),
    /** @param {string} key */
    removeItem: (key) => void items.delete(key),
  };
}

const GAME = { jobs: 2, items: ['wideDeck'] };
const PROGRESS = {
  money: 125,
  owned: ['wideDeck'],
  job: 1,
  outfit: cycleStyle(DEFAULT_OUTFIT, 'hat', 1),
  music: false,
};

describe('saving progress', () => {
  it('reads back what it wrote', () => {
    const storage = memoryStorage();
    expect(writeSave(storage, PROGRESS)).toBe(true);
    expect(readSave(storage, GAME)).toEqual(PROGRESS);
  });

  it('has nothing to read on a first visit', () => {
    expect(readSave(memoryStorage(), GAME)).toBeNull();
    expect(readSave(null, GAME)).toBeNull();
  });

  it('ignores saves it can’t read', () => {
    const storage = memoryStorage();
    for (const junk of ['not json', '42', 'null', JSON.stringify({ version: 99, money: 5 })]) {
      storage.setItem(SAVE_KEY, junk);
      expect(readSave(storage, GAME)).toBeNull();
    }
  });

  it('fixes up anything odd instead of trusting it', () => {
    const storage = memoryStorage();
    const odd = {
      version: SAVE_VERSION,
      money: -20.6,
      owned: ['wideDeck', 'jetpack'],
      job: 7,
      outfit: { hat: { style: 'crown', color: 'gold' } },
    };
    storage.setItem(SAVE_KEY, JSON.stringify(odd));
    const progress = readSave(storage, GAME);
    expect(progress).toEqual({
      money: 0,
      owned: ['wideDeck'],
      job: 1, // the last job there is
      outfit: DEFAULT_OUTFIT,
      music: true, // (older saves didn't say: it's on)
    });
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, money: 'lots' }));
    expect(readSave(storage, GAME)).toEqual({
      money: 0,
      owned: [],
      job: 0,
      outfit: DEFAULT_OUTFIT,
      music: true,
    });
  });

  it('copes with storage that refuses (full, or blocked in a private window)', () => {
    const refusing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {},
    };
    expect(writeSave(refusing, PROGRESS)).toBe(false);
    expect(readSave(refusing, GAME)).toBeNull();
    expect(writeSave(null, PROGRESS)).toBe(false);
  });

  it('starts over, keeping your outfit and the music setting', () => {
    const storage = memoryStorage();
    writeSave(storage, PROGRESS);
    resetProgress(storage, PROGRESS.outfit, PROGRESS.music);
    expect(readSave(storage, GAME)).toEqual({
      money: 0,
      owned: [],
      job: 0,
      outfit: PROGRESS.outfit,
      music: false,
    });
  });
});
