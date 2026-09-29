// @ts-check

/**
 * Pure helpers for the sound code. Keeping the "sound design rules" separate from the Web
 * Audio code makes them easy to read, tweak, and test.
 */

/**
 * Eases a value toward a target, at the same speed at any frame rate. Used to smooth
 * jumpy per-frame numbers so the sound doesn't flutter.
 *
 * @param {number} current
 * @param {number} target
 * @param {number} dt Seconds since the previous frame.
 * @param {number} speed Higher = follows the target more closely.
 */
export function smoothTowards(current, target, dt, speed) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

/**
 * @typedef {{
 *   bogDepth: number, spinUp: number, recover: number, bog: number, spinDown: number,
 *   engineIdle: number, engineWorking: number, cutting: number,
 * }} EngineSettings
 *   bogDepth: how far a full load drags the engine speed down (0..1). spinUp, recover, bog
 *   and spinDown: how quickly engine speed follows (see smoothTowards) when starting, climbing
 *   back after a load, bogging down, and stopping. The rest are volumes (0..1).
 */

/**
 * The mower engine's sound, from what it's doing. Engine speed ("rpm", 0 = stopped,
 * 1 = full speed) sets the pitch: it spins up when you grab the handle, drops ("bogs") while
 * the blades chew through long or thick grass, and climbs back once they're free.
 *
 * @param {number} rpm Engine speed last frame, 0..1.
 * @param {{ running: boolean, load: number }} state load: how hard the blades are working,
 *   0 (spinning freely) to 1 (thick grass at full speed).
 * @param {EngineSettings} settings
 * @param {number} dt Seconds since the previous frame.
 * @returns {{ rpm: number, engine: number, cutting: number }} The new engine speed, and the
 *   volumes of the engine and of the blades cutting grass.
 */
export function engineSound(rpm, state, settings, dt) {
  const load = clamp01(state.load);
  const target = state.running ? 1 - settings.bogDepth * load : 0;
  let speed;
  if (target > rpm) speed = rpm < 0.5 ? settings.spinUp : settings.recover;
  else speed = state.running ? settings.bog : settings.spinDown;
  const next = smoothTowards(rpm, target, dt, speed);
  const working = settings.engineIdle + (settings.engineWorking - settings.engineIdle) * load;
  return {
    rpm: next,
    // Fades in as it starts and out as it winds down, so it never pops.
    engine: next > 0.01 ? working * clamp01(next * 1.5) : 0,
    cutting: state.running ? settings.cutting * load : 0,
  };
}

/**
 * @typedef {{ idleSpeed: number, revUp: number, revDown: number, bogDepth: number,
 *   idle: number, full: number, cutting: number }} TrimmerSettings
 *   idleSpeed: engine speed (0..1) while carried with the trigger up. revUp/revDown: how
 *   quickly it revs and drops (see smoothTowards). bogDepth: how far cutting drags it down.
 *   idle/full/cutting: volumes (0..1) at idle, at full revs, and of the line cutting grass.
 */

/**
 * The string trimmer's little two-stroke engine: it idles while you carry it, screams when
 * you hold the trigger, and drops a little while the line cuts through grass.
 *
 * @param {number} rpm Engine speed last frame, 0..1 (full throttle is 1).
 * @param {{ out: boolean, throttle: boolean, load: number }} state out: you're carrying it;
 *   throttle: the trigger is held; load: how much the line is cutting, 0..1.
 * @param {TrimmerSettings} settings
 * @param {number} dt Seconds since the previous frame.
 * @returns {{ rpm: number, engine: number, cutting: number }} The new engine speed, and the
 *   volumes of the engine and of the line cutting grass.
 */
export function trimmerSound(rpm, state, settings, dt) {
  const load = clamp01(state.load);
  let target = 0;
  if (state.out) target = state.throttle ? 1 - settings.bogDepth * load : settings.idleSpeed;
  const next = smoothTowards(rpm, target, dt, target > rpm ? settings.revUp : settings.revDown);
  const revving = clamp01((next - settings.idleSpeed) / (1 - settings.idleSpeed));
  const volume = settings.idle + (settings.full - settings.idle) * revving;
  return {
    rpm: next,
    // Fades in as it starts and out as it's put away, so it never pops.
    engine: next > 0.01 ? volume * clamp01(next / settings.idleSpeed) : 0,
    cutting: state.out && state.throttle ? settings.cutting * load : 0,
  };
}

/** @param {number} value */
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
