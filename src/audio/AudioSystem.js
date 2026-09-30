import { config } from '../config.js';
import { createRandom } from '../math/noise.js';
import { engineSound, trimmerSound } from './audioMix.js';

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
 * The string trimmer has its own, higher buzz, with the whirr of its line and a snipping
 * layer while it cuts.
 *
 * Browsers only allow audio after the player interacts with the page, so nothing is created
 * until the first click.
 */
export class AudioSystem {
  constructor() {
    /** @type {AudioContext | null} */
    this.context = null;
    /** @type {AudioBuffer | null} White noise, shared by the sounds made from it. */
    this.noise = null;
    this.muted = false;
    this.rpm = 0; // mower engine speed, 0 (stopped) .. 1 (full speed)
    this.trimmerRpm = 0; // the same for the string trimmer
    this.random = createRandom(29); // so no two footsteps sound quite the same
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
    this.noise = noise;
    this.engine = this.createEngine(noise);
    this.cutting = this.createNoiseLayer(noise, 0.7, [
      { type: 'bandpass', frequency: 1300, Q: 0.6 },
      { type: 'highshelf', frequency: 3000, gain: -6 },
    ]);
    const crackle = createCrackleBuffer(context, random);
    this.crackle = this.createNoiseLayer(crackle, 0, [
      { type: 'bandpass', frequency: 2600, Q: 0.8 },
    ]);
    this.trimmer = this.createTrimmer(noise, crackle);
  }

  /**
   * @param {number} dt Seconds since the previous frame.
   * @param {{ running: boolean, load: number, bumped: boolean, grabbed: boolean }} mower
   *   load: how hard the blades are working (0..1); bumped/grabbed: just ran into something /
   *   just grabbed the handle, this frame.
   * @param {{ out: boolean, throttle: boolean, load: number }} trimmer See trimmerSound.
   */
  update(dt, mower, trimmer) {
    if (mower.grabbed || mower.bumped) this.playClunk();
    const sound = engineSound(this.rpm, mower, config.audio, dt);
    this.rpm = sound.rpm;
    const trimmed = trimmerSound(this.trimmerRpm, trimmer, config.audio.trimmer, dt);
    this.trimmerRpm = trimmed.rpm;
    if (!this.context || !this.engine || !this.cutting || !this.crackle || !this.trimmer) return;
    const now = this.context.currentTime;
    const frequency = config.audio.engineFrequency * (0.3 + 0.7 * this.rpm);
    this.engine.setFrequency(frequency, now);
    this.engine.volume.gain.setTargetAtTime(sound.engine, now, FADE_TIME);
    this.cutting.gain.setTargetAtTime(sound.cutting, now, FADE_TIME);
    this.crackle.gain.setTargetAtTime(sound.cutting * 0.6, now, FADE_TIME);

    this.trimmer.setFrequency(
      config.audio.trimmer.frequency * (0.35 + 0.65 * this.trimmerRpm),
      now,
    );
    this.trimmer.volume.gain.setTargetAtTime(trimmed.engine, now, FADE_TIME);
    // The line whirs louder the faster it spins.
    const whirr = trimmed.engine * Math.max(0, this.trimmerRpm - 0.4) * 1.5;
    this.trimmer.whirr.gain.setTargetAtTime(whirr, now, FADE_TIME);
    this.trimmer.cutting.gain.setTargetAtTime(trimmed.cutting, now, FADE_TIME);
  }

  /**
   * The string trimmer: a raspy sawtooth buzz (a small two-stroke engine revs much higher
   * than the mower), the line whirring through the air, and grass snipping as it cuts.
   *
   * @param {AudioBuffer} noise
   * @param {AudioBuffer} crackle
   */
  createTrimmer(noise, crackle) {
    const context = /** @type {AudioContext} */ (this.context);
    const volume = context.createGain();
    volume.gain.value = 0;
    volume.connect(/** @type {GainNode} */ (this.master));
    const muffle = context.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.Q.value = 3;
    muffle.connect(volume);
    /** @type {[OscillatorType, number, number][]} */
    const voices = [
      ['sawtooth', 1, 1],
      ['square', 2, 0.25],
      ['sawtooth', 1.007, 0.5], // slightly off-pitch: a rough, beating rasp
    ];
    const oscillators = voices.map(([type, multiple, level]) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      const gain = context.createGain();
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(muffle);
      oscillator.start();
      return { oscillator, multiple };
    });
    const whirr = this.createNoiseLayer(noise, 1.1, [
      { type: 'bandpass', frequency: 3200, Q: 1.5 },
    ]);
    const cutting = this.createNoiseLayer(crackle, 0.7, [
      { type: 'bandpass', frequency: 2200, Q: 0.7 },
    ]);
    return {
      volume,
      whirr,
      cutting,
      /** @param {number} frequency @param {number} at */
      setFrequency(frequency, at) {
        for (const { oscillator, multiple } of oscillators) {
          oscillator.frequency.setTargetAtTime(frequency * multiple, at, 0.03);
        }
        muffle.frequency.setTargetAtTime(500 + frequency * 10, at, 0.05);
      },
    };
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

