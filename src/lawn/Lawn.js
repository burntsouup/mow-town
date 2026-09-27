import { config } from '../config.js';
import { DeckCutter } from './DeckCutter.js';
import { GrassField } from './GrassField.js';
import { GrassGrid, MOWED_TOLERANCE } from './GrassGrid.js';

/**
 * The mowable lawn: its grass data (GrassGrid), how it's drawn (GrassField), and the cutter
 * that turns deck movement into cut grass. Takes world positions and converts them.
 */
export class Lawn {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {{ center: number[], width: number, depth: number,
   *   heightAt: (x: number, z: number) => number,
   *   densityAt?: (x: number, z: number) => number }} area From the level.
   */
  constructor(scene, area) {
    this.grid = new GrassGrid({
      width: area.width,
      depth: area.depth,
      texelsPerMeter: config.grass.texelsPerMeter,
      targetHeight: config.grass.cutHeight,
    });
    this.grid.fill(area.heightAt, area.densityAt);
    this.field = new GrassField(scene, this.grid, area);
    this.cutter = new DeckCutter(this.grid);
    // Anything taller than this in the grass map (half a byte of slack) still needs mowing.
    this.field.plugin.uncutAbove = config.grass.cutHeight + MOWED_TOLERANCE + 0.5 / 255;
    this.finishing = false;
  }

  /** @param {number} amount 0..1: how strongly to highlight grass that still needs mowing. */
  setHighlight(amount) {
    this.field.plugin.highlight = amount;
  }

  /** The job is done: over the next moment, whatever is left shrinks down as if mowed. */
  finish() {
    this.finishing = true;
  }

  /** Grows all the grass back, ready to mow again. */
  reset() {
    this.grid.reset();
    this.cutter.lift();
    this.finishing = false;
  }

  /** Fraction of the lawn mowed (weighted), 0..1. */
  get progress() {
    return this.grid.progress;
  }

  /**
   * Cuts under a deck that moved from one world pose to another during this frame.
   *
   * @param {number} dt
   * @param {{ x: number, z: number, yaw: number }} from
   * @param {{ x: number, z: number, yaw: number }} to
   * @returns {number} Grass cut this frame (see GrassGrid.cutDeck).
   */
  cut(dt, from, to) {
    return this.cutter.update(
      dt,
      { ...this.field.toLocal(from.x, from.z), yaw: from.yaw },
      { ...this.field.toLocal(to.x, to.z), yaw: to.yaw },
      config.mower.deck,
      config.grass.cutHeight,
    );
  }

  /**
   * How hard the grass just ahead of a deck is to push through (see GrassGrid.workAhead).
   *
   * @param {{ x: number, z: number, yaw: number }} pose World pose.
   */
  workAhead(pose) {
    const local = { ...this.field.toLocal(pose.x, pose.z), yaw: pose.yaw };
    return this.grid.workAhead(local, config.mower.deck, config.grass.cutHeight);
  }

  /** The deck stopped cutting: the next cut starts a new stroke. */
  lift() {
    this.cutter.lift();
  }

  /**
   * Call once per frame, after cutting: finishes off leftovers and sends changes to the GPU.
   *
   * @param {number} dt
   */
  update(dt) {
    if (this.finishing) {
      this.finishing = this.grid.shrinkRemaining(dt / config.job.finishFadeTime);
    }
    this.field.update();
  }
}
