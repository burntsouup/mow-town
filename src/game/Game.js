import { Engine, Scene } from '@babylonjs/core';
import { AudioSystem } from '../audio/AudioSystem.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { config } from '../config.js';
import { createFrontYard } from '../environment/FrontYard.js';
import { createLighting, createSky } from '../environment/lighting.js';
import { DeckCutter } from '../lawn/DeckCutter.js';
import { GrassField } from '../lawn/GrassField.js';
import { GrassGrid } from '../lawn/GrassGrid.js';
import { Player } from '../player/Player.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { Hud } from '../ui/Hud.js';
import { TuningPanel } from '../ui/TuningPanel.js';
import { Celebration } from './Celebration.js';
import { Input } from './Input.js';
import { JobList } from './jobList.js';
import { toDeltaSeconds } from './time.js';

/**
 * Owns the engine, the scene, and every game system.
 *
 * Each frame: work out how much time passed, update each system in order, then render.
 */
export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} hudRoot
   */
  constructor(canvas, hudRoot) {
    const adaptToDeviceRatio = true; // render at full Retina resolution
    this.engine = new Engine(canvas, config.render.antialias, {}, adaptToDeviceRatio);
    this.scene = new Scene(this.engine);
    this.input = new Input(canvas);

    const { shadows } = createLighting(this.scene);
    createSky(this.scene);
    this.level = createFrontYard(this.scene, shadows);

    const { lawn } = this.level;
    this.grass = new GrassGrid({
      ...lawn,
      texelsPerMeter: config.grass.texelsPerMeter,
      targetHeight: config.grass.cutHeight,
    });
    this.grass.fill(lawn.heightAt, lawn.densityAt);
    this.grassField = new GrassField(this.scene, this.grass, lawn);
    this.brush = {
      cutter: new DeckCutter(this.grass),
      from: { x: 0, z: 0, yaw: 0 },
      active: false,
    };

    this.player = new Player(this.scene, shadows, this.input, this.level.spawn);
    this.camera = new ThirdPersonCamera(this.scene, this.input, this.player, this.level.spawn.yaw);
    this.audio = new AudioSystem();
    this.jobs = new JobList(this.level.jobs, config.job.completeAt);
    this.celebration = new Celebration(this.scene);
    this.hud = new Hud(hudRoot, this.input);
    this.debugOverlay = new DebugOverlay(this.engine, this.scene, hudRoot);
    this.tuning = new TuningPanel(this);

    window.addEventListener('resize', () => this.engine.resize());
  }

  start() {
    this.engine.runRenderLoop(() => {
      const dt = toDeltaSeconds(this.engine.getDeltaTime(), config.loop.maxDeltaSeconds);
      this.update(dt);
      this.input.endFrame();
      this.scene.render();
    });
  }

  /**
   * Updates every system once. Order matters: each step uses what the previous ones did.
   *
   * @param {number} dt Seconds since the previous frame.
   */
  update(dt) {
    this.player.update(dt, this.camera.yaw); // move relative to where the camera looks
    this.camera.update(dt); // follow the player to their new position
    this.updateDebugBrush(dt);
    this.grassField.update(); // send cut grass to the GPU
    const job = this.jobs.currentJob;
    job.update(dt, this.grass.progress, this.brush.active);
    if (this.input.wasPressed(config.audio.muteKey)) this.audio.toggleMute();
    if (this.input.wasPressed(config.debug.tuningKey)) this.tuning.toggle();
    this.hud.update({
      prompt: null,
      job: this.jobs.current,
      jobStatus: job.status,
      progress: job.displayProgress(this.grass.progress),
      elapsed: job.elapsed,
      nextJob: this.jobs.upcoming,
    });
    this.debugOverlay.update(dt);
  }

  /**
   * Test brush until the mower arrives: hold C to cut a deck-sized strip at your feet.
   *
   * @param {number} dt
   */
  updateDebugBrush(dt) {
    const { brush } = this;
    const feet = this.grassField.toLocal(this.player.position.x, this.player.position.z);
    const to = { ...feet, yaw: this.player.root.rotation.y };
    brush.active = this.input.isPointerLocked && this.input.isDown(config.debug.cutKey);
    if (brush.active) {
      brush.cutter.update(dt, brush.from, to, config.mower.deck, config.grass.cutHeight);
    } else {
      brush.cutter.lift();
    }
    brush.from = to;
  }
}
