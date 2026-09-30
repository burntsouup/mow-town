import { Engine, Scene } from '@babylonjs/core';
import { smoothTowards } from '../audio/audioMix.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { RevealCamera } from '../camera/RevealCamera.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { config } from '../config.js';
import { Clippings } from '../effects/Clippings.js';
import { Footsteps } from '../effects/Footsteps.js';
import { createRandom } from '../math/noise.js';
import { createLevel } from '../environment/level.js';
import { applyColorGrading, createLighting } from '../environment/lighting.js';
import { createSkyReflections } from '../environment/reflections.js';
import { createSky } from '../environment/sky.js';
import { StringLine } from '../environment/StringLine.js';
import { Wildlife } from '../environment/Wildlife.js';
import { Lawn } from '../lawn/Lawn.js';
import { PATTERNS, patternProgress, patternScore } from '../lawn/patterns.js';
import { grassSpeedFactor } from '../mower/mowerMath.js';
import { PushMower } from '../mower/PushMower.js';
import { Player } from '../player/Player.js';
import { DEFAULT_OUTFIT } from '../player/wardrobe.js';
import { SaleStand } from '../shop/SaleStand.js';
import { buy } from '../shop/shop.js';
import { StringTrimmer } from '../trimmer/StringTrimmer.js';
import { Closet } from '../ui/Closet.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { Hud } from '../ui/Hud.js';
import { TuningPanel } from '../ui/TuningPanel.js';
import { Celebration } from './Celebration.js';
import { isStruggling, lowerPixelRatio, pixelRatioFor, refreshRateFrom } from './display.js';
import { Input } from './Input.js';
import { JobList } from './jobList.js';
import { countTowards, jobReceipt, receiptTotal } from './pay.js';
import { readSave, resetProgress, writeSave } from './save.js';
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
    this.sky = createSky(this.scene);
    applyColorGrading(this.scene);
    this.level = createLevel(this.scene, shadows);
    /** @type {Record<string, Lawn>} Every lawn on the street, by id (each job names its own). */
    this.lawns = Object.fromEntries(
      Object.entries(this.level.lawns).map(([id, area]) => [id, new Lawn(this.scene, area)]),
    );

    /** @type {Map<string, StringLine>} String lines to mow along, by the job that has one. */
    this.guides = new Map(
      this.level.jobs.flatMap((job) =>
        job.guide ? [[job.id, new StringLine(this.scene, job.guide)]] : [],
      ),
    );
    this.wildlife = new Wildlife(this.scene, this.level.wildlife);
    this.birdsongRandom = createRandom(97);
    this.birdsongIn = 3; // seconds until a bird next sings
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
    this.footsteps = new Footsteps(this.scene);
    this.audio = new AudioSystem();
    this.jobs = new JobList(this.level.jobs, config.job.completeAt);
    this.reveal.frame(this.lawn); // the first job's lawn
    this.celebration = new Celebration(this.scene);
    this.highlight = 0; // 0..1, eases in and out while the highlight key is held
    this.money = 0; // dollars earned
    this.moneyShown = 0; // what the HUD shows: counts up to `money` like a till
    /** @type {import('./pay.js').PayLine[] | null} What the current job paid, once done. */
    this.receipt = null;
    this.neatness = 0; // how well the stripes matched the job's pattern when it was done (0..1)
    this.edgesDone = false; // the current job's edges are trimmed
    this.cardTime = 0; // seconds left to show the "Job complete" card
    this.toastText = ''; // a short message, like "deck fitted"
    this.toastTime = 0; // ...and how many seconds it has left
    this.toldAboutDeck = false; // we've pointed out the sale stand
    this.time = 0;
    this.refreshRate = 0; // the screen's, in Hz, measured when the game starts
    this.pixelRatio = window.devicePixelRatio || 1; // pixels rendered per CSS pixel
    /** @type {number[]} Recent frame times (ms), to see if we're keeping up. */
    this.frameTimes = [];
    this.strugglingWindows = 0; // stretches of frames in a row that missed the screen
    this.hud = new Hud(hudRoot, this.input);
    this.debugOverlay = new DebugOverlay(this.engine, this.scene, hudRoot);
    this.tuning = new TuningPanel(this);
    /** What you're wearing (see player/wardrobe.js). */
    this.outfit = DEFAULT_OUTFIT;
    this.closet = new Closet(this.scene, hudRoot, {
      change: (outfit) => {
        this.outfit = outfit;
        this.player.wear(outfit);
        this.player.cheer(false); // a little hop in the new look
        this.audio.playPop();
      },
      done: () => this.closeCloset(),
    });
    this.hud.actions = {
      dressUp: () => this.openCloset(),
      startOver: () => this.startOver(),
    };
    // Once everything's built: shiny things reflect the sky.
    createSkyReflections(this.scene, [
      this.sky.dome,
      ...this.sky.clouds.getChildMeshes(),
      this.level.ground,
    ]);
    this.storage = browserStorage();
    this.load();

    window.addEventListener('resize', () => this.engine.resize());
  }

  /** Picks up where you left off last visit (see save.js), if you've been here before. */
  load() {
    const progress = readSave(this.storage, {
      jobs: this.level.jobs.length,
      items: [this.stand.item.id],
    });
    if (!progress) return;
    this.outfit = progress.outfit;
    this.player.wear(this.outfit);
    this.money = progress.money;
    this.moneyShown = progress.money;
    if (progress.owned.includes(this.stand.item.id)) {
      this.stand.markSold();
      this.fitWideDeck();
      this.toldAboutDeck = true;
    }
    this.jobs.resume(progress.job);
    // Lawns from jobs you'd already done are still mowed.
    for (const job of this.level.jobs.slice(0, this.jobs.index)) {
      if (job.lawn && job.lawn !== this.jobs.current.lawn) this.lawns[job.lawn]?.mowAll();
    }
    this.reveal.frame(this.lawn);
  }

  /** Saves your progress (see save.js): after you're paid, buy something, or dress up. */
  save() {
    writeSave(this.storage, {
      money: this.money,
      owned: this.stand.owned ? [this.stand.item.id] : [],
      job: this.jobs.index,
      outfit: this.outfit,
    });
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
        this.watchFrameRate(this.engine.getDeltaTime());
        const dt = toDeltaSeconds(this.engine.getDeltaTime(), config.loop.maxDeltaSeconds);
        this.update(dt);
        this.input.endFrame();
        this.scene.render();
      });
    };
    requestAnimationFrame(measure);
  }

  /**
   * If frames keep missing the screen's refresh (a slower machine), renders a little softer:
   * checked every so many frames, and only after two struggling stretches in a row, so a
   * one-off hitch doesn't count (see display.js).
   *
   * @param {number} frameMs
   */
  watchFrameRate(frameMs) {
    const settings = config.render.adaptive;
    if (document.hidden) return;
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < settings.windowFrames) return;
    const struggling = isStruggling(this.frameTimes, this.refreshRate, settings);
    this.frameTimes = [];
    this.strugglingWindows = struggling ? this.strugglingWindows + 1 : 0;
    if (this.strugglingWindows < 2) return;
    this.strugglingWindows = 0;
    this.pixelRatio = lowerPixelRatio(this.pixelRatio, settings);
    this.engine.setHardwareScalingLevel(1 / this.pixelRatio);
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
    this.updateCloset(); // (the same)
    this.updateMowing(dt);
    this.camera.mode = this.mower.isHeld ? 'mowing' : this.trimmer.isOut ? 'trimming' : 'walking';
    this.camera.update(dt); // follow the player to their new position
    this.sky.update(dt);
    this.wildlife.update(dt);
    this.updateBirdsong(dt);
    if (this.closet.isOpen) this.player.setOpacity(1); // the closet has its own camera
    this.updateTrimming(dt); // aims with the camera, so after it moves
    // Tuft's hands go wherever the mower or trimmer handles ended up.
    let hands = null;
    if (this.mower.isHeld) hands = this.mower.gripPoints();
    else if (this.trimmer.isOut) hands = this.trimmer.gripPoints();
    this.player.animate(dt, hands, this.mower.isHeld ? 1 : 0);
    this.updateFootsteps();
    this.updateReveal(dt);
    this.updateJob(dt);
    // Finish off leftovers and send cut grass to the GPU. Real blades grow round you, a
    // little ahead, where the camera's looking.
    const feet = this.player.position;
    const ahead = config.grass.blades.ahead;
    const aheadX = feet.x + Math.sin(this.camera.yaw) * ahead;
    const aheadZ = feet.z + Math.cos(this.camera.yaw) * ahead;
    // (Not in the aerial view: from up there, the layers look right on their own.)
    const bladesAt = this.reveal.isActive ? null : { x: aheadX, z: aheadZ };
    for (const lawn of Object.values(this.lawns)) {
      lawn.follow(bladesAt);
      lawn.update(dt);
    }
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
        this.trimmer.prompt ??
        (this.isNearCloset() ? 'Press E to dress up' : null),
      toast: this.toastTime > 0 ? this.toastText : null,
      hasMower: this.mower.everHeld,
      job: this.jobs.current,
      jobStatus: job.status,
      stageHint: this.stageHint(),
      progress: job.displayProgress(this.jobWork()),
      elapsed: job.elapsed,
      nextJob: this.jobs.upcoming,
      revealing: this.reveal.isActive,
      showCard: this.reveal.isActive || this.cardTime > 0,
      edges: Math.min(1, this.lawn.edgeProgress / config.job.edgesDoneAt),
      edgesDone: this.edgesDone,
      money: this.moneyShown,
      moneyCounting: this.moneyShown !== this.money,
      receipt: this.receipt,
      closetOpen: this.closet.isOpen,
    });
    this.debugOverlay.update(dt);
  }

  /** The lawn of the job you're on. */
  get lawn() {
    return this.lawns[this.jobs.current.lawn ?? ''] ?? Object.values(this.lawns)[0];
  }

  /** The lawn art the job you're on asks for (plain stripes if nothing in particular). */
  get pattern() {
    return this.jobs.current.pattern ?? 'stripes';
  }

  /**
   * How much of the job's work is done, in the lawn's progress units (see patternProgress):
   * for a checkerboard, both passes count.
   */
  jobWork() {
    const { progress, crossProgress } = this.lawn;
    return patternProgress(this.pattern, { mowed: progress, crossed: crossProgress }, config.job);
  }

  /** A hint for where you are in a two-pass pattern ("now mow across"), or null. */
  stageHint() {
    const { acrossHint } = PATTERNS[this.pattern];
    if (!acrossHint || this.jobs.currentJob.isComplete) return null;
    return this.lawn.progress >= config.job.completeAt ? acrossHint : null;
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
    const event = job.update(dt, this.jobWork(), working);
    if (event === 'completed') {
      this.neatness = patternScore(this.lawn.grid, this.pattern, config.money.neatnessPatch);
      this.pay();
      this.lawn.finish(); // leftover tufts shrink away (but not along the edges)
      this.celebration.play(this.lawn.field.mesh);
      this.player.cheer();
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
    // A job's string line is there until the job is done.
    for (const [id, guide] of this.guides) {
      guide.show(id === this.jobs.current.id && !job.isComplete);
    }

    // Hold the key to make uncut grass glow, pulsing gently so it catches the eye.
    const held = this.input.isPointerLocked && this.input.isDown(config.job.highlightKey);
    this.highlight = smoothTowards(this.highlight, held ? 1 : 0, dt, 12);
    const glow = this.highlight * (0.75 + 0.25 * Math.sin(this.time * 6));
    for (const lawn of Object.values(this.lawns)) lawn.setHighlight(lawn === this.lawn ? glow : 0);

    if (!job.isComplete) return;
    if (this.input.wasPressed(config.job.nextKey)) {
      if (this.jobs.next()) {
        this.regrowIfMowedBefore();
        this.startJob();
        this.save();
      }
    } else if (this.input.wasPressed(config.job.resetKey)) {
      // The grass grows back (and mowing it again pays again). After the last job, every
      // lawn does, and it all starts over (your money and upgrades stay yours).
      if (this.jobs.allComplete) {
        this.jobs.resetAll();
        for (const lawn of Object.values(this.lawns)) lawn.reset();
        this.save();
      } else {
        this.jobs.redoCurrent();
        this.lawn.reset();
      }
      this.startJob();
    }
  }

  /**
   * A new job on a lawn you've mowed before (for lawn art, say) comes a week later: the
   * grass has grown back.
   */
  regrowIfMowedBefore() {
    const { current, index } = this.jobs;
    const earlier = this.level.jobs.slice(0, index);
    if (!earlier.some((job) => job.lawn === current.lawn)) return;
    this.lawn.reset();
    this.toast('A week later: the grass has grown back', 5);
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
    this.save();
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
    this.fitWideDeck();
    this.celebration.play(this.mower.model.deck);
    this.player.cheer();
    this.audio.playCoins();
    this.audio.playClunk();
    this.toast('30-inch deck fitted to your mower!');
    this.save();
  }

  fitWideDeck() {
    const { wideDeck } = config.shop;
    this.mower.fitDeck({ width: wideDeck.width, length: wideDeck.length }, wideDeck.colliderRadius);
  }

  /**
   * Now and then, a bird sings somewhere nearby.
   *
   * @param {number} dt
   */
  updateBirdsong(dt) {
    this.birdsongIn -= dt;
    if (this.birdsongIn > 0) return;
    const [least, most] = config.audio.birdsongEvery;
    this.birdsongIn = least + (most - least) * this.birdsongRandom();
    this.audio.playChirps();
  }

  /** A puff and a patter wherever Tuft's feet land: grass on a lawn, dust on paths. */
  updateFootsteps() {
    const { tuft } = this.player;
    if (tuft.steps.length === 0) return;
    const strength = Math.min(1, tuft.localVelocity.length() / config.player.runSpeed);
    for (const step of tuft.steps) {
      const onGrass = Object.values(this.lawns).some((lawn) => lawn.grassAt(step.x, step.z) > 0);
      const surface = onGrass ? 'grass' : 'path';
      this.footsteps.puff(step, surface, strength);
      this.audio.playStep(surface, strength);
    }
  }

  /**
   * Whether you can dress up here: at the coat stand by the front door, empty-handed (and not
   * where E would grab the mower).
   */
  isNearCloset() {
    const { x, z } = this.level.closetSpot;
    const feet = this.player.position;
    const near = Math.hypot(feet.x - x, feet.z - z) < config.closet.range;
    return near && !this.mower.isHeld && !this.trimmer.isOut && !this.mower.isPlayerNear();
  }

  /** The coat stand: walk up and press E to dress up. */
  updateCloset() {
    const pressed = this.input.isPointerLocked && this.input.wasPressed(config.mower.grabKey);
    if (pressed && this.isNearCloset()) this.openCloset();
  }

  /** Opens the closet (see Closet.js), from the start screen or the coat stand. */
  openCloset() {
    if (this.closet.isOpen || this.reveal.isActive) return;
    if (this.mower.isHeld) this.mower.letGo();
    if (this.trimmer.isOut) this.trimmer.putAway();
    this.input.lockOnClick = false; // dragging turns Tuft round instead
    this.input.unlockPointer();
    // Turn to face the camera, so the closet's camera comes round to where the view was
    // already clear (not into a wall).
    const feet = this.player.position;
    const yaw = this.camera.yaw + Math.PI;
    this.player.placeAt(feet.x, feet.z, yaw);
    this.closet.open(this.outfit, feet, yaw);
  }

  closeCloset() {
    this.input.lockOnClick = true;
    this.save();
    this.input.lockPointer(); // straight back to playing (clicking Done lets us)
  }

  /** Forgets your money, deck and jobs (keeping your outfit), and starts afresh. */
  startOver() {
    resetProgress(this.storage, this.outfit);
    window.location.reload();
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

/**
 * The browser's localStorage, or null if it isn't allowed (some private windows throw just
 * for looking at it).
 */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
