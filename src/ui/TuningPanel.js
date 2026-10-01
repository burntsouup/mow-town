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
    mower.add(config.mower, 'grassSlowdown', 0, 0.5, 0.01).name('Slowdown in long grass');
    mower.add(config.mower, 'mouseFullTurnAngle', 0.05, 1, 0.01).name('Mouse steer softness');
    mower.add(config.mower, 'cameraFollow', 0, 8, 0.1).name('Camera follow (keys)');

    const trimmer = gui.addFolder('String trimmer');
    trimmer.add(config.trimmer, 'radius', 0.05, 0.4, 0.01).name('Cutting radius (m)');
    trimmer.add(config.trimmer.reach, 'min', 0.2, 1.5, 0.05).name('Closest reach (m)');
    trimmer.add(config.trimmer.reach, 'max', 0.5, 2.5, 0.05).name('Furthest reach (m)');
    trimmer.add(config.trimmer, 'follow', 1, 40, 0.5).name('Head follow');
    trimmer.add(config.trimmer, 'maxSpeed', 0.5, 10, 0.1).name('Swing speed (m/s)');
    trimmer.add(config.trimmer, 'walkSpeed', 0.5, 5, 0.1).name('Walk speed (m/s)');
    trimmer.close();

    const jelly = gui.addFolder('Tuft jelly');
    jelly.add(config.tuft.jelly, 'stiffness', 10, 300, 1).name('Wobble speed');
    jelly.add(config.tuft.jelly, 'damping', 1, 30, 0.5).name('Settle speed');
    jelly.add(config.tuft.jelly, 'lean', 0, 0.05, 0.001).name('Sway amount');
    jelly.add(config.tuft.jelly, 'maxLean', 0, 0.5, 0.01).name('Max sway (rad)');
    jelly.add(config.tuft.jelly, 'ripple', 0, 0.02, 0.001).name('Ripple (m)');
    jelly.close();

    const mowingView = camera.addFolder('While mowing');
    mowingView.add(config.camera.mowing, 'distance', 2, 9, 0.1).name('Distance behind');
    mowingView.add(config.camera.mowing, 'shoulderOffset', -2, 2, 0.05).name('Shoulder offset');
    mowingView.add(config.camera.mowing, 'pivotHeight', 1, 3, 0.05).name('Height');
    mowingView.add(config.camera.mowing, 'playerOpacity', 0, 1, 0.05).name('Player opacity');
    mowingView.close();

    const trimmingView = camera.addFolder('While trimming');
    trimmingView.add(config.camera.trimming, 'distance', 1.5, 8, 0.1).name('Distance behind');
    trimmingView.add(config.camera.trimming, 'shoulderOffset', -2, 2, 0.05).name('Shoulder offset');
    trimmingView.add(config.camera.trimming, 'pivotHeight', 1, 3, 0.05).name('Height');
    trimmingView.add(config.camera.trimming, 'pitch', 0, 1.2, 0.01).name('Look down (rad)');
    trimmingView.add(config.camera.trimming, 'playerOpacity', 0, 1, 0.05).name('Player opacity');
    trimmingView.close();

    const grass = gui.addFolder('Grass');
    grass.add(config.grass, 'shellCount', 4, 64, 1).name('Shells (layers)');
    grass.add(config.grass, 'maxHeight', 0.03, 0.3, 0.005).name('Uncut height (m)');
    grass.add(config.grass, 'bladesPerMeter', 10, 150, 1).name('Blades per meter');
    grass.add(config.grass, 'bladeThickness', 0.1, 1.5, 0.05).name('Blade thickness');
    grass.add(config.grass, 'stripes', 0, 0.6, 0.01).name('Stripe strength');
    grass.add(config.grass, 'mowLean', 0, 1, 0.05).name('Mowed blade lean');
    grass
      .add(config.grass, 'crossLean', 0, 1, 0.05)
      .name('Checkerboard: first pass shows')
      .onChange((/** @type {number} */ value) => {
        for (const lawn of Object.values(game.lawns)) {
          lawn.grid.crossLean = value;
          lawn.grid.markChanged(lawn.grid.fullRect()); // redraw the whole lawn
        }
      });
    grass.addColor(config.grass.colors, 'root').name('Root color');
    grass.addColor(config.grass.colors, 'tip').name('Tip color (cut)');
    grass.addColor(config.grass.colors, 'longTip').name('Tip color (long)');
    grass.close();

    const job = gui.addFolder('Job');
    job
      .add(config.job, 'completeAt', 0.9, 1, 0.005)
      .name('Job done at')
      .onChange((/** @type {number} */ value) => (game.jobs.completeAt = value));
    job.add(config.job, 'edgesDoneAt', 0.8, 1, 0.005).name('Edges done at');
    job.add(config.job, 'crossDoneAt', 0.5, 1, 0.005).name('Checkerboard: across done at');
    job.close();

    const money = gui.addFolder('Money');
    money.add(config.money.jobPay, 'frontLawn', 0, 200, 1).name('Front lawn pays ($)');
    money.add(config.money.jobPay, 'nextDoor', 0, 300, 1).name("Parkers' lawn pays ($)");
    money.add(config.money.jobPay, 'frontCheckerboard', 0, 300, 1).name('Checkerboard pays ($)');
    money.add(config.money.jobPay, 'nextDoorDiagonal', 0, 300, 1).name('Diagonals pay ($)');
    money.add(config.money, 'stripesTip', 0, 50, 1).name('Neat stripes tip ($)');
    money.add(config.money, 'patternTip', 0, 80, 1).name('Pattern tip ($)');
    money.add(config.money, 'tipFrom', 0, 1, 0.01).name('Tip starts at (neatness)');
    money.add(config.money, 'tipFull', 0, 1, 0.01).name('Full tip at (neatness)');
    money.add(config.money, 'edgesTip', 0, 50, 1).name('Crisp edges tip ($)');
    money.close();

    const shop = gui.addFolder('Shop');
    shop.add(config.shop.wideDeck, 'price', 0, 200, 1).name('30-inch deck price ($)');
    shop.close();

    const render = gui.addFolder('Render');
    const applyPixelRatio = () => game.applyPixelRatio();
    render
      .add(config.render, 'maxPixelRatio', 0.5, 3, 0.05)
      .name('Max sharpness (px per px)')
      .onChange(applyPixelRatio);
    render
      .add(config.render, 'highRefreshPixelRatio', 0.5, 3, 0.05)
      .name('...on fast screens')
      .onChange(applyPixelRatio);
    render.close();

    const effects = gui.addFolder('Effects');
    effects.add(config.effects, 'clippingsPerCut', 0, 3000, 10).name('Clippings amount');
    effects.add(config.effects, 'maxClippingsRate', 0, 3000, 10).name('Clippings max / s');
    effects.add(config.effects, 'trimmerSprayPerCut', 0, 8000, 50).name('Trimmer spray amount');
    effects.close();

    const audio = gui.addFolder('Sound');
    const applyVolume = () => game.audio.applyVolume();
    audio.add(config.audio, 'master', 0, 1, 0.01).name('Master volume').onChange(applyVolume);
    audio.add(config.audio, 'engineFrequency', 20, 120, 1).name('Engine pitch (Hz)');
    audio.add(config.audio, 'engineIdle', 0, 0.5, 0.01).name('Engine (free)');
    audio.add(config.audio, 'engineWorking', 0, 0.5, 0.01).name('Engine (working)');
    audio.add(config.audio, 'cutting', 0, 0.6, 0.01).name('Blades cutting');
    audio.add(config.audio, 'bogDepth', 0, 0.8, 0.01).name('Engine bogging');
    audio.add(config.audio.trimmer, 'frequency', 60, 300, 1).name('Trimmer pitch (Hz)');
    audio.add(config.audio.trimmer, 'full', 0, 0.4, 0.01).name('Trimmer (revving)');
    audio.add(config.audio.trimmer, 'cutting', 0, 0.6, 0.01).name('Trimmer cutting');
    audio.add(config.audio.music, 'volume', 0, 1.5, 0.01).name('Music');
    audio.add(config.audio.music, 'duck', 0, 1, 0.01).name('Music under engines');
    audio.add(config.audio.music, 'swell', 0.5, 2.5, 0.05).name('Music in aerial view');
    audio.add(config.audio.music, 'aerialTools', 0, 1, 0.01).name('Engines in aerial view');
    audio.add(config.audio, 'chime', 0, 0.5, 0.01).name('Job complete chime');
    audio.add(config.audio, 'coins', 0, 0.5, 0.01).name('Ka-ching');
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
