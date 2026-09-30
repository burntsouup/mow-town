import { stripeViewAngle } from '../camera/revealMath.js';
import { config } from '../config.js';
import { DeckCutter } from './DeckCutter.js';
import { GrassField } from './GrassField.js';
import { GrassGrid, MOWED_TOLERANCE } from './GrassGrid.js';
import { stripeAxes } from './patterns.js';
import { TrimCutter } from './TrimCutter.js';

/**
 * The mowable lawn: its grass data (GrassGrid), how it's drawn (GrassField), and the cutter
 * that turns deck movement into cut grass. Takes world positions and converts them.
 */
export class Lawn {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {{ center: number[], width: number, depth: number,
   *   heightAt: (x: number, z: number) => number,
   *   densityAt?: (x: number, z: number) => number,
   *   edgeAt?: (x: number, z: number) => boolean, revealScale?: number }} area From the
   *   level (see GrassGrid.fill and GrassGrid.markEdges); revealScale: how much further out
   *   the aerial view goes for this lawn (1 = the front lawn's view).
   */
  constructor(scene, area) {
    this.center = { x: area.center[0], z: area.center[1] };
    this.revealScale = area.revealScale ?? 1;
    this.grid = new GrassGrid({
      width: area.width,
      depth: area.depth,
      texelsPerMeter: config.grass.texelsPerMeter,
      targetHeight: config.grass.cutHeight,
      crossLean: config.grass.crossLean,
    });
    this.grid.fill(area.heightAt, area.densityAt);
    this.grid.markEdges(config.job.edgeWidth, area.edgeAt);
    this.field = new GrassField(scene, this.grid, area);
    this.cutter = new DeckCutter(this.grid);
    this.trimCutter = new TrimCutter(this.grid);
    // Anything taller than this in the grass map (half a byte of slack) still needs mowing.
    this.field.state.uncutAbove = config.grass.cutHeight + MOWED_TOLERANCE + 0.5 / 255;
    /** Which leftovers are shrinking away: the lawn away from the edges, and the edges. */
    this.finishing = { inner: false, edges: false };
  }

  /** @param {number} amount 0..1: how strongly to highlight grass that still needs mowing. */
  setHighlight(amount) {
    this.field.state.highlight = amount;
  }

  /**
   * The job is done: over the next moment, whatever is left shrinks down as if mowed, except
   * along the edges (that's the string trimmer's job, see finishEdges).
   */
  finish() {
    this.finishing.inner = true;
  }

  /** The edges are done: the last bits along them shrink away too. */
  finishEdges() {
    this.finishing.edges = true;
  }

  /**
   * How tall the grass is at a world spot, or 0 off the lawn (what's underfoot).
   *
   * @param {number} x
   * @param {number} z
   */
  grassAt(x, z) {
    const local = this.field.toLocal(x, z);
    return this.grid.grassAt(local.x, local.z);
  }

  /** Mows the whole lawn at once (a job you'd already finished, on a later visit). */
  mowAll() {
    this.grid.shrinkRemaining(Infinity);
  }

  /**
   * Draws real blades of grass round a spot near you (see GrassBlades), or none.
   *
   * @param {{ x: number, z: number } | null} spot World meters.
   */
  follow(spot) {
    this.field.blades.follow(spot);
  }

  /** Grows all the grass back, ready to mow again. */
  reset() {
    this.grid.reset();
    this.cutter.lift();
    this.trimCutter.lift();
    this.finishing = { inner: false, edges: false };
  }

  /** Fraction of the lawn mowed (weighted), 0..1. */
  get progress() {
    return this.grid.progress;
  }

  /** Fraction of the edges cut (weighted), 0..1. */
  get edgeProgress() {
    return this.grid.edgeProgress;
  }

  /** Fraction of the lawn mowed across an earlier pass (a checkerboard's second half). */
  get crossProgress() {
    return this.grid.crossProgress;
  }

  /** Which way the aerial view should look from, to show off the stripes (radians). */
  get revealAngle() {
    return stripeViewAngle(stripeAxes(this.grid), config.job.reveal.maxTurn);
  }

  /**
   * Cuts under a deck that moved from one world pose to another during this frame.
   *
   * @param {number} dt
   * @param {{ x: number, z: number, yaw: number }} from
   * @param {{ x: number, z: number, yaw: number }} to
   * @param {import('./GrassGrid.js').Deck} deck
   * @returns {number} Grass cut this frame (see GrassGrid.cutDeck).
   */
  cut(dt, from, to, deck) {
    return this.cutter.update(
      dt,
      { ...this.field.toLocal(from.x, from.z), yaw: from.yaw },
      { ...this.field.toLocal(to.x, to.z), yaw: to.yaw },
      deck,
      config.grass.cutHeight,
    );
  }

  /**
   * How hard the grass just ahead of a deck is to push through (see GrassGrid.workAhead).
   *
   * @param {{ x: number, z: number, yaw: number }} pose World pose.
   * @param {import('./GrassGrid.js').Deck} deck
   */
  workAhead(pose, deck) {
    const local = { ...this.field.toLocal(pose.x, pose.z), yaw: pose.yaw };
    return this.grid.workAhead(local, deck, config.grass.cutHeight);
  }

  /** The deck stopped cutting: the next cut starts a new stroke. */
  lift() {
    this.cutter.lift();
  }

  /**
   * Cuts under the string trimmer's head as it moved during this frame.
   *
   * @param {number} dt
   * @param {{ x: number, z: number }} from World position at the start of the frame.
   * @param {{ x: number, z: number }} to World position at the end of the frame.
   * @returns {number} Grass cut this frame (see GrassGrid.cutDeck).
   */
  trim(dt, from, to) {
    return this.trimCutter.update(
      dt,
      this.field.toLocal(from.x, from.z),
      this.field.toLocal(to.x, to.z),
      config.trimmer.radius,
      config.grass.cutHeight,
    );
  }

  /** The trimmer's line stopped: the next cut starts a new sweep. */
  liftTrimmer() {
    this.trimCutter.lift();
  }

  /**
   * Call once per frame, after cutting: finishes off leftovers and sends changes to the GPU.
   *
   * @param {number} dt
   */
  update(dt) {
    const { inner, edges } = this.finishing;
    if (inner || edges) {
      const left = this.grid.shrinkRemaining(dt / config.job.finishFadeTime, this.finishing);
      if (!left) this.finishing = { inner: false, edges: false };
    }
    this.field.update(dt);
  }
}
