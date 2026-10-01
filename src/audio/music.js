// @ts-check
import { createRandom } from '../math/noise.js';

/**
 * The soundtrack's composer: cozy, gently swinging tunes, written in code. Pure: it only
 * decides the notes (MusicPlayer.js plays them). Seeded, so song 0 is always the same song.
 *
 * Each song is 32 bars in a major key: a 4-bar intro (keys and bass), an 8-bar tune, an
 * 8-bar middle on different chords (the tune up higher), the tune again with new twists,
 * and a 4-bar outro. The ingredients, in music terms:
 * - chords: four-note "seventh" chords from the key (they sound warm and a bit jazzy),
 *   moving to the nearest inversion each time so the keys glide rather than jump
 * - the tune: two-bar phrases on the major pentatonic (the five notes of the key that never
 *   clash), landing on the chord's own notes on the strong beats, each phrase answered by
 *   another with the same rhythm that comes home to the key's root note
 * - bass: the chord's root on the downbeat, its fifth, and a step leading into the next chord
 * - drums: soft kick, brushed snare and a shaker, swung like a lazy shuffle
 *
 * @typedef {'keys' | 'bass' | 'melody' | 'kick' | 'snare' | 'shaker'} Voice
 * @typedef {{ voice: Voice, beat: number, length: number, note: number, velocity: number }}
 *   NoteEvent beat: from the start of the bar (swing not applied yet, see swingBeat);
 *   length: beats; note: MIDI note number (60 = middle C; drums ignore it); velocity: 0..1.
 * @typedef {{ bpm: number, key: number, chords: number[], bars: NoteEvent[][] }} Song key:
 *   MIDI note of the key's root; chords: each bar's chord, as a scale degree (0 = I); bars:
 *   each bar's notes.
 */

