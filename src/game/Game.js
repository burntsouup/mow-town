import { Engine, Scene } from '@babylonjs/core';
import { smoothTowards } from '../audio/audioMix.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { RevealCamera } from '../camera/RevealCamera.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { config } from '../config.js';
import { Clippings } from '../effects/Clippings.js';
import { createLevel } from '../environment/level.js';
import { applyColorGrading, createLighting, createSky } from '../environment/lighting.js';
import { Lawn } from '../lawn/Lawn.js';
import { stripeNeatness } from '../lawn/neatness.js';
import { grassSpeedFactor } from '../mower/mowerMath.js';
import { PushMower } from '../mower/PushMower.js';
import { Player } from '../player/Player.js';
import { SaleStand } from '../shop/SaleStand.js';
import { buy } from '../shop/shop.js';
import { StringTrimmer } from '../trimmer/StringTrimmer.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { Hud } from '../ui/Hud.js';
import { TuningPanel } from '../ui/TuningPanel.js';
import { Celebration } from './Celebration.js';
import { pixelRatioFor, refreshRateFrom } from './display.js';
import { Input } from './Input.js';
import { JobList } from './jobList.js';
import { countTowards, jobReceipt, receiptTotal } from './pay.js';
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
    applyColorGrading(this.scene);
    this.level = createLevel(this.scene, shadows);
    /** @type {Record<string, Lawn>} Every lawn on the street, by id (each job names its own). */
    this.lawns = Object.fromEntries(
      Object.entries(this.level.lawns).map(([id, area]) => [id, new Lawn(this.scene, area)]),
    );

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
    this.trimmer = new StringTrimmer(this.scene, shadows, this.input, this.player, this.camera);
    this.stand = new SaleStand(this.scene, shadows, this.level.standSpot, {
      id: 'wideDeck',
      name: '30-inch deck',
      sign: '30" DECK',
      get price() {
        return config.shop.wideDeck.price; // read live, so the tuning slider works
      },
    });
    this.reveal = new RevealCamera(this.scene, this.camera);
    this.grassCut = 0; // grass cut this frame (see GrassGrid.cutDeck)
    this.cutRate = 0; // grass cut per second, smoothed so effects don't flicker
    this.grassTrimmed = 0; // grass cut by the string trimmer this frame
    this.trimRate = 0; // ...per second, smoothed
    this.clippings = new Clippings(this.scene, this.mower.model.chute);
    this.audio = new AudioSystem();
    this.jobs = new JobList(this.level.jobs, config.job.completeAt);
    this.reveal.frame(this.lawn); // the first job's lawn
    this.celebration = new Celebration(this.scene);
    this.highlight = 0; // 0..1, eases in and out while the highlight key is held
    this.money = 0; // dollars earned (not saved yet: reloading starts over)
    this.moneyShown = 0; // what the HUD shows: counts up to `money` like a till
    /** @type {import('./pay.js').PayLine[] | null} What the current job paid, once done. */
    this.receipt = null;
    this.neatness = 0; // how neat the stripes were when the current job was done (0..1)
    this.edgesDone = false; // the current job's edges are trimmed
    this.cardTime = 0; // seconds left to show the "Job complete" card
    this.toastText = ''; // a short message, like "deck fitted"
    this.toastTime = 0; // ...and how many seconds it has left
    this.toldAboutDeck = false; // we've pointed out the sale stand
    this.time = 0;
    this.refreshRate = 0; // the screen's, in Hz, measured when the game starts
    this.pixelRatio = window.devicePixelRatio || 1; // pixels rendered per CSS pixel
    this.hud = new Hud(hudRoot, this.input);
    this.debugOverlay = new DebugOverlay(this.engine, this.scene, hudRoot);
    this.tuning = new TuningPanel(this);

    window.addEventListener('resize', () => this.engine.resize());
  }

  /**
   * Times a few idle frames to find the screen's refresh rate (see display.js), picks a
   * render resolution it can keep up with, then starts the game loop.
   */
  start() {
    /** @type {number[]} */
    const frameMs = [];
    let last = performance.now();
    const measure = (/** @type {number} */ now) => {
      // Background tabs run slowly on purpose, so only count frames while you can see it.
      if (!document.hidden) frameMs.push(now - last);
      last = now;
      if (frameMs.length < 20) {
        requestAnimationFrame(measure);
        return;
      }
      this.refreshRate = refreshRateFrom(frameMs.slice(4)); // the first few are still settling
      this.applyPixelRatio();
      this.engine.runRenderLoop(() => {
        const dt = toDeltaSeconds(this.engine.getDeltaTime(), config.loop.maxDeltaSeconds);
        this.update(dt);
        this.input.endFrame();
        this.scene.render();
      });
    };
    requestAnimationFrame(measure);
  }

  /** Renders at the resolution the screen can keep up with (see display.js). */
  applyPixelRatio() {
    this.pixelRatio = pixelRatioFor(window.devicePixelRatio, this.refreshRate, config.render);
    this.engine.setHardwareScalingLevel(1 / this.pixelRatio);
  }

  /**
   * Updates every system once. Order matters: each step uses what the previous ones did.
   *
   * @param {number} dt Seconds since the previous frame.
   */
  update(dt) {
    // Walk relative to where the camera looks, unless you're pushing the mower. While
    // trimming, you face the trimmer's head.
    if (!this.mower.isHeld) this.player.update(dt, this.camera.yaw, this.trimmer.faceYaw);
    this.updateShop(); // before the mower, which would otherwise take the E key
    this.updateMowing(dt);
    this.camera.mode = this.mower.isHeld ? 'mowing' : this.trimmer.isOut ? 'trimming' : 'walking';
    this.camera.update(dt); // follow the player to their new position
    this.updateTrimming(dt); // aims with the camera, so after it moves
    this.updateReveal(dt);
    this.updateJob(dt);
    // Finish off leftovers and send cut grass to the GPU.
    for (const lawn of Object.values(this.lawns)) lawn.update(dt);
    if (this.input.wasPressed(config.audio.muteKey)) this.audio.toggleMute();
    this.audio.update(
      dt,
      {
        running: this.mower.isHeld,
        load: this.cutRate / config.audio.fullLoadCutRate,
        bumped: this.mower.bumped,
        grabbed: this.mower.justGrabbed,
      },
      {
        out: this.trimmer.isOut,
        throttle: this.trimmer.isRunning,
        load: this.trimRate / config.audio.trimmer.fullLoadCutRate,
      },
    );
    if (this.input.wasPressed(config.debug.tuningKey)) this.tuning.toggle();
    this.toastTime = Math.max(0, this.toastTime - dt);
    this.moneyShown = countTowards(this.moneyShown, this.money, dt, {
      speed: config.money.countSpeed,
      minSpeed: config.money.countMinSpeed,
    });
    const job = this.jobs.currentJob;
    this.hud.update({
      prompt:
        this.mower.prompt ??
        this.stand.promptFor(this.player.position, this.money) ??
        this.trimmer.prompt,
      toast: this.toastTime > 0 ? this.toastText : null,
      hasMower: this.mower.everHeld,
      job: this.jobs.current,
      jobStatus: job.status,
      progress: job.displayProgress(this.lawn.progress),
      elapsed: job.elapsed,
      nextJob: this.jobs.upcoming,
      revealing: this.reveal.isActive,
      showCard: this.reveal.isActive || this.cardTime > 0,
      edges: Math.min(1, this.lawn.edgeProgress / config.job.edgesDoneAt),
      edgesDone: this.edgesDone,
      money: this.moneyShown,
      moneyCounting: this.moneyShown !== this.money,
      receipt: this.receipt,
    });
    this.debugOverlay.update(dt);
  }

  /** The lawn of the job you're on. */
  get lawn() {
    return this.lawns[this.jobs.current.lawn ?? ''] ?? Object.values(this.lawns)[0];
  }

  /**
   * The aerial view: V plays it any time. While it plays, the controls are paused; any key
   * or click (after a moment) cuts it short.
   *
   * @param {number} dt
   */
  updateReveal(dt) {
    const { reveal, input } = this;
    if (!reveal.isActive && input.isPointerLocked && input.wasPressed(config.job.revealKey)) {
      reveal.frame(this.lawn);
      reveal.start();
    }
    if (reveal.isActive && reveal.time > config.job.reveal.skipAfter && input.anyPressed) {
      reveal.skip();
    }
    reveal.update(dt);
    input.blocked = reveal.isActive;
  }

  /**
   * Progress, completion, the edges, the "show what's left" highlight, and mowing again.
   *
   * @param {number} dt
   */
  updateJob(dt) {
    this.time += dt;
    const job = this.jobs.currentJob;
    const working = this.grassCut > 0 || this.grassTrimmed > 0;
    const event = job.update(dt, this.lawn.progress, working);
    if (event === 'completed') {
      this.neatness = stripeNeatness(this.lawn.grid, config.money.neatnessPatch);
      this.pay();
      this.lawn.finish(); // leftover tufts shrink away (but not along the edges)
      this.celebration.play(this.lawn.field.mesh);
      this.audio.playChime();
      this.reveal.frame(this.lawn);
      this.reveal.start(); // and fly up to show off the stripes
    }
    // Trimming the edges (before or after the lawn is done) earns a tip.
    if (!this.edgesDone && this.lawn.edgeProgress >= config.job.edgesDoneAt) {
      this.edgesDone = true;
      this.lawn.finishEdges();
      this.audio.playDing();
      if (job.isComplete) this.pay();
    }
    if (!this.reveal.isActive) this.cardTime = Math.max(0, this.cardTime - dt);

    // Hold the key to make uncut grass glow, pulsing gently so it catches the eye.
    const held = this.input.isPointerLocked && this.input.isDown(config.job.highlightKey);
    this.highlight = smoothTowards(this.highlight, held ? 1 : 0, dt, 12);
    const glow = this.highlight * (0.75 + 0.25 * Math.sin(this.time * 6));
    for (const lawn of Object.values(this.lawns)) lawn.setHighlight(lawn === this.lawn ? glow : 0);

    if (!job.isComplete) return;
    if (this.input.wasPressed(config.job.nextKey)) {
      if (this.jobs.next()) this.startJob();
    } else if (this.input.wasPressed(config.job.resetKey)) {
      // The grass grows back (and mowing it again pays again). After the last job, every
      // lawn does, and it all starts over (your money and upgrades stay yours).
      if (this.jobs.allComplete) {
        this.jobs.resetAll();
        for (const lawn of Object.values(this.lawns)) lawn.reset();
      } else {
        this.jobs.redoCurrent();
        this.lawn.reset();
      }
      this.startJob();
    }
  }

  /** Forgets the last job's pay and edges, ready for the next one. */
  startJob() {
    this.receipt = null;
    this.edgesDone = false;
    this.cardTime = 0;
  }

  /**
   * Pays what the finished job has earned so far (the receipt is written afresh, so a tip
   * earned later just adds the difference). The money counts up with a "ka-ching", and the
   * receipt pops up.
   */
  pay() {
    const work = { neatness: this.neatness, edgesDone: this.edgesDone };
    const receipt = jobReceipt(this.jobs.current, work, config.money);
    const paidBefore = this.receipt ? receiptTotal(this.receipt) : 0;
    this.receipt = receipt;
    this.money += receiptTotal(receipt) - paidBefore;
    this.audio.playCoins(0.6); // just after the chime
    this.cardTime = config.job.cardTime;
  }

  /**
   * The sale stand: walk up and press E to buy the 30-inch deck, which is fitted to your
   * mower on the spot. (E grabs the mower instead if you're holding it or standing by it.)
   */
  updateShop() {
    const { input, stand } = this;
    // The first time you can afford it (once the aerial view is over), point it out.
    const canAfford = !stand.owned && this.money >= stand.item.price;
    if (canAfford && !this.toldAboutDeck && !this.reveal.isActive) {
      this.toldAboutDeck = true;
      this.toast('You can afford the 30-inch deck: it’s on the table by the garage', 5);
    }
    const pressed = input.isPointerLocked && input.wasPressed(config.mower.grabKey);
    const mowerBusy = this.mower.isHeld || this.mower.isPlayerNear();
    if (!pressed || mowerBusy || !stand.isPlayerNear(this.player.position)) return;
    const bought = buy(stand.item, this.money, stand.owned);
    if (!bought) return;
    this.money = bought.money;
    stand.markSold();
    const { wideDeck } = config.shop;
    this.mower.fitDeck({ width: wideDeck.width, length: wideDeck.length }, wideDeck.colliderRadius);
    this.celebration.play(this.mower.model.deck);
    this.audio.playCoins();
    this.audio.playClunk();
    this.toast('30-inch deck fitted to your mower!');
  }

  /**
   * @param {string} text Shown briefly under the objective.
   * @param {number} [seconds]
   */
  toast(text, seconds = config.shop.toastTime) {
    this.toastText = text;
    this.toastTime = seconds;
  }

  /**
   * Moves the mower (and the player holding it), then cuts the grass under its path.
   *
   * @param {number} dt
   */
  updateMowing(dt) {
    const from = this.mower.deckPose;
    const { deck } = this.mower;
    const lawns = Object.values(this.lawns);
    // Long and thick grass ahead of the deck slows the mower down.
    const work = Math.max(...lawns.map((lawn) => lawn.workAhead(from, deck)));
    this.mower.speedFactor = grassSpeedFactor(work, config.mower);
    this.mower.update(dt);
    // It cuts whichever lawn it's on (even one that isn't your job yet).
    this.grassCut = 0;
    for (const lawn of lawns) {
      if (this.mower.isCutting) this.grassCut += lawn.cut(dt, from, this.mower.deckPose, deck);
      else lawn.lift();
    }
    if (dt > 0) this.cutRate = smoothTowards(this.cutRate, this.grassCut / dt, dt, 10);
    this.clippings.update(this.cutRate);
  }

  /**
   * Takes out, aims and runs the string trimmer, and cuts the grass under its head.
   *
   * @param {number} dt
   */
  updateTrimming(dt) {
    this.trimmer.update(dt, !this.mower.isHeld);
    this.grassTrimmed = 0;
    for (const lawn of Object.values(this.lawns)) {
      if (this.trimmer.isRunning) {
        this.grassTrimmed += lawn.trim(dt, this.trimmer.from, this.trimmer.head);
      } else {
        lawn.liftTrimmer();
      }
    }
    if (dt > 0) this.trimRate = smoothTowards(this.trimRate, this.grassTrimmed / dt, dt, 10);
    this.trimmer.updateSpray(this.trimRate);
  }
}
