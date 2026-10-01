import { createRandom } from '../math/noise.js';
import { BEATS_PER_BAR, composeSong, noteFrequency, swingBeat } from './music.js';

/** Seconds of music scheduled ahead (Web Audio then plays it exactly on time). */
const LOOKAHEAD = 0.35;

/**
 * Plays the soundtrack (see music.js for how it's written) on a small band synthesized with
 * the Web Audio API, like the game's other sounds:
 * - keys: an electric piano, made by FM synthesis (one sine wave wobbling another's pitch;
 *   the wobble fades fast, which gives the bright "tine" at the start of each note)
 * - the tune: a marimba (a sine with a quickly fading partial four times higher: the mallet)
 * - bass: a soft triangle wave, its top rolled off
 * - drums: a pitch-dropping sine for the kick, and filtered noise for the brushes and shaker
 * Everything goes through a shared room reverb (fading noise as an impulse response) and a
 * gentle low-pass, like an old record.
 *
 * Notes are scheduled a moment ahead from update(), a bar at a time.
 */
export class MusicPlayer {
  /**
   * @param {BaseAudioContext} context
   * @param {AudioNode} destination
   * @param {AudioBuffer} noise White noise, for the drums.
   */
  constructor(context, destination, noise) {
    this.context = context;
    this.noise = noise;
    this.random = createRandom(41); // tiny timing wobbles, like a real player

    this.volume = context.createGain(); // the whole band: fades, ducking and swells
    this.volume.gain.value = 0;
    const warmth = context.createBiquadFilter();
    warmth.type = 'lowpass';
    warmth.frequency.value = 6500;
    warmth.Q.value = 0.5;
    this.volume.connect(warmth);
    warmth.connect(destination);

    const reverb = context.createConvolver();
    reverb.buffer = roomImpulse(context, 2.4, createRandom(77));
    const wet = context.createGain();
    wet.gain.value = 0.3;
    reverb.connect(wet);
    wet.connect(this.volume);

    /**
     * Each part's own channel: its loudness, where it sits left to right, and how much of
     * it goes to the reverb.
     *
     * @param {number} level @param {number} pan @param {number} send
     */
    const channel = (level, pan, send) => {
      const input = context.createGain();
      input.gain.value = level;
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      input.connect(panner);
      panner.connect(this.volume);
      const toReverb = context.createGain();
      toReverb.gain.value = send;
      input.connect(toReverb);
      toReverb.connect(reverb);
      return input;
    };
    this.channels = {
      keys: channel(0.9, -0.25, 0.45),
      melody: channel(0.8, 0.3, 0.5),
      bass: channel(1, 0, 0.08),
      drums: channel(0.7, 0.05, 0.15),
    };

    this.songIndex = 0;
    this.song = composeSong(0);
    this.bar = 0;
    /** @type {number | null} When the next bar to schedule starts (context seconds). */
    this.barTime = null;
  }

  /**
   * @param {number} level How loud the band plays (0 = silent: it stops scheduling).
   * @param {number} [fade] Seconds to ease to it (a time constant).
   */
  update(level, fade = 0.5) {
    const now = this.context.currentTime;
    this.volume.gain.setTargetAtTime(level, now, fade);
    if (level <= 0) {
      this.barTime = null; // pick up from the next bar when it comes back
      return;
    }
    this.scheduleUntil(now + LOOKAHEAD);
  }

  /**
   * Schedules every bar that starts before `time`. If we've fallen behind (the tab was
   * hidden, say), it carries on from now rather than cramming in what was missed.
   *
   * @param {number} time Context seconds.
   */
  scheduleUntil(time) {
    const now = this.context.currentTime;
    if (this.barTime === null || this.barTime < now) this.barTime = now + 0.05;
    while (this.barTime < time) {
      const beat = 60 / this.song.bpm;
      this.playBar(this.song.bars[this.bar], this.barTime, beat);
      this.barTime += BEATS_PER_BAR * beat;
      this.bar++;
      if (this.bar >= this.song.bars.length) {
        // A bar's rest, then the next song (a new key and tempo).
        this.barTime += BEATS_PER_BAR * beat;
        this.songIndex++;
        this.song = composeSong(this.songIndex);
        this.bar = 0;
      }
    }
  }

  /**
   * @param {import('./music.js').NoteEvent[]} notes
   * @param {number} start Context seconds.
   * @param {number} beat Seconds per beat.
   */
  playBar(notes, start, beat) {
    for (const note of notes) {
      const wobble = note.voice === 'keys' || note.voice === 'melody' ? 0.008 : 0.003;
      const time = start + swingBeat(note.beat) * beat + (this.random() - 0.5) * 2 * wobble;
      const length = note.length * beat;
      const frequency = noteFrequency(note.note);
      if (note.voice === 'keys') this.keys(time, length, frequency, note.velocity);
      else if (note.voice === 'melody') this.marimba(time, frequency, note.velocity);
      else if (note.voice === 'bass') this.bass(time, length, frequency, note.velocity);
      else if (note.voice === 'kick') this.kick(time, note.velocity);
      else this.brush(time, note.voice, note.velocity);
    }
  }