export const BEATS_PER_BAR = 4;
/** How far after the beat an off-beat eighth note lands (0.5 = straight, 0.67 = triplets). */
export const SWING = 0.6;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** The major pentatonic, as degrees of the major scale (1, 2, 3, 5 and 6). */
const PENTATONIC = [0, 1, 2, 4, 5];
/** Keys the songs take turns in (MIDI roots: F, D, Bb, G, Eb, A), all comfy for the ranges. */
const KEYS = [53, 50, 46, 55, 51, 57];
/** Chord progressions, as scale degrees (0 = I, 5 = vi...): four bars each. */
const PROGRESSIONS = [
  [0, 5, 3, 4], // I vi IV V: the classic
  [0, 2, 3, 4], // I iii IV V
  [3, 2, 1, 4], // IV iii ii V
  [0, 5, 1, 4], // I vi ii V
  [3, 4, 2, 5], // IV V iii vi
  [5, 3, 0, 4], // vi IV I V
  [3, 0, 1, 4], // IV I ii V
];
/** Where each part's notes sit (MIDI): keys in the middle, the tune above, bass below. */
export const RANGES = { keys: [50, 68], melody: [67, 86], bass: [36, 52] };
/** The tune's rhythms: two bars of eighth notes, 1 = a note starts here. */
const RHYTHMS = [
  [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  [1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
  [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  [1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0],
];
/** How the keys play each bar's chord: when each hit starts and how long it rings (beats). */
const COMPING = [
  [[0, 4]], // one long chord
  [
    [0, 1.5],
    [1.5, 2.5],
  ], // on the beat, then just before beat 3
  [
    [0, 2],
    [2.5, 1.5],
  ],
  [
    [0, 1],
    [1.5, 1],
    [3, 1],
  ],
];

/**
 * Writes song number `index` (any whole number; the same one is always the same song).
 *
 * @param {number} index
 * @returns {Song}
 */
export function composeSong(index) {
  const random = createRandom(1000 + index * 7919);
  const pick = (/** @type {any[]} */ list) => list[Math.floor(random() * list.length)];
  const key = KEYS[((index % KEYS.length) + KEYS.length) % KEYS.length];
  const bpm = 80 + Math.floor(random() * 13); // 80..92: easygoing
  const verse = pick(PROGRESSIONS);
  let middle = pick(PROGRESSIONS);
  if (middle === verse) middle = PROGRESSIONS[(PROGRESSIONS.indexOf(verse) + 3) % 7];
  const sections = [
    { chords: verse, bars: 4, tune: null, drums: false, comp: COMPING[0] },
    { chords: verse, bars: 8, tune: 'tune', drums: true, comp: pick(COMPING.slice(1)) },
    { chords: middle, bars: 8, tune: 'high', drums: true, comp: pick(COMPING.slice(1)) },
    { chords: verse, bars: 8, tune: 'tune', drums: true, comp: pick(COMPING.slice(1)) },
    { chords: verse, bars: 4, tune: null, drums: false, comp: COMPING[0] },
  ];

  /** @type {number[]} */
  const roots = sections.flatMap((section) =>
    Array.from({ length: section.bars }, (_, bar) => section.chords[bar % 4]),
  );
  /** @type {NoteEvent[][]} */
  const bars = roots.map(() => []);
  let voicing = voiceChord(chordNotes(key, roots[0]), null);
  const tuneRhythm = pick(RHYTHMS);
  const highRhythm = pick(RHYTHMS);
  let first = 0;
  for (const section of sections) {
    for (let bar = first; bar < first + section.bars; bar++) {
      const chord = chordNotes(key, roots[bar]);
      voicing = voiceChord(chord, voicing);
      const nextRoot = roots[bar + 1] ?? roots[0];
      for (const [beat, length] of section.comp) {
        voicing.forEach((note, i) => {
          // A long chord is rolled, bottom note first, like a hand on the keys.
          const roll = section.comp.length === 1 ? i * 0.06 : 0;
          const velocity = 0.55 + random() * 0.15 - (beat > 0 ? 0.1 : 0);
          bars[bar].push({ voice: 'keys', beat: beat + roll, length, note, velocity });
        });
      }
      bars[bar].push(...bassBar(key, roots[bar], nextRoot, random));
      if (section.drums) bars[bar].push(...drumBar(random));
    }
    if (section.tune) {
      // Two-bar phrases, each asked then answered: the answer has the same rhythm and
      // comes home to the root.
      const rhythm = section.tune === 'high' ? highRhythm : tuneRhythm;
      const lift = section.tune === 'high' ? 3 : 0;
      for (let bar = first; bar < first + section.bars; bar += 2) {
        const answer = (bar - first) % 4 === 2;
        const chords = [chordNotes(key, roots[bar]), chordNotes(key, roots[bar + 1])];
        const notes = phrase(key, rhythm, chords, { lift, answer, random });
        for (const note of notes) {
          const target = note.beat < BEATS_PER_BAR ? bar : bar + 1;
          bars[target].push({ ...note, beat: note.beat % BEATS_PER_BAR });
        }
      }
    }
    first += section.bars;
  }
  return { bpm, key, chords: roots, bars };
}

/**
 * The four notes of the key's seventh chord on a scale degree, as pitch classes (MIDI
 * numbers in the octave above the key's root).
 *
 * @param {number} key MIDI root of the key.
 * @param {number} degree 0 = I, 1 = ii...
 */
export function chordNotes(key, degree) {
  return [0, 2, 4, 6].map((step) => key + scaleStep(degree + step));
}

/**
 * Semitones above the key's root of a major-scale degree (any whole number: 7 is the
 * octave, -1 the note below the root).
 *
 * @param {number} degree
 */
export function scaleStep(degree) {
  const octave = Math.floor(degree / 7);
  return MAJOR[degree - octave * 7] + 12 * octave;
}

/**
 * Picks octaves for a chord's notes within the keys' range, as close as possible to the
 * last chord (so the hands barely move): every inversion is tried.
 *
 * @param {number[]} chord Its notes, any octave.
 * @param {number[] | null} previous The last voicing, low to high.
 * @returns {number[]} Low to high.
 */
export function voiceChord(chord, previous) {
  const [low, high] = RANGES.keys;
  const middle = previous ? previous.reduce((a, b) => a + b) / previous.length : (low + high) / 2;
  let best = chord;
  let bestCost = Infinity;
  for (let inversion = 0; inversion < chord.length; inversion++) {
    // Stack the notes upward from the inversion's bottom note...
    const stack = [];
    let last = -Infinity;
    for (let i = 0; i < chord.length; i++) {
      let note = chord[(inversion + i) % chord.length];
      while (note <= last) note += 12;
      stack.push(note);
      last = note;
    }
    // ...then try it in each octave that fits.
    for (let shift = -48; shift <= 48; shift += 12) {
      const voicing = stack.map((note) => note + shift);
      if (voicing[0] < low || voicing[voicing.length - 1] > high) continue;
      const cost = previous
        ? voicing.reduce((sum, note, i) => sum + Math.abs(note - previous[i]), 0)
        : Math.abs(voicing.reduce((a, b) => a + b) / voicing.length - middle);
      if (cost < bestCost) {
        best = voicing;
        bestCost = cost;
      }
    }
  }
  return best;
}

/**
 * Two bars of the tune.
 *
 * @param {number} key
 * @param {number[]} rhythm 16 eighth-note slots, 1 = a note starts.
 * @param {number[][]} chords The two bars' chords (see chordNotes).
 * @param {{ lift: number, answer: boolean, random: () => number }} options lift: scale
 *   steps higher; answer: end on the root.
 * @returns {NoteEvent[]} Beats count from the start of the first bar.
 */
function phrase(key, rhythm, chords, { lift, answer, random }) {
  const [low, high] = RANGES.melody;
  const onsets = rhythm.flatMap((on, slot) => (on ? [slot] : []));
  /** Pentatonic notes, plus the chord's own, in the tune's range. */
  const notesFor = (/** @type {number[]} */ chord) => {
    const pitchClasses = new Set([
      ...PENTATONIC.map((degree) => (key + scaleStep(degree)) % 12),
      ...chord.map((note) => note % 12),
    ]);
    const notes = [];
    for (let note = low; note <= high; note++) if (pitchClasses.has(note % 12)) notes.push(note);
    return notes;
  };
  let current = key + 12 + scaleStep(4 + lift); // start round the fifth, an octave up
  /** @type {NoteEvent[]} */
  const events = [];
  onsets.forEach((slot, i) => {
    const chord = chords[slot < 8 ? 0 : 1];
    const choices = notesFor(chord);
    const strong = slot % 4 === 0; // beats 1 and 3
    const last = i === onsets.length - 1;
    let target;
    if (last && answer) {
      target = nearest(
        choices.filter((note) => note % 12 === key % 12),
        current,
      );
    } else if (strong || last) {
      const chordTones = choices.filter((note) => chord.some((c) => c % 12 === note % 12));
      target = nearest(chordTones, current + Math.round((random() - 0.5) * 6));
    } else {
      // Step up or down the pentatonic, mostly by one note, now and then by two.
      const index = nearestIndex(choices, current);
      const step = (random() < 0.5 ? -1 : 1) * (random() < 0.75 ? 1 : 2);
      target = choices[Math.min(choices.length - 1, Math.max(0, index + step))];
    }
    current = target;
    const next = onsets[i + 1] ?? 16;
    const length = Math.min(last ? 3 : 2, (next - slot) * 0.5) * 0.9;
    const velocity = (strong ? 0.8 : 0.65) + random() * 0.15;
    events.push({ voice: 'melody', beat: slot * 0.5, length, note: target, velocity });
  });
  return events;
}

/**
 * A bar of bass: the root, its fifth, and a note leading into the next chord's root.
 *
 * @param {number} key
 * @param {number} degree This bar's chord.
 * @param {number} nextDegree The next bar's.
 * @param {() => number} random
 * @returns {NoteEvent[]}
 */
function bassBar(key, degree, nextDegree, random) {
  const [low, high] = RANGES.bass;
  const place = (/** @type {number} */ note) => {
    let placed = note;
    while (placed > high) placed -= 12;
    while (placed < low) placed += 12;
    return placed;
  };
  const root = place(key + scaleStep(degree));
  const fifth = place(key + scaleStep(degree + 4));
  const nextRoot = place(key + scaleStep(nextDegree));
  // The note of the key just below the next root (or just above, if it's lower).
  const leading = place(key + scaleStep(nextDegree + (nextRoot > root ? -1 : 1)));
  const events = [
    { voice: /** @type {const} */ ('bass'), beat: 0, length: 1.4, note: root, velocity: 0.9 },
    { voice: /** @type {const} */ ('bass'), beat: 1.5, length: 0.4, note: root, velocity: 0.6 },
    { voice: /** @type {const} */ ('bass'), beat: 2, length: 1.3, note: fifth, velocity: 0.75 },
  ];
  if (random() < 0.6) {
    events.push({ voice: 'bass', beat: 3.5, length: 0.45, note: leading, velocity: 0.6 });
  }
  return events;
}

/**
 * A bar of soft drums: kick on 1 and 3 (sometimes a nudge before 3), brushed snare on 2 and
 * 4, a shaker on every eighth.
 *
 * @param {() => number} random
 * @returns {NoteEvent[]}
 */
function drumBar(random) {
  /** @type {NoteEvent[]} */
  const events = [
    { voice: 'kick', beat: 0, length: 0.5, note: 0, velocity: 0.9 },
    { voice: 'kick', beat: 2, length: 0.5, note: 0, velocity: 0.75 },
    { voice: 'snare', beat: 1, length: 0.5, note: 0, velocity: 0.7 },
    { voice: 'snare', beat: 3, length: 0.5, note: 0, velocity: 0.75 },
  ];
  if (random() < 0.35)
    events.push({ voice: 'kick', beat: 1.5, length: 0.5, note: 0, velocity: 0.5 });
  for (let slot = 0; slot < 8; slot++) {
    const velocity = (slot % 2 === 0 ? 0.6 : 0.4) + random() * 0.15;
    events.push({ voice: 'shaker', beat: slot * 0.5, length: 0.25, note: 0, velocity });
  }
  return events;
}

/**
 * Swings a beat: off-beat eighth notes land a little late (SWING), like a lazy shuffle.
 *
 * @param {number} beat
 * @param {number} [swing]
 */
export function swingBeat(beat, swing = SWING) {
  const whole = Math.floor(beat);
  const part = beat - whole;
  if (part <= 0.5) return whole + part * (swing / 0.5);
  return whole + swing + (part - 0.5) * ((1 - swing) / 0.5);
}

/**
 * @param {number} note MIDI note number.
 * @returns {number} Hz (A4, note 69, is 440 Hz).
 */
export function noteFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

/** @param {number[]} notes @param {number} near */
function nearest(notes, near) {
  return notes[nearestIndex(notes, near)];
}

/** @param {number[]} notes @param {number} near */
function nearestIndex(notes, near) {
  let best = 0;
  for (let i = 1; i < notes.length; i++) {
    if (Math.abs(notes[i] - near) < Math.abs(notes[best] - near)) best = i;
  }
  return best;
}
