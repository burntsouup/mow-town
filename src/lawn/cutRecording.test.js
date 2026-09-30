import { describe, expect, it } from 'vitest';
import { createRandom } from '../math/noise.js';
import { CutRecording, replaySpeed, replayStep, STEPS_PER_SECOND } from './cutRecording.js';
import { DeckCutter } from './DeckCutter.js';
import { GrassGrid } from './GrassGrid.js';
import { TrimCutter } from './TrimCutter.js';

const DECK = { width: 0.5, length: 0.4 };
const CUT = 0.3;
const SIZE = { width: 6, depth: 4 };

function lawn() {
  const grid = new GrassGrid({ ...SIZE, texelsPerMeter: 16, targetHeight: CUT });
  grid.fill(
    (x, z) => (Math.hypot(x - 3, z - 2) < 0.4 ? 0 : 0.8 + 0.2 * Math.sin(x * 3 + z)), // a bed
    (x) => 1 + x / 6,
  );
  grid.markEdges(0.25);
  return grid;
}

/** Everything about a grid that cutting changes, to compare two of them. */
function state(/** @type {GrassGrid} */ grid) {
  const { height, mowX, mowZ, crossX, crossZ } = grid;
  return {
    arrays: [height, mowX, mowZ, crossX, crossZ].map((array) => Array.from(array)),
    progress: grid.progress,
    edges: grid.edgeProgress,
    crossed: grid.crossProgress,
  };
}

describe('CutRecording', () => {
  it('replays a whole mow (mower, trimmer, finishing) into exactly the same lawn', () => {
    const live = lawn();
    const recording = new CutRecording(SIZE);
    const deck = new DeckCutter(live, recording);
    const trimmer = new TrimCutter(live, recording);
    const random = createRandom(5);
    // Wobbly passes up and down at uneven frame rates, then across, then some trimming.
    let pose = { x: 0.3, z: -0.5, yaw: 0 };
    for (let frame = 0; frame < 900; frame++) {
      const dt = 1 / 50 + random() * 0.02;
      const yaw = frame < 600 ? (Math.floor(frame / 60) % 2 ? Math.PI : 0) : Math.PI / 2;
      const next = {
        x: frame < 600 ? 0.3 + Math.floor(frame / 60) * 0.45 : (frame - 600) * 0.02,
        z: frame < 600 ? pose.z + Math.cos(yaw) * 1.5 * dt : 2 + Math.sin(frame * 0.1),
        yaw: yaw + (random() - 0.5) * 0.1,
      };
      if (frame % 60 === 0 || frame === 600) deck.lift(); // a fresh stroke at each turn
      deck.update(dt, pose, next, DECK, CUT);
      pose = next;
    }
    for (let frame = 0; frame < 200; frame++) {
      const a = frame * 0.03;
      trimmer.update(1 / 60, { x: a, z: 0.1 }, { x: a + 0.03, z: 0.1 }, 0.17, CUT);
    }
    live.shrinkRemaining(Infinity, { inner: true, edges: false });
    recording.addFinish({ inner: true, edges: false });
    expect(recording.canReplay).toBe(true);

    const replayed = lawn();
    for (const step of recording.steps) replayStep(replayed, step);
    expect(state(replayed)).toEqual(state(live));
    expect(live.crossProgress).toBeGreaterThan(0); // the test did cross its stripes
  });

  it('skips ticks where nothing moved, and ticks nowhere near the lawn', () => {
    const recording = new CutRecording(SIZE);
    const deck = new DeckCutter(lawn(), recording);
    const still = { x: 1, z: 1, yaw: 0 };
    deck.update(1, still, still, DECK, CUT); // a second of standing still: one step
    expect(recording.steps.length).toBe(1);
    const far = { x: 40, z: 1, yaw: 0 };
    deck.lift();
    deck.update(1, far, { ...far, x: 41 }, DECK, CUT);
    expect(recording.steps.length).toBe(1);
    // Right at the edge still counts: the deck reaches onto the lawn.
    deck.lift();
    deck.update(1 / 60, { x: -1.2, z: 1, yaw: 0 }, { x: -1.2, z: 1.1, yaw: 0 }, DECK, CUT);
    expect(recording.steps.length).toBe(2);
    expect(recording.seconds).toBeCloseTo(2 / STEPS_PER_SECOND);
  });

  it('keeps who was trimming, for the replay to show', () => {
    const recording = new CutRecording(SIZE);
    const trimmer = new TrimCutter(lawn(), recording);
    recording.actors = { player: { x: 5, z: 6, yaw: 1 }, mower: null };
    trimmer.update(1 / 60, { x: 1, z: 1 }, { x: 1.1, z: 1 }, 0.17, CUT);
    const [step] = recording.steps;
    expect(step.kind === 'trim' && step.actors?.player.x).toBe(5);
  });

  it("starts afresh when cleared, and can't replay a lawn it didn't see being mowed", () => {
    const recording = new CutRecording(SIZE);
    recording.addFinish({ inner: true, edges: true });
    expect(recording.canReplay).toBe(true);
    recording.spoil();
    expect(recording.canReplay).toBe(false);
    recording.addFinish({ inner: true, edges: true });
    expect(recording.canReplay).toBe(false); // still missing how it got that way
    recording.clear();
    expect(recording.canReplay).toBe(false); // nothing to replay yet
    recording.addFinish({ inner: true, edges: true });
    expect(recording.canReplay).toBe(true);
  });
});

describe('replaySpeed', () => {
  const settings = { duration: 10, minSpeed: 4, maxSpeed: 40 };

  it('fits the replay into about the same time, within limits', () => {
    expect(replaySpeed(200, settings)).toBe(20); // 200 s of mowing in 10 s
    expect(replaySpeed(10, settings)).toBe(4); // a quick job isn't a blur
    expect(replaySpeed(1000, settings)).toBe(40); // a long one isn't a crawl
  });
});

describe('GrassGrid.snapshot and restore', () => {
  it('puts a lawn back exactly, after it grew back or was cut some more', () => {
    const grid = lawn();
    grid.cutStroke({ x: 1, z: 0, yaw: 0 }, { x: 1, z: 4, yaw: 0 }, DECK, CUT);
    grid.cutStroke({ x: 0, z: 1, yaw: Math.PI / 2 }, { x: 6, z: 1, yaw: Math.PI / 2 }, DECK, CUT);
    const before = state(grid);
    const snapshot = grid.snapshot();
    grid.reset();
    grid.cutDeck({ x: 4, z: 3, yaw: 1 }, DECK, CUT);
    grid.takeChangedRect();
    grid.restore(snapshot);
    expect(state(grid)).toEqual(before);
    expect(grid.takeChangedRect()).toEqual(grid.fullRect()); // it all gets redrawn
  });
});