  /**
   * An electric piano note.
   *
   * @param {number} time @param {number} length @param {number} frequency
   * @param {number} velocity
   */
  keys(time, length, frequency, velocity) {
    const { context } = this;
    const carrier = context.createOscillator();
    carrier.frequency.value = frequency;
    const modulator = context.createOscillator();
    modulator.frequency.value = frequency;
    const depth = context.createGain(); // how far the modulator bends the pitch, in Hz
    depth.gain.setValueAtTime(frequency * 1.6 * velocity, time);
    depth.gain.setTargetAtTime(frequency * 0.15, time, 0.25);
    modulator.connect(depth);
    depth.connect(carrier.frequency);
    const amp = envelope(context, time, length, {
      peak: 0.11 * velocity,
      attack: 0.006,
      sustain: 0.45,
      decay: 0.7,
      release: 0.25,
    });
    carrier.connect(amp);
    amp.connect(this.channels.keys);
    const end = time + length + 1.2;
    for (const oscillator of [carrier, modulator]) {
      oscillator.start(time);
      oscillator.stop(end);
    }
  }

  /**
   * A marimba note: it rings and fades on its own.
   *
   * @param {number} time @param {number} frequency @param {number} velocity
   */
  marimba(time, frequency, velocity) {
    const { context } = this;
    const body = context.createOscillator();
    body.frequency.value = frequency;
    const mallet = context.createOscillator();
    mallet.frequency.value = frequency * 4;
    const malletLevel = context.createGain();
    malletLevel.gain.setValueAtTime(0.35, time);
    malletLevel.gain.setTargetAtTime(0, time, 0.025);
    mallet.connect(malletLevel);
    const amp = context.createGain();
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(0.13 * velocity, time + 0.004);
    amp.gain.setTargetAtTime(0, time + 0.004, 0.32);
    body.connect(amp);
    malletLevel.connect(amp);
    amp.connect(this.channels.melody);
    for (const oscillator of [body, mallet]) {
      oscillator.start(time);
      oscillator.stop(time + 2);
    }
  }

  /**
   * A bass note.
   *
   * @param {number} time @param {number} length @param {number} frequency
   * @param {number} velocity
   */
  bass(time, length, frequency, velocity) {
    const { context } = this;
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    const soften = context.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 650;
    const amp = envelope(context, time, length, {
      peak: 0.3 * velocity,
      attack: 0.012,
      sustain: 0.65,
      decay: 0.4,
      release: 0.08,
    });
    oscillator.connect(soften);
    soften.connect(amp);
    amp.connect(this.channels.bass);
    oscillator.start(time);
    oscillator.stop(time + length + 0.5);
  }

  /**
   * A soft kick drum: a low thump that drops in pitch.
   *
   * @param {number} time @param {number} velocity
   */
  kick(time, velocity) {
    const { context } = this;
    const oscillator = context.createOscillator();
    oscillator.frequency.setValueAtTime(110, time);
    oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    const amp = context.createGain();
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(0.42 * velocity, time + 0.003);
    amp.gain.setTargetAtTime(0, time + 0.003, 0.08);
    oscillator.connect(amp);
    amp.connect(this.channels.drums);
    oscillator.start(time);
    oscillator.stop(time + 0.6);
  }

  /**
   * A brush on the snare, or a shake of the shaker: a puff of filtered noise.
   *
   * @param {number} time @param {'snare' | 'shaker'} voice @param {number} velocity
   */
  brush(time, voice, velocity) {
    const { context } = this;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    const snare = voice === 'snare';
    filter.type = snare ? 'bandpass' : 'highpass';
    filter.frequency.value = snare ? 1900 : 7000;
    filter.Q.value = snare ? 0.6 : 0.7;
    const amp = context.createGain();
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(
      (snare ? 0.11 : 0.045) * velocity,
      time + (snare ? 0.012 : 0.005),
    );
    amp.gain.setTargetAtTime(0, time + 0.012, snare ? 0.07 : 0.025);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.channels.drums);
    const offset = this.random() * Math.max(0, this.noise.duration - 1);
    source.start(time, offset);
    source.stop(time + 0.5);
  }
}

/**
 * A volume envelope: up to `peak` over `attack`, easing down toward `sustain` × peak, then
 * fading out after `length` (all in seconds; decay and release are time constants).
 *
 * @param {BaseAudioContext} context
 * @param {number} time
 * @param {number} length
 * @param {{ peak: number, attack: number, sustain: number, decay: number, release: number }}
 *   shape
 */
function envelope(context, time, length, { peak, attack, sustain, decay, release }) {
  const amp = context.createGain();
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + attack);
  amp.gain.setTargetAtTime(peak * sustain, time + attack, decay);
  amp.gain.setTargetAtTime(0, time + Math.max(length, attack), release);
  return amp;
}

/**
 * A room's echo, made up: stereo noise fading away over `seconds`. Played through a
 * ConvolverNode, it makes anything sound like it's in that room.
 *
 * @param {BaseAudioContext} context
 * @param {number} seconds
 * @param {() => number} random
 */
function roomImpulse(context, seconds, random) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const fade = (1 - i / length) ** 3;
      data[i] = (random() * 2 - 1) * fade * 0.5;
    }
  }
  return buffer;
}