  /**
   * A footstep: a soft swish on grass, a muffled pad on paths (sneakers).
   *
   * @param {'grass' | 'path'} surface
   * @param {number} strength 0..1: a gentle step to a running stomp.
   */
  playStep(surface, strength) {
    if (!this.context || !this.master || !this.noise) return;
    const context = this.context;
    const now = context.currentTime;
    const grass = surface === 'grass';
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.8 + 0.4 * this.random();
    const filter = context.createBiquadFilter();
    filter.type = grass ? 'lowpass' : 'bandpass';
    filter.frequency.value = grass ? 1800 : 700 + 300 * this.random();
    filter.Q.value = grass ? 0.7 : 1.4;
    const length = grass ? 0.12 : 0.07;
    const volume = config.audio.steps[surface] * (0.5 + 0.5 * strength);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + length);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    // Start somewhere random in the noise, so no two steps are alike.
    source.start(now, this.random() * 0.5, length + 0.02);
  }

  /**
   * Birdsong in the distance: a little phrase of two to four quick, rising chirps, each
   * phrase a bit different.
   */
  playChirps() {
    if (!this.context || !this.master) return;
    const context = this.context;
    const start = context.currentTime + 0.02;
    const notes = 2 + Math.floor(this.random() * 3);
    const pitch = 2600 + 1400 * this.random();
    for (let i = 0; i < notes; i++) {
      const at = start + i * (0.09 + 0.05 * this.random());
      const tone = context.createOscillator();
      tone.type = 'sine';
      const from = pitch * (0.85 + 0.3 * this.random());
      tone.frequency.setValueAtTime(from, at);
      tone.frequency.exponentialRampToValueAtTime(from * 1.45, at + 0.05);
      tone.frequency.exponentialRampToValueAtTime(from * 1.1, at + 0.08);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(config.audio.birds, at + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      tone.connect(envelope);
      envelope.connect(this.master);
      tone.start(at);
      tone.stop(at + 0.1);
    }
  }

  /** A soft, bubbly "pop" (trying something on in the closet). */
  playPop() {
    if (!this.context || !this.master) return;
    const context = this.context;
    const now = context.currentTime;
    const tone = context.createOscillator();
    tone.type = 'sine';
    const pitch = 520 + 160 * this.random();
    tone.frequency.setValueAtTime(pitch, now);
    tone.frequency.exponentialRampToValueAtTime(pitch * 2.2, now + 0.07);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(config.audio.pop, now + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    tone.connect(envelope);
    envelope.connect(this.master);
    tone.start(now);
    tone.stop(now + 0.16);
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

  /** "Edges done!": two quick, bright bell notes (E6, then A6). */
  playDing() {
    if (!this.context || !this.master) return;
    const context = this.context;
    const start = context.currentTime + 0.02;
    [1318.5, 1760].forEach((frequency, i) => {
      const at = start + i * 0.09;
      const tone = context.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = frequency;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(config.audio.ding, at + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
      tone.connect(envelope);
      envelope.connect(/** @type {GainNode} */ (this.master));
      tone.start(at);
      tone.stop(at + 0.75);
    });
  }

  /**
   * "Ka-ching!": a till's bell (two bright pings, with the off-key overtones that make
   * metal sound like metal) over a quick rattle of coins.
   *
   * @param {number} [delay] Seconds from now.
   */
  playCoins(delay = 0) {
    if (!this.context || !this.master || !this.noise) return;
    const context = this.context;
    const master = this.master;
    const start = context.currentTime + delay;
    const volume = config.audio.coins;

    const rattle = context.createBufferSource();
    rattle.buffer = this.noise;
    const bright = context.createBiquadFilter();
    bright.type = 'highpass';
    bright.frequency.value = 5000;
    const rattleEnvelope = context.createGain();
    rattleEnvelope.gain.setValueAtTime(0.0001, start);
    rattleEnvelope.gain.exponentialRampToValueAtTime(volume * 0.5, start + 0.01);
    rattleEnvelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    rattle.connect(bright);
    bright.connect(rattleEnvelope);
    rattleEnvelope.connect(master);
    rattle.start(start, 0.3);
    rattle.stop(start + 0.3);

    for (const [frequency, after] of [
      [1568, 0.02], // G6
      [2093, 0.11], // C7
    ]) {
      const at = start + after;
      for (const [ratio, level] of [
        [1, 1],
        [2.76, 0.3],
        [5.4, 0.1],
      ]) {
        const ping = context.createOscillator();
        ping.frequency.value = frequency * ratio;
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(volume * level, at + 0.004);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.8 / ratio);
        ping.connect(envelope);
        envelope.connect(master);
        ping.start(at);
        ping.stop(at + 0.85);
      }
    }
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
