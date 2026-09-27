import { createRandom } from '../cleaning/noise.js';
import { config } from '../config.js';
import { audioMix, smoothTowards } from './audioMix.js';

/** How quickly volumes follow the game (seconds). Short enough to feel instant, long enough
 * to avoid clicks when a sound starts or stops. */
const FADE_TIME = 0.04;

/**
 * Pressure washer sounds, synthesized with the Web Audio API (no audio files needed yet).
 *
 * Four layers play continuously at zero volume, and `update()` fades each one up or down:
 * - hum: the engine (a low, buzzy oscillator with a slight wobble)
 * - hiss: water rushing out of the nozzle (high-pitched filtered noise)
 * - impact: water hitting a surface (lower, rumbly filtered noise)
 * - strip: dirt coming off (a gritty crackle that follows how much dirt is being removed)
 *
 * Browsers only allow audio after the player interacts with the page, so nothing is created
 * until the first click.
 */
export class AudioSystem {
  constructor() {
    /** @type {AudioContext | null} */
    this.context = null;
    this.muted = false;
    this.dirtRate = 0; // smoothed, so the crackle doesn't flutter frame to frame
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

    const random = createRandom(11);
    const noise = createNoiseBuffer(context, random);
    const crackle = createCrackleBuffer(context, random);

    this.layers = {
      hum: this.createHum(),
      hiss: this.createNoiseLayer(noise, 0, [
        { type: 'highpass', frequency: 1500 },
        { type: 'peaking', frequency: 4200, Q: 0.9, gain: 5 },
      ]),
      impact: this.createNoiseLayer(noise, 0.7, [{ type: 'bandpass', frequency: 650, Q: 0.7 }]),
      strip: this.createNoiseLayer(crackle, 0, [{ type: 'bandpass', frequency: 2800, Q: 0.8 }]),
    };
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

  /**
   * @param {number} dt Seconds since the previous frame.
   * @param {import('../pressure-washer/PressureWasher.js').PressureWasher} washer
   */
  update(dt, washer) {
    if (!this.context || !this.layers) return;
    this.dirtRate = smoothTowards(this.dirtRate, washer.dirtRate, dt, 12);
    const volumes = audioMix(
      {
        equipped: washer.isEquipped,
        spraying: washer.isSpraying,
        hitting: washer.isHitting,
        strength: washer.sprayStrength,
        dirtRate: this.dirtRate,
      },
      config.audio,
    );
    const now = this.context.currentTime;
    for (const [name, gain] of Object.entries(this.layers)) {
      gain.gain.setTargetAtTime(
        volumes[/** @type {keyof typeof volumes} */ (name)],
        now,
        FADE_TIME,
      );
    }
    if (washer.justEquipped) this.playClunk();
  }

  /**
   * A looping noise source through a chain of filters, into its own volume control.
   *
   * @param {AudioBuffer} buffer
   * @param {number} offset Seconds into the buffer to start (so layers don't sound identical).
   * @param {{ type: BiquadFilterType, frequency: number, Q?: number, gain?: number }[]} filters
   */
  createNoiseLayer(buffer, offset, filters) {
    const context = /** @type {AudioContext} */ (this.context);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    /** @type {AudioNode} */
    let node = source;
    for (const settings of filters) {
      const filter = context.createBiquadFilter();
      filter.type = settings.type;
      filter.frequency.value = settings.frequency;
      if (settings.Q !== undefined) filter.Q.value = settings.Q;
      if (settings.gain !== undefined) filter.gain.value = settings.gain;
      node.connect(filter);
      node = filter;
    }
    const volume = context.createGain();
    volume.gain.value = 0;
    node.connect(volume);
    volume.connect(/** @type {GainNode} */ (this.master));
    source.start(0, offset);
    return volume;
  }

  /** The engine: two buzzy oscillators, muffled, with a slight wobble like a real motor. */
  createHum() {
    const context = /** @type {AudioContext} */ (this.context);
    // Chain: oscillators → muffle (low-pass filter) → wobble → volume → master.
    const muffle = context.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 260;
    const wobble = context.createGain();
    const volume = context.createGain();
    volume.gain.value = 0;
    muffle.connect(wobble);
    wobble.connect(volume);
    volume.connect(/** @type {GainNode} */ (this.master));

    for (const [type, frequency, level] of /** @type {const} */ ([
      ['sawtooth', 55, 1],
      ['square', 110, 0.35],
    ])) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(muffle);
      oscillator.start();
    }

    // A slow (7 Hz) oscillator nudges the wobble's volume between 0.85 and 1.15.
    const wobbleSpeed = context.createOscillator();
    wobbleSpeed.frequency.value = 7;
    const wobbleDepth = context.createGain();
    wobbleDepth.gain.value = 0.15;
    wobbleSpeed.connect(wobbleDepth);
    wobbleDepth.connect(wobble.gain);
    wobbleSpeed.start();
    return volume;
  }

  /** A short mechanical "clunk" for picking up the gun (or a gate unlatching). */
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

/**
 * Two seconds of white noise: the raw material for water sounds.
 *
 * @param {AudioContext} context
 * @param {() => number} random
 */
function createNoiseBuffer(context, random) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  return buffer;
}

/**
 * Two seconds of random tiny clicks: sounds like grit being blasted off.
 *
 * @param {AudioContext} context
 * @param {() => number} random
 */
function createCrackleBuffer(context, random) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  let envelope = 0;
  let loudness = 0;
  for (let i = 0; i < data.length; i++) {
    if (random() < 0.002) {
      envelope = 1; // start a new click
      loudness = 0.4 + random() * 0.6;
    }
    data[i] = (random() * 2 - 1) * envelope * loudness;
    envelope *= 0.93; // each click dies away in about a millisecond
  }
  return buffer;
}
