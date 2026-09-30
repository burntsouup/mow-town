import { config } from '../config.js';
import { replaySpeed, replayStep, STEPS_PER_SECOND } from '../lawn/cutRecording.js';

/**
 * The timelapse: your whole mow of a lawn, played back sped up from the aerial view. The
 * camera flies up, the lawn grows back, and Tuft and the mower zip round it again, cutting
 * exactly what you cut (see lawn/cutRecording.js); then it lingers on the finished lawn and
 * flies back down. It puts everything back as it was when it's done.
 *
 * While it's on, it moves Tuft and the mower itself, so the game leaves them alone (see
 * Game.update).
 */
export class Timelapse {
  /**
   * @param {{ reveal: import('../camera/RevealCamera.js').RevealCamera,
   *   player: import('../player/Player.js').Player,
   *   mower: import('../mower/PushMower.js').PushMower,
   *   trimmer: import('../trimmer/StringTrimmer.js').StringTrimmer }} parts
   */
  constructor({ reveal, player, mower, trimmer }) {
    this.reveal = reveal;
    this.player = player;
    this.mower = mower;
    this.trimmer = trimmer;
    /** 'off', 'rising' (flying up), 'playing', or 'lingering' (then flying back down). */
    this.state = 'off';
    /** @type {import('../lawn/Lawn.js').Lawn | null} */
    this.lawn = null;
    /** @type {import('../lawn/cutRecording.js').CutStep[]} */
    this.steps = [];
    this.speed = 1; // times faster than life
    this.applied = 0; // steps replayed so far
    this.cursor = 0; // ...counting the part of the next one we're partway through
    this.cutThisFrame = 0; // grass the replay cut this frame (for the clippings)
    /** @type {ReturnType<import('../lawn/GrassGrid.js').GrassGrid['snapshot']> | null} */
    this.snapshot = null;
    this.saved = { x: 0, z: 0, yaw: 0, trimmerOut: false };
    /** @type {import('@babylonjs/core').Vector3[] | null} Where Tuft's hands hold on. */
    this.hands = null;
    /** @type {{ x: number, z: number, yaw: number } | null} */
    this.mowerPose = null;
  }

  /** From the moment it starts until the camera's back with the player. */
  get isActive() {
    return this.state !== 'off';
  }

  /** While the replay is on and moving Tuft round. */
  get isPlaying() {
    return this.state === 'playing';
  }

  /**
   * Whether a lawn has a whole mow worth replaying.
   *
   * @param {import('../lawn/Lawn.js').Lawn} lawn
   */
  canPlay(lawn) {
    const { recording } = lawn;
    return recording.canReplay && recording.seconds >= config.timelapse.minSeconds;
  }

  /**
   * Flies up over a lawn to replay how it was mowed.
   *
   * @param {import('../lawn/Lawn.js').Lawn} lawn
   */
  start(lawn) {
    const settings = config.timelapse;
    const { recording } = lawn;
    this.lawn = lawn;
    this.steps = recording.steps;
    this.speed = replaySpeed(recording.seconds, settings);
    this.state = 'rising';
    this.reveal.frame(lawn);
    this.reveal.start(recording.seconds / this.speed + settings.linger);
  }

  /** Cuts it short: the lawn's put back as it was, and the camera heads back down. */
  skip() {
    if (this.state === 'playing') {
      this.endReplay();
      this.state = 'lingering';
    }
    this.reveal.skip();
  }

  /**
   * Call after the reveal camera's update.
   *
   * @param {number} dt
   */
  update(dt) {
    this.cutThisFrame = 0;
    if (this.state === 'off') return;
    if (!this.reveal.isActive) {
      if (this.state === 'playing') this.endReplay();
      this.state = 'off';
      return;
    }
    if (this.state === 'rising' && this.reveal.isOverhead) this.beginReplay();
    if (this.state === 'playing') this.play(dt);
  }

