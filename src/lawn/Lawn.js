import { config } from '../config.js';
import { DeckCutter } from './DeckCutter.js';
import { GrassField } from './GrassField.js';
import { GrassGrid } from './GrassGrid.js';

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

  /** The deck stopped cutting: the next cut starts a new stroke. */
  lift() {
    this.cutter.lift();
  }

  /** Call once per frame, after cutting: sends changed grass to the GPU. */
  update() {
    this.field.update();
  }
}
