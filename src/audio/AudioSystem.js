import { config } from '../config.js';

/** How quickly volumes follow the game (seconds). Short enough to feel instant, long enough
 * to avoid clicks when a sound starts or stops. */
const FADE_TIME = 0.04;

/**
 * Game sounds, synthesized with the Web Audio API (no audio files needed yet).
 *
 * Browsers only allow audio after the player interacts with the page, so nothing is created
 * until the first click.
 */
export class AudioSystem {
  constructor() {
    /** @type {AudioContext | null} */
    this.context = null;
    this.muted = false;
    window.addEventListener('pointerdown', () => this.start());
  }

  /** Creates the sound graph on the first click (or wakes it back up). */
  start() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    const context = new AudioContext();
    this.context = context;

    const compressor = context.createDynamicsCompressor(); // keeps loud moments from clipping
    compressor.connect(context.destination);
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : config.audio.master;
    this.master.connect(compressor);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolume();
  }

  /** Applies the master volume from config (or silence while muted). */
  applyVolume() {
    if (!this.context || !this.master) return;
    const volume = this.muted ? 0 : config.audio.master;
    this.master.gain.setTargetAtTime(volume, this.context.currentTime, FADE_TIME);
  }

  /** A short mechanical "clunk", e.g. grabbing a handle. */
  playClunk() {
    if (!this.context || !this.master) return; // audio hasn't started yet (no click so far)
    const context = this.context;
    const now = context.currentTime;
    const thump = context.createOscillator();
    thump.frequency.setValueAtTime(150, now);
    thump.frequency.exponentialRampToValueAtTime(50, now + 0.12);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.6, now + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    thump.connect(envelope);
    envelope.connect(/** @type {GainNode} */ (this.master));
    thump.start(now);
    thump.stop(now + 0.25);
  }

  /** "Job complete!": a bright rising arpeggio (C, E, G, high C) with a soft shimmer. */
  playChime() {
    if (!this.context || !this.master) return;
    const context = this.context;
    const start = context.currentTime + 0.05;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, i) => {
      const at = start + i * 0.1;
      for (const [type, pitch, level] of /** @type {const} */ ([
        ['sine', 1, 1],
        ['triangle', 2, 0.25], // an octave up, quietly: the shimmer
      ])) {
        const tone = context.createOscillator();
        tone.type = type;
        tone.frequency.value = frequency * pitch;
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(config.audio.chime * level, at + 0.01);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
        tone.connect(envelope);
        envelope.connect(this.master);
        tone.start(at);
        tone.stop(at + 1.5);
      }
    });
  }
}
