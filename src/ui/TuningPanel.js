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

    const mower = gui.addFolder('Mower');
    mower
      .add(config.mower, 'steering', { 'Mouse (look to steer)': 'mouse', 'A / D keys': 'keys' })
      .name('Steering');
    mower.add(config.mower, 'pushSpeed', 0.5, 3, 0.05).name('Push speed (m/s)');
    mower.add(config.mower, 'pullSpeed', 0.2, 2, 0.05).name('Pull speed (m/s)');
    mower.add(config.mower, 'acceleration', 0.5, 10, 0.1).name('Acceleration');
    mower.add(config.mower, 'braking', 0.5, 15, 0.1).name('Braking');
    mower.add(config.mower, 'turnSpeed', 0.3, 4, 0.05).name('Turn speed (rad/s)');
    mower.add(config.mower, 'turnAcceleration', 1, 30, 0.5).name('Turn acceleration');
    mower.add(config.mower, 'mouseFullTurnAngle', 0.05, 1, 0.01).name('Mouse steer softness');
    mower.add(config.mower, 'cameraFollow', 0, 8, 0.1).name('Camera follow (keys)');

    const mowingView = camera.addFolder('While mowing');
    mowingView.add(config.camera.mowing, 'distance', 2, 9, 0.1).name('Distance behind');
    mowingView.add(config.camera.mowing, 'shoulderOffset', -2, 2, 0.05).name('Shoulder offset');
    mowingView.add(config.camera.mowing, 'pivotHeight', 1, 3, 0.05).name('Height');
    mowingView.add(config.camera.mowing, 'playerOpacity', 0, 1, 0.05).name('Player opacity');
    mowingView.close();

    const grass = gui.addFolder('Grass');
    grass.add(config.grass, 'shellCount', 4, 64, 1).name('Shells (layers)');
    grass.add(config.grass, 'maxHeight', 0.03, 0.3, 0.005).name('Uncut height (m)');
    grass.add(config.grass, 'bladesPerMeter', 10, 150, 1).name('Blades per meter');
    grass.add(config.grass, 'bladeThickness', 0.1, 1.5, 0.05).name('Blade thickness');
    grass.add(config.grass, 'stripes', 0, 0.6, 0.01).name('Stripe strength');
    grass.add(config.grass, 'mowLean', 0, 1, 0.05).name('Mowed blade lean');
    grass.addColor(config.grass.colors, 'root').name('Root color');
    grass.addColor(config.grass.colors, 'tip').name('Tip color (cut)');
    grass.addColor(config.grass.colors, 'longTip').name('Tip color (long)');
    grass.close();

    const job = gui.addFolder('Job');
    job
      .add(config.job, 'completeAt', 0.9, 1, 0.005)
      .name('Job done at')
      .onChange((/** @type {number} */ value) => (game.jobs.completeAt = value));
    job.close();

    const audio = gui.addFolder('Sound');
    const applyVolume = () => game.audio.applyVolume();
    audio.add(config.audio, 'master', 0, 1, 0.01).name('Master volume').onChange(applyVolume);
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
