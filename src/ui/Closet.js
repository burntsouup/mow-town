import { ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import { cycleStyle, pickColor, randomOutfit, SLOTS, styleName } from '../player/wardrobe.js';
import './closet.css';

/**
 * @typedef {import('../player/wardrobe.js').Outfit} Outfit
 * @typedef {import('../player/wardrobe.js').Slot} Slot
 */

/**
 * The closet: a panel for dressing Tuft up, and a camera that circles Tuft while you do
 * (drag to turn round, scroll to zoom). Opened from the start screen, or at the coat stand
 * by the front door. Every change shows on Tuft straight away.
 */
export class Closet {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {HTMLElement} root Where the panel goes (the HUD).
   * @param {{ change: (outfit: Outfit) => void, done: () => void }} on change: the outfit
   *   changed; done: the player is finished dressing.
   */
  constructor(scene, root, on) {
    this.scene = scene;
    this.on = on;
    const view = config.closet.camera;
    this.camera = new ArcRotateCamera(
      'closetCamera',
      0,
      view.height,
      view.distance,
      new Vector3(),
      scene,
    );
    this.camera.minZ = 0.05;
    this.camera.panningSensibility = 0; // turn and zoom only
    this.camera.lowerRadiusLimit = view.near;
    this.camera.upperRadiusLimit = view.far;
    this.camera.lowerBetaLimit = 0.5;
    this.camera.upperBetaLimit = 1.62; // not below the ground
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    /** @type {import('@babylonjs/core').Camera | null} */
    this.previousCamera = null;
    /** @type {Outfit | null} */
    this.outfit = null;

    this.panel = document.createElement('div');
    this.panel.className = 'closet';
    this.panel.hidden = true;
    this.panel.innerHTML = `
      <h2>Dress up</h2>
      <p class="closet-hint">Drag to turn Tuft round, scroll to zoom</p>`;
    this.rows = SLOTS.map((slot) => this.buildRow(slot));
    // The slots scroll if the window is short; the buttons stay put underneath.
    const slots = document.createElement('div');
    slots.className = 'closet-slots';
    slots.append(...this.rows.map((row) => row.element));
    const actions = document.createElement('div');
    actions.className = 'closet-actions';
    const surprise = button('Surprise me', 'closet-button');
    surprise.addEventListener('click', () => this.change(randomOutfit(Math.random)));
    const done = button('Done', 'closet-button is-primary');
    done.addEventListener('click', () => this.finish());
    actions.append(surprise, done);
    this.panel.append(slots, actions);
    root.append(this.panel);

    window.addEventListener('keydown', (event) => {
      if (this.isOpen && event.code === 'Escape') this.finish();
    });
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  /**
   * @param {Outfit} outfit What Tuft's wearing now.
   * @param {Vector3} feet Where Tuft stands.
   * @param {number} yaw Which way Tuft faces (the camera starts out in front).
   */
  open(outfit, feet, yaw) {
    const view = config.closet.camera;
    this.outfit = outfit;
    for (const row of this.rows) row.update();
    const { camera } = this;
    camera.target = feet.add(new Vector3(0, 0.62, 0));
    // An ArcRotateCamera sits at alpha round from +x (toward +z), so this is in front of Tuft,
    // turned a little to one side.
    camera.alpha = Math.PI / 2 - (yaw + view.turn);
    camera.beta = view.height;
    camera.radius = view.distance;
    camera.targetScreenOffset.x = -view.shift; // Tuft to the left, clear of the panel
    this.previousCamera = this.scene.activeCamera;
    this.scene.activeCamera = camera;
    camera.attachControl(true);
    this.panel.hidden = false;
  }

  close() {
    if (!this.isOpen) return;
    this.panel.hidden = true;
    this.camera.detachControl();
    if (this.previousCamera) this.scene.activeCamera = this.previousCamera;
  }

  finish() {
    this.close();
    this.on.done();
  }

  /** @param {Outfit} outfit */
  change(outfit) {
    this.outfit = outfit;
    for (const row of this.rows) row.update();
    this.on.change(outfit);
  }

  /**
   * One slot's row: arrows to step through its styles, and color swatches.
   *
   * @param {Slot} slot
   */
  buildRow(slot) {
    const element = document.createElement('div');
    element.className = 'closet-slot';
    const head = document.createElement('div');
    head.className = 'closet-slot-head';
    const name = document.createElement('span');
    name.className = 'closet-slot-name';
    name.textContent = slot.name;
    const style = document.createElement('span');
    style.className = 'closet-style';
    const [previous, next] = [-1, 1].map((step) => {
      const arrow = button(step < 0 ? '‹' : '›', 'closet-arrow');
      arrow.setAttribute('aria-label', `${step < 0 ? 'Previous' : 'Next'} ${slot.name}`);
      arrow.addEventListener('click', () => {
        if (this.outfit) this.change(cycleStyle(this.outfit, slot.id, step));
      });
      // Only one style (fur): nothing to step through.
      arrow.hidden = slot.styles.length < 2;
      return arrow;
    });
    head.append(name, previous, style, next);
    const swatches = document.createElement('div');
    swatches.className = 'closet-swatches';
    const buttons = slot.colors.map((color) => {
      const swatch = button('', 'closet-swatch');
      swatch.style.background = color.swatch;
      swatch.title = color.name;
      swatch.setAttribute('aria-label', `${slot.name}: ${color.name}`);
      swatch.addEventListener('click', () => {
        if (this.outfit) this.change(pickColor(this.outfit, slot.id, color.id));
      });
      swatches.append(swatch);
      return swatch;
    });
    element.append(head, swatches);
    const update = () => {
      if (!this.outfit) return;
      const worn = this.outfit[slot.id];
      const color = slot.colors.find((c) => c.id === worn.color);
      style.textContent =
        slot.styles.length < 2 ? (color?.name ?? '') : styleName(this.outfit, slot.id);
      swatches.hidden = worn.style === 'none';
      slot.colors.forEach((c, i) => buttons[i].classList.toggle('is-picked', c.id === worn.color));
    };
    return { element, update };
  }
}

/**
 * @param {string} text
 * @param {string} className
 */
function button(text, className) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  return element;
}
