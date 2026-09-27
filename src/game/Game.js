import { Engine, Scene } from '@babylonjs/core';
import { smoothTowards } from '../audio/audioMix.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { CleanableSurface } from '../cleaning/CleanableSurface.js';
import { CleaningSystem } from '../cleaning/CleaningSystem.js';
import { config } from '../config.js';
import { createBackyard } from '../environment/Backyard.js';
import { createLighting, createSky } from '../environment/lighting.js';
import { Player } from '../player/Player.js';
import { PressureWasher } from '../pressure-washer/PressureWasher.js';
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
    this.level = createBackyard(this.scene, shadows);

    this.cleaning = new CleaningSystem();
    for (const definition of this.level.cleanables) {
      this.cleaning.add(new CleanableSurface(this.scene, definition));
    }

    this.player = new Player(this.scene, shadows, this.input, this.level.spawn);
    this.camera = new ThirdPersonCamera(this.scene, this.input, this.player, this.level.spawn.yaw);
    this.washer = new PressureWasher(
      this.scene,
      shadows,
      this.input,
      this.player,
      this.camera,
      this.cleaning,
      this.level.washerSpot,
    );
    this.audio = new AudioSystem();
    this.jobs = new JobList(this.level.jobs, config.job.completeAt);
    this.celebration = new Celebration(this.scene);
    this.highlight = 0; // 0..1, eases in and out while the highlight key is held
    this.time = 0;
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
    // Move relative to where the camera looks (and face the aim while spraying).
    this.player.update(dt, this.camera.yaw, this.washer.isSpraying);
    this.camera.update(dt); // follow the player to their new position
    this.washer.update(dt); // aim from the new camera view, then spray
    this.updateJob(dt);
    this.cleaning.update(dt); // dry surfaces and send any changes to the GPU
    if (this.input.wasPressed(config.audio.muteKey)) this.audio.toggleMute();
    if (this.input.wasPressed(config.debug.tuningKey)) this.tuning.toggle();
    this.audio.update(dt, this.washer);
    const job = this.jobs.currentJob;
    this.hud.update({
      prompt: this.washer.prompt,
      hasWasher: this.washer.isEquipped,
      fanVertical: this.washer.fanVertical,
      job: this.jobs.current,
      jobStatus: job.status,
      progress: job.displayProgress(this.cleaning.progressFor(this.jobs.current.id)),
      elapsed: job.elapsed,
      nextJob: this.jobs.upcoming,
    });
    this.debugOverlay.update(dt);
  }

  /**
   * Progress, completion, the "show remaining dirt" highlight, and restarting.
   *
   * @param {number} dt
   */
  updateJob(dt) {
    this.time += dt;
    for (const unlockable of Object.values(this.level.unlockables)) unlockable.update(dt);
    const jobId = this.jobs.current.id;
    const job = this.jobs.currentJob;
    const event = job.update(dt, this.cleaning.progressFor(jobId), this.washer.isSpraying);
    if (event === 'completed') {
      this.cleaning.finishRemaining(jobId); // leftover specks fade away
      for (const surface of this.cleaning.surfacesFor(jobId)) this.celebration.play(surface.mesh);
      this.audio.playChime();
    }

    // Hold the key to make remaining dirt glow, pulsing gently so it catches the eye.
    const held = this.input.isPointerLocked && this.input.isDown(config.job.highlightKey);
    this.highlight = smoothTowards(this.highlight, held ? 1 : 0, dt, 12);
    const pulse = this.highlight * (0.75 + 0.25 * Math.sin(this.time * 6));
    this.cleaning.setHighlight(pulse, jobId);

    if (!job.isComplete) return;
    if (this.input.wasPressed(config.job.nextKey)) {
      const started = this.jobs.next();
      if (started?.unlocks) {
        this.level.unlockables[started.unlocks]?.open();
        this.audio.playClunk();
      }
    } else if (this.input.wasPressed(config.job.resetKey)) {
      if (this.jobs.allComplete) this.startOver();
      else {
        this.cleaning.reset(jobId);
        this.jobs.redoCurrent();
      }
    }
  }

  /** Back to the very beginning: every job dirty again, gates shut, player at the start. */
  startOver() {
    for (const { id } of this.jobs.definitions) this.cleaning.reset(id);
    this.jobs.resetAll();
    for (const unlockable of Object.values(this.level.unlockables)) unlockable.closeNow();
    this.player.teleport(this.level.spawn);
    this.camera.yaw = this.level.spawn.yaw;
  }
}
