// @ts-check
import { sanitizeOutfit } from '../player/wardrobe.js';

/**
 * Saving your progress between visits, in the browser's localStorage: your money, what
 * you've bought, which job you're on, your outfit, and whether the music's on. (Not how
 * much of a lawn you'd mowed:
 * a job you come back to starts fresh.) Pure: the storage is passed in, so tests can use a
 * stand-in.
 *
 * @typedef {{ money: number, owned: string[], job: number,
 *   outfit: import('../player/wardrobe.js').Outfit, music: boolean }} Progress
 * @typedef {Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>} SaveStorage
 */

export const SAVE_KEY = 'mow-town.save';
/** Bump this if the format changes in a way old saves can't be read as. */
export const SAVE_VERSION = 1;

/**
 * Reads the saved progress, if there is any. Anything odd in it (edited by hand, from an
 * older version, an item or job that no longer exists) is fixed up rather than trusted.
 *
 * @param {SaveStorage | null} storage
 * @param {{ jobs: number, items: string[] }} game How many jobs there are; the items you can
 *   own.
 * @returns {Progress | null} Null if nothing (usable) is saved.
 */
export function readSave(storage, { jobs, items }) {
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null');
  } catch {
    return null; // not JSON, or storage isn't allowed (some private windows)
  }
  if (typeof data !== 'object' || data === null || data.version !== SAVE_VERSION) return null;
  const money = Number.isFinite(data.money) ? Math.max(0, Math.round(data.money)) : 0;
  const owned = Array.isArray(data.owned) ? items.filter((id) => data.owned.includes(id)) : [];
  const job = Number.isInteger(data.job) ? Math.min(Math.max(data.job, 0), jobs - 1) : 0;
  const music = data.music !== false; // on, unless you turned it off
  return { money, owned, job, outfit: sanitizeOutfit(data.outfit), music };
}

/**
 * @param {SaveStorage | null} storage
 * @param {Progress} progress
 * @returns {boolean} False if it couldn't be saved (no storage, or it's full or blocked).
 */
export function writeSave(storage, progress) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, ...progress }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Forgets your progress (money, upgrades, jobs), but keeps your outfit (that's you) and
 * whether you like the music on.
 *
 * @param {SaveStorage | null} storage
 * @param {import('../player/wardrobe.js').Outfit} outfit
 * @param {boolean} [music]
 */
export function resetProgress(storage, outfit, music = true) {
  return writeSave(storage, { money: 0, owned: [], job: 0, outfit, music });
}
