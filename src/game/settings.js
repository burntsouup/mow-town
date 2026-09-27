// @ts-check

/**
 * Helpers for live-tuning the settings in config.js: remember the defaults, work out what
 * changed, and turn those changes into text you can paste back into config.js.
 * Pure data functions, so they're easy to test.
 */

/**
 * @typedef {{ [key: string]: SettingValue }} Settings
 * @typedef {number | string | boolean | number[] | Settings} SettingValue
 */

/**
 * A deep copy of plain settings data, so later changes don't affect it.
 *
 * @template T
 * @param {T} settings
 * @returns {T}
 */
export function snapshot(settings) {
  return structuredClone(settings);
}

/**
 * Only the values that differ from the defaults, keeping the same nesting.
 *
 * @param {Settings} defaults
 * @param {Settings} current
 * @returns {Settings}
 */
export function changedSettings(defaults, current) {
  /** @type {Settings} */
  const changes = {};
  for (const key of Object.keys(current)) {
    const before = defaults[key];
    const after = current[key];
    if (isGroup(before) && isGroup(after)) {
      const nested = changedSettings(before, after);
      if (Object.keys(nested).length > 0) changes[key] = nested;
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes[key] = after;
    }
  }
  return changes;
}

/**
 * Readable text for a set of changes, with numbers rounded so slider noise
 * (like 0.30000000000000004) doesn't clutter it.
 *
 * @param {Settings} changes
 */
export function settingsToText(changes) {
  if (Object.keys(changes).length === 0) return '';
  return JSON.stringify(
    changes,
    (_, value) => (typeof value === 'number' ? Number(value.toFixed(4)) : value),
    2,
  );
}

/**
 * @param {unknown} value
 * @returns {value is Settings}
 */
function isGroup(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
