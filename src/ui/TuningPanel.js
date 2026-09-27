import GUI from 'lil-gui';
import { config } from '../config.js';
import { changedSettings, settingsToText, snapshot } from '../game/settings.js';

/**
 * Live sliders for the numbers that shape how the game feels (press T). Most systems read
 * `config` every frame, so moving a slider takes effect immediately; the few values that are
 * copied once at startup get an onChange hook below.
 *
 * "Copy changes" puts just the values you changed on the clipboard, ready to paste into
 * config.js (or to Copilot) to make them the new defaults.
 */
export class TuningPanel {
  /** @param {import('../game/Game.js').Game} game */
  constructor(game) {
    this.defaults = snapshot(config);
    const gui = new GUI({ title: 'Tuning (T to hide)' });
    this.gui = gui;
    gui.hide();

    const movement = gui.addFolder('Movement');
    movement.add(config.player, 'walkSpeed', 1, 8, 0.1).name('Walk speed (m/s)');
    movement.add(config.player, 'runSpeed', 2, 12, 0.1).name('Run speed (m/s)');
    movement.add(config.player, 'acceleration', 5, 80, 1).name('Acceleration');
    movement.add(config.player, 'deceleration', 5, 80, 1).name('Braking');
    movement.add(config.player, 'turnSpeed', 2, 30, 0.5).name('Turn speed');
    movement.add(config.player, 'sprayingSpeedFactor', 0.2, 1, 0.05).name('Speed while spraying');

    const camera = gui.addFolder('Camera');
    camera.add(config.camera, 'sensitivity', 0.0005, 0.006, 0.0001).name('Mouse sensitivity');
    camera.add(config.camera, 'invertY').name('Invert mouse Y');
    camera
      .add(config.camera, 'fov', 0.6, 1.5, 0.01)
      .name('Field of view')
      .onChange((/** @type {number} */ fov) => (game.camera.babylonCamera.fov = fov));
    camera.add(config.camera, 'distance', 2, 8, 0.1).name('Distance behind');
    camera.add(config.camera, 'shoulderOffset', -1.5, 1.5, 0.05).name('Shoulder offset');
    camera.add(config.camera, 'pivotHeight', 1, 2.5, 0.05).name('Height');

    const spray = gui.addFolder('Spray');
    spray.add(config.washer, 'nozzleRadius', 0.02, 0.3, 0.01).name('Spot size at nozzle (m)');
    spray.add(config.washer, 'spreadPerMeter', 0, 0.3, 0.005).name('Spread per meter');
    spray.add(config.washer, 'fullStrengthRange', 0.2, 5, 0.1).name('Full power up to (m)');
    spray.add(config.washer, 'maxRange', 2, 12, 0.1).name('Max range (m)');
    spray.add(config.washer, 'fanFlatness', 0.15, 1, 0.05).name('Fan flatness (1 = round)');
    spray.add(config.washer, 'maxStretch', 1, 5, 0.1).name('Max stretch at angles');

    const cleaning = gui.addFolder('Cleaning');
    cleaning.add(config.cleaning, 'cleanRate', 0.5, 10, 0.1).name('Cleaning speed');
    cleaning.add(config.cleaning, 'brushHardness', 0, 0.95, 0.05).name('Edge crispness');
    cleaning.add(config.cleaning, 'wetSpread', 1, 2.5, 0.05).name('Wet patch size');
    cleaning.add(config.cleaning, 'dryTime', 1, 30, 0.5).name('Drying time (s)');
    cleaning.add(config.cleaning, 'wetDarkening', 0.3, 1, 0.01).name('Wet darkness');
    cleaning.add(config.cleaning.moss, 'minStrength', 0, 0.95, 0.05).name('Moss: min strength');
    cleaning.add(config.cleaning.moss, 'rate', 0.1, 1.5, 0.05).name('Moss: removal speed');
    cleaning.add(config.cleaning, 'dripChance', 0, 1, 0.05).name('Trickles on walls (chance)');
    cleaning.add(config.cleaning, 'dripWidth', 0.01, 0.15, 0.005).name('Trickle width (m)');
    cleaning
      .add(config.job, 'completeAt', 0.9, 1, 0.005)
      .name('Job done at')
      .onChange((/** @type {number} */ value) => (game.jobs.completeAt = value));
    cleaning.close();

    const effects = gui.addFolder('Water effects');
    effects.add(config.effects, 'splashRate', 0, 1500, 10).name('Splash');
    effects.add(config.effects, 'mistRate', 0, 200, 5).name('Mist');
    effects.add(config.effects, 'splatterPerDirt', 0, 5, 0.1).name('Dirt splatter');
    effects.add(config.effects, 'streamSpeed', 0, 10, 0.1).name('Stream speed');
    effects.close();

    const audio = gui.addFolder('Sound');
    const applyVolume = () => game.audio.applyVolume();
    audio.add(config.audio, 'master', 0, 1, 0.01).name('Master volume').onChange(applyVolume);
    audio.add(config.audio, 'humIdle', 0, 0.5, 0.01).name('Engine (idle)');
    audio.add(config.audio, 'humSpraying', 0, 0.5, 0.01).name('Engine (spraying)');
    audio.add(config.audio, 'hiss', 0, 0.5, 0.01).name('Nozzle hiss');
    audio.add(config.audio, 'impact', 0, 0.5, 0.01).name('Water impact');
    audio.add(config.audio, 'strip', 0, 0.8, 0.01).name('Dirt stripping');
    audio.add(config.audio, 'chime', 0, 0.5, 0.01).name('Job complete chime');
    audio.close();

    const actions = {
      copy: () => this.copyChanges(),
      reset: () => gui.reset(), // back to the values from when the game started
    };
    this.copyButton = gui.add(actions, 'copy').name('Copy changes');
    gui.add(actions, 'reset').name('Reset to defaults');
  }

  toggle() {
    if (this.gui._hidden) {
      this.gui.show();
      document.exitPointerLock(); // free the mouse so you can drag the sliders
    } else {
      this.gui.hide();
    }
  }

  async copyChanges() {
    const text = settingsToText(changedSettings(this.defaults, config));
    if (!text) {
      this.flash('No changes yet');
      return;
    }
    console.info('Tuned settings (paste into src/config.js):\n' + text);
    try {
      await navigator.clipboard.writeText(text);
      this.flash('Copied! Paste into config.js');
    } catch {
      this.flash('Copy failed: see the console');
    }
  }

  /** @param {string} message Shown on the button for a moment. */
  flash(message) {
    this.copyButton.name(message);
    setTimeout(() => this.copyButton.name('Copy changes'), 1800);
  }
}