  /**
   * Up top, with the lawn settled (the leftovers finished shrinking on the way up): keep a
   * copy of it, grow it back, and put the trimmer away for the show.
   */
  beginReplay() {
    const lawn = /** @type {import('../lawn/Lawn.js').Lawn} */ (this.lawn);
    const feet = this.player.position;
    this.saved = {
      x: feet.x,
      z: feet.z,
      yaw: this.player.root.rotation.y,
      trimmerOut: this.trimmer.isOut,
    };
    this.snapshot = lawn.grid.snapshot();
    lawn.replaying = true;
    lawn.grid.reset();
    this.trimmer.show(false);
    this.applied = 0;
    this.cursor = 0;
    this.mowerPose = null;
    this.state = 'playing';
  }

  /**
   * Replays this frame's share of the recording. Recorded time runs `speed` times faster
   * than real time, and Tuft is animated in slices of it, so he still walks at any speed.
   *
   * @param {number} dt
   */
  play(dt) {
    const lawn = /** @type {import('../lawn/Lawn.js').Lawn} */ (this.lawn);
    const recorded = dt * this.speed;
    const slices = Math.max(1, Math.ceil(recorded / config.timelapse.slice));
    for (let slice = 0; slice < slices; slice++) {
      this.cursor = Math.min(
        this.steps.length,
        this.cursor + (recorded / slices) * STEPS_PER_SECOND,
      );
      /** @type {import('../lawn/cutRecording.js').CutStep | null} */
      let last = null;
      while (this.applied < Math.floor(this.cursor)) {
        last = this.steps[this.applied++];
        this.cutThisFrame += replayStep(lawn.grid, last);
      }
      if (last) this.showActors(last);
      this.player.animate(recorded / slices, this.hands, this.hands ? 1 : 0);
    }
    if (this.applied >= this.steps.length) {
      this.endReplay();
      this.state = 'lingering';
    }
  }

  /**
   * Puts Tuft and the mower where they were at a step: behind the mower's handle while
   * mowing; wherever they stood while trimming.
   *
   * @param {import('../lawn/cutRecording.js').CutStep} step
   */
  showActors(step) {
    const field = /** @type {import('../lawn/Lawn.js').Lawn} */ (this.lawn).field;
    if (step.kind === 'deck') {
      const deck = { ...field.toWorld(step.to.x, step.to.z), yaw: step.to.yaw };
      this.moveMower(deck);
      const handle = config.mower.handleLength;
      const x = deck.x - Math.sin(deck.yaw) * handle;
      const z = deck.z - Math.cos(deck.yaw) * handle;
      this.player.placeAt(x, z, deck.yaw);
      this.hands = this.mower.gripPoints();
    } else if (step.kind === 'trim' && step.actors) {
      const { player, mower } = step.actors;
      if (mower) this.moveMower(mower);
      this.player.placeAt(player.x, player.z, player.yaw);
      this.hands = null;
    }
  }

  /** @param {{ x: number, z: number, yaw: number }} pose */
  moveMower(pose) {
    const last = this.mowerPose;
    const rolled = last
      ? (pose.x - last.x) * Math.sin(pose.yaw) + (pose.z - last.z) * Math.cos(pose.yaw)
      : 0;
    this.mower.showAt(pose, Math.abs(rolled) < 0.5 ? rolled : 0);
    this.mowerPose = pose;
  }

  /** The replay's over (or cut short): everything goes back exactly as it was. */
  endReplay() {
    const lawn = /** @type {import('../lawn/Lawn.js').Lawn} */ (this.lawn);
    if (this.snapshot) lawn.grid.restore(this.snapshot);
    this.snapshot = null;
    lawn.replaying = false;
    const { x, z, yaw, trimmerOut } = this.saved;
    this.player.placeAt(x, z, yaw);
    this.mower.syncModel(0);
    this.trimmer.show(trimmerOut);
    this.hands = null;
  }

  /** For the HUD while it plays: how fast, and how far through. */
  get status() {
    if (this.state !== 'playing') return null;
    return {
      speed: this.speed,
      seconds: this.cursor / STEPS_PER_SECOND,
      total: this.steps.length / STEPS_PER_SECOND,
    };
  }
}
