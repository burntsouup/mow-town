import { config } from '../config.js';
import { createRandom } from '../math/noise.js';
import { engineSound } from './audioMix.js';

/** How quickly volumes follow the game (seconds). Short enough to feel instant, long enough
 * to avoid clicks when a sound starts or stops. */
const FADE_TIME = 0.04;

/**
 * Game sounds, synthesized with the Web Audio API (no audio files needed yet).
 *
 * The mower has two continuous layers, faded and re-pitched each frame by `update()`:
 * - engine: a buzzy, chugging low tone whose pitch follows the engine speed (see
 *   engineSound in audioMix.js), plus a little mechanical rattle
 * - cutting: the blades whipping through grass (filtered noise and a crackle), louder the
 *   more they're cutting
 *
 * Browsers only allow audio after the player interacts with the page, so nothing is created
 * until the first click.
 */
export class AudioSystem {
  constructor() {
    /** @type {AudioContext | null} */
    this.context = null;
    this.muted = false;
    this.rpm = 0; // mower engine speed, 0 (stopped) .. 1 (full speed)
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
    this.engine = this.createEngine(noise);
    this.cutting = this.createNoiseLayer(noise, 0.7, [
      { type: 'bandpass', frequency: 1300, Q: 0.6 },
      { type: 'highshelf', frequency: 3000, gain: -6 },
    ]);
    this.crackle = this.createNoiseLayer(createCrackleBuffer(context, random), 0, [
      { type: 'bandpass', frequency: 2600, Q: 0.8 },
    ]);
  }

  /**
   * @param {number} dt Seconds since the previous frame.
   * @param {{ running: boolean, load: number, bumped: boolean, grabbed: boolean }} mower
   *   load: how hard the blades are working (0..1); bumped/grabbed: just ran into something /
   *   just grabbed the handle, this frame.
   */
  update(dt, mower) {
    if (mower.grabbed || mower.bumped) this.playClunk();
    const sound = engineSound(this.rpm, mower, config.audio, dt);
    this.rpm = sound.rpm;
    if (!this.context || !this.engine || !this.cutting || !this.crackle) return;
    const now = this.context.currentTime;
    const frequency = config.audio.engineFrequency * (0.3 + 0.7 * this.rpm);
    this.engine.setFrequency(frequency, now);
    this.engine.volume.gain.setTargetAtTime(sound.engine, now, FADE_TIME);
    this.cutting.gain.setTargetAtTime(sound.cutting, now, FADE_TIME);
    this.crackle.gain.setTargetAtTime(sound.cutting * 0.6, now, FADE_TIME);
  }

  /**
   * The engine: a sawtooth and a square an octave up, "chugging" at the firing rate (half the
   * base pitch), muffled, with a bit of rattle. Returns its volume and a way to set its pitch.
   *
   * @param {AudioBuffer} noise
   */
  createEngine(noise) {
    const context = /** @type {AudioContext} */ (this.context);
    // Chain: oscillators → chug (gain wobbled by an LFO) → muffle (low-pass) → volume.
    const volume = context.createGain();
    volume.gain.value = 0;
    volume.connect(/** @type {GainNode} */ (this.master));
    const muffle = context.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 700;
    muffle.Q.value = 2;
    muffle.connect(volume);
    const chug = context.createGain();
    chug.gain.value = 0.6;
    chug.connect(muffle);

    /** @type {[OscillatorType, number, number][]} */
    const voices = [
      ['sawtooth', 1, 1],
      ['square', 2, 0.3],
    ];
    const oscillators = voices.map(([type, multiple, level]) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      const gain = context.createGain();
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(chug);
      oscillator.start();
      return { oscillator, multiple };
    });
    const firing = context.createOscillator();
    firing.type = 'square';
    const firingDepth = context.createGain();
    firingDepth.gain.value = 0.4;
    firing.connect(firingDepth);
    firingDepth.connect(chug.gain);
    firing.start();

    // Mechanical rattle: low, rumbly noise underneath.
    const rattle = this.createNoiseLayer(noise, 0, [{ type: 'bandpass', frequency: 180, Q: 1 }]);
    rattle.disconnect();
    rattle.gain.value = 0.7;
    rattle.connect(volume);

    return {
      volume,
      /** @param {number} frequency @param {number} at */
      setFrequency(frequency, at) {
        for (const { oscillator, multiple } of oscillators) {
          oscillator.frequency.setTargetAtTime(frequency * multiple, at, 0.03);
        }
        firing.frequency.setTargetAtTime(frequency / 2, at, 0.03);
        muffle.frequency.setTargetAtTime(350 + frequency * 9, at, 0.05); // brighter when revving
      },
    };
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

/**
 * Two seconds of white noise: the raw material for the rattle and cutting sounds.
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
 * Two seconds of random tiny clicks: sounds like blades snipping through grass.
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
    if (random() < 0.003) {
      envelope = 1; // start a new click
      loudness = 0.4 + random() * 0.6;
    }
    data[i] = (random() * 2 - 1) * envelope * loudness;
    envelope *= 0.93; // each click dies away in about a millisecond
  }
  return buffer;
}
