import { describe, expect, it } from 'vitest';
import {
  BEATS_PER_BAR,
  chordNotes,
  composeSong,
  noteFrequency,
  RANGES,
  scaleStep,
  swingBeat,
  voiceChord,
} from './music.js';

const MAJOR_STEPS = new Set([0, 2, 4, 5, 7, 9, 11]);
/** @param {import('./music.js').Song} song @param {number} note */
const inKey = (song, note) => MAJOR_STEPS.has((((note - song.key) % 12) + 12) % 12);

describe('composeSong', () => {
  it('writes the same song every time for the same number, and a new one for the next', () => {
    expect(composeSong(3)).toEqual(composeSong(3));
    expect(composeSong(3)).not.toEqual(composeSong(4));
  });

  it('is 32 bars: an intro and outro of keys and bass, the tune and drums in between', () => {
    const song = composeSong(0);
    expect(song.bars.length).toBe(32);
    expect(song.chords.length).toBe(32);
    const has = (/** @type {number} */ bar, /** @type {string} */ voice) =>
      song.bars[bar].some((note) => note.voice === voice);
    for (let bar = 0; bar < 32; bar++) {
      expect(has(bar, 'keys') && has(bar, 'bass')).toBe(true);
      const quiet = bar < 4 || bar >= 28;
      expect(has(bar, 'kick')).toBe(!quiet);
      if (quiet) expect(has(bar, 'melody')).toBe(false);
    }
    expect(song.bars.slice(4, 28).filter((_, bar) => has(bar + 4, 'melody')).length).toBe(24);
  });

  it('keeps every note in the key, in its part of the range, and inside its bar', () => {
    for (let index = 0; index < 12; index++) {
      const song = composeSong(index);
      expect(song.bpm).toBeGreaterThanOrEqual(80);
      expect(song.bpm).toBeLessThanOrEqual(92);
      for (const bar of song.bars) {
        for (const note of bar) {
          expect(note.beat).toBeGreaterThanOrEqual(0);
          expect(note.beat).toBeLessThan(BEATS_PER_BAR);
          expect(note.velocity).toBeGreaterThan(0);
          expect(note.velocity).toBeLessThanOrEqual(1);
          if (note.voice === 'keys' || note.voice === 'melody' || note.voice === 'bass') {
            const [low, high] = RANGES[note.voice];
            expect(note.note).toBeGreaterThanOrEqual(low);
            expect(note.note).toBeLessThanOrEqual(high);
            expect(inKey(song, note.note)).toBe(true);
          }
        }
      }
    }
  });

  it("lands the tune on the chord's notes on beats 1 and 3, and answers come home", () => {
    for (let index = 0; index < 6; index++) {
      const song = composeSong(index);
      song.bars.forEach((bar, i) => {
        // (Or on the key's root: where an answer comes home.)
        const chord = chordNotes(song.key, song.chords[i]).map((note) => note % 12);
        chord.push(song.key % 12);
        for (const note of bar) {
          if (note.voice === 'melody' && note.beat % 2 === 0) {
            expect(chord).toContain(note.note % 12);
          }
        }
      });
      // Phrases start every two bars from bar 4; the second and fourth of each four answer.
      for (const start of [6, 10, 14, 18, 22, 26]) {
        const tune = [...song.bars[start], ...song.bars[start + 1]].filter(
          (note) => note.voice === 'melody',
        );
        const last = song.bars[start + 1].some((note) => note.voice === 'melody')
          ? song.bars[start + 1].filter((note) => note.voice === 'melody').at(-1)
          : tune.at(-1);
        expect(((last?.note ?? 0) - song.key) % 12).toBe(0);
      }
    }
  });
});

describe('voiceChord', () => {
  it('moves to the next chord with as little hand movement as it can', () => {
    const key = 53; // F
    const first = voiceChord(chordNotes(key, 0), null); // Fmaj7
    const second = voiceChord(chordNotes(key, 5), first); // Dm7
    const moved = second.reduce((sum, note, i) => sum + Math.abs(note - first[i]), 0);
    expect(moved).toBeLessThanOrEqual(4); // Fmaj7 to Dm7 shares three notes
    for (const voicing of [first, second]) {
      expect(voicing[0]).toBeGreaterThanOrEqual(RANGES.keys[0]);
      expect(voicing.at(-1)).toBeLessThanOrEqual(RANGES.keys[1]);
    }
  });
});

describe('scale and pitch helpers', () => {
  it('counts major-scale degrees in semitones, past the octave and below the root', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(scaleStep)).toEqual([0, 2, 4, 5, 7, 9, 11, 12]);
    expect(scaleStep(-1)).toBe(-1);
    expect(scaleStep(9)).toBe(16);
  });

  it('builds seventh chords from the key: major on I, minor on ii, dominant on V', () => {
    expect(chordNotes(60, 0)).toEqual([60, 64, 67, 71]); // Cmaj7
    expect(chordNotes(60, 1)).toEqual([62, 65, 69, 72]); // Dm7
    expect(chordNotes(60, 4)).toEqual([67, 71, 74, 77]); // G7
  });

  it('swings off-beat eighths late and leaves the beats alone', () => {
    expect(swingBeat(0)).toBe(0);
    expect(swingBeat(1)).toBe(1);
    expect(swingBeat(0.5, 0.6)).toBeCloseTo(0.6);
    expect(swingBeat(2.5, 0.6)).toBeCloseTo(2.6);
    expect(swingBeat(0.75, 0.6)).toBeCloseTo(0.8);
    expect(swingBeat(0.5, 0.5)).toBeCloseTo(0.5); // straight
  });

  it('turns MIDI notes into frequencies', () => {
    expect(noteFrequency(69)).toBe(440);
    expect(noteFrequency(57)).toBeCloseTo(220);
    expect(noteFrequency(60)).toBeCloseTo(261.63, 1);
  });
});
