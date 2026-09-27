import { Engine, Scene } from '@babylonjs/core';
import { AudioSystem } from '../audio/AudioSystem.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { config } from '../config.js';
import { createFrontYard } from '../environment/FrontYard.js';
import { createLighting, createSky } from '../environment/lighting.js';
import { Lawn } from '../lawn/Lawn.js';
import { PushMower } from '../mower/PushMower.js';
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
    this.lawn = new Lawn(this.scene, this.level.lawn);

    this.player = new Player(this.scene, shadows, this.input, this.level.spawn);
    this.camera = new ThirdPersonCamera(this.scene, this.input, this.player, this.level.spawn.yaw);
    this.mower = new PushMower(
      this.scene,
      shadows,
      this.input,
      this.player,
      this.camera,
      this.level.mowerSpot,
    );
    this.grassCut = 0; // grass cut this frame (see GrassGrid.cutDeck)
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
    // Walk relative to where the camera looks, unless you're pushing the mower.
    if (!this.mower.isHeld) this.player.update(dt, this.camera.yaw);
    this.updateMowing(dt);
    this.camera.update(dt); // follow the player to their new position
    this.lawn.update(); // send cut grass to the GPU
    const job = this.jobs.currentJob;
    job.update(dt, this.lawn.progress, this.grassCut > 0);
    if (this.input.wasPressed(config.audio.muteKey)) this.audio.toggleMute();
    if (this.input.wasPressed(config.debug.tuningKey)) this.tuning.toggle();
    this.hud.update({
      prompt: this.mower.prompt,
      hasMower: this.mower.everHeld,
      job: this.jobs.current,
      jobStatus: job.status,
      progress: job.displayProgress(this.lawn.progress),
      elapsed: job.elapsed,
      nextJob: this.jobs.upcoming,
    });
    this.debugOverlay.update(dt);
  }

  /**
   * Moves the mower (and the player holding it), then cuts the grass under its path.
   *
   * @param {number} dt
   */
  updateMowing(dt) {
    const from = this.mower.deckPose;
    this.mower.update(dt);
    if (this.mower.isCutting) {
      this.grassCut = this.lawn.cut(dt, from, this.mower.deckPose);
    } else {
      this.grassCut = 0;
      this.lawn.lift();
    }
  }
}
