import { ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { config } from '../config.js';
import { applyMatrix, cssFilter, lookMatrix, LOOKS } from './looks.js';
import { fileName, postcardCaption, postcardLayout } from './postcard.js';
import './photo.css';

/** The HUD's rounded letters, for the postcard's writing. */
const FONT = `ui-rounded, 'SF Pro Rounded', Nunito, 'Segoe UI', system-ui, sans-serif`;
const CARD = '#fffaf0';
const INK = '#3b2f25';
const GREEN = '#4fae4a';

/**
 * @typedef {{ place: string | null, pattern: string, patternId: string,
 *   score: number | null, progress: number }} PhotoInfo What the postcard says (see
 *   postcardCaption); patternId picks the stamp's picture.
 */

/**
 * Photo mode (P): the game pauses, a free camera takes over (drag to look round, scroll to
 * zoom, WASD to move, Q/E down and up), and a panel offers looks, a pose for Tuft, and
 * saving, copying or sharing a postcard, or recording the timelapse as a video.
 */
export class PhotoMode {
  /**
   * @param {import('@babylonjs/core').Scene} scene
   * @param {HTMLElement} root The HUD.
   * @param {{ info: () => PhotoInfo, pose: (on: boolean) => void, faceCamera: () => boolean,
   *   canRecord: () => boolean, record: () => void, shutter: () => void,
   *   done: () => void }} on info: what the postcard says; pose: Tuft holds a cheer, or
   *   stops; faceCamera: Tuft turns to the camera (false if he can't: holding a tool);
   *   canRecord / record: the timelapse clip; shutter: the click; done: back to playing.
   */
  constructor(scene, root, on) {
    this.scene = scene;
    this.root = root;
    this.on = on;
    this.canvas = /** @type {HTMLCanvasElement} */ (scene.getEngine().getRenderingCanvas());
    this.look = LOOKS[0];
    this.framed = true; // a postcard, rather than just the picture
    this.posing = false;
    this.messageTimer = 0;

    this.camera = new ArcRotateCamera('photoCamera', 0, 1, 6, new Vector3(), scene);
    this.camera.fov = config.camera.fov;
    this.camera.minZ = 0.05;
    this.camera.lowerRadiusLimit = 1;
    this.camera.upperRadiusLimit = 45;
    this.camera.lowerBetaLimit = 0.05;
    this.camera.upperBetaLimit = 1.58; // just past level: look along the grass
    this.camera.wheelDeltaPercentage = 0.02;
    this.camera.panningSensibility = 0; // WASD moves instead
    this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    /** @type {import('@babylonjs/core').Camera | null} */
    this.previousCamera = null;

    this.panel = this.buildPanel();
    this.setLook(this.look);
    this.flash = document.createElement('div');
    this.flash.className = 'photo-flash';
    this.flash.hidden = true;
    root.append(this.flash, this.panel);
    window.addEventListener('keydown', (event) => {
      if (!this.isOpen || event.repeat) return;
      if (event.code === 'Escape' || event.code === config.photo.key) this.finish();
    });
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  /**
   * @param {Vector3} target What to look at (Tuft).
   * @param {Vector3} from Where the camera starts (where the view was).
   */
  open(target, from) {
    const { camera } = this;
    camera.target = target.clone();
    camera.setPosition(from.clone());
    this.previousCamera = this.scene.activeCamera;
    this.scene.activeCamera = camera;
    camera.attachControl(true);
    this.panel.hidden = false;
    this.root.classList.add('is-photo');
    this.canvas.style.filter = cssFilter(this.look);
    this.recordButton.hidden = !this.on.canRecord();
    this.setPose(false);
  }

  close() {
    if (!this.isOpen) return;
    this.panel.hidden = true;
    this.root.classList.remove('is-photo');
    this.canvas.style.filter = 'none';
    this.camera.detachControl();
    if (this.previousCamera) this.scene.activeCamera = this.previousCamera;
    this.setPose(false);
  }

  finish() {
    this.close();
    this.on.done();
  }

  /**
   * Moves the camera round with the keys: WASD across the ground, Q/E down and up.
   *
   * @param {number} dt
   * @param {(code: string) => boolean} isDown
   */
  update(dt, isDown) {
    if (!this.isOpen) return;
    const { camera } = this;
    const forward = (isDown('KeyW') ? 1 : 0) - (isDown('KeyS') ? 1 : 0);
    const right = (isDown('KeyD') ? 1 : 0) - (isDown('KeyA') ? 1 : 0);
    const up = (isDown('KeyE') ? 1 : 0) - (isDown('KeyQ') ? 1 : 0);
    if (!forward && !right && !up) return;
    // The camera sits at (cos α, sin α) round its target, so it looks the other way.
    const lookX = -Math.cos(camera.alpha);
    const lookZ = -Math.sin(camera.alpha);
    const step = config.photo.moveSpeed * dt;
    const target = camera.target.clone();
    target.x += (lookX * forward + lookZ * right) * step;
    target.z += (lookZ * forward - lookX * right) * step;
    target.y = Math.min(8, Math.max(0.1, target.y + up * step));
    const limit = config.photo.range;
    target.x = Math.min(limit, Math.max(-limit, target.x));
    target.z = Math.min(limit, Math.max(-limit, target.z));
    camera.target = target;
  }

  buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'photo-panel';
    panel.hidden = true;
    const title = document.createElement('h2');
    title.textContent = 'Photo mode';
    const hint = document.createElement('p');
    hint.className = 'photo-hint';
    hint.textContent = 'Drag to look round · scroll to zoom · WASD to move · Q / E down and up';

    const looks = row('Look');
    this.lookButtons = LOOKS.map((look) => {
      const choice = button(look.name, 'photo-chip');
      choice.addEventListener('click', () => this.setLook(look));
      looks.append(choice);
      return choice;
    });

    const tuft = row('Tuft');
    this.poseButton = button('Ta-da!', 'photo-chip');
    this.poseButton.addEventListener('click', () => this.setPose(!this.posing));
    const face = button('Look here', 'photo-chip');
    face.addEventListener('click', () => {
      if (!this.on.faceCamera()) this.say('Let go of the mower (or put the trimmer away) first');
    });
    const frame = document.createElement('label');
    frame.className = 'photo-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.framed;
    box.addEventListener('change', () => (this.framed = box.checked));
    frame.append(box, ' Postcard frame');
    tuft.append(this.poseButton, face, frame);

    const actions = document.createElement('div');
    actions.className = 'photo-actions';
    const save = button('Save postcard', 'photo-button is-primary');
    save.addEventListener('click', () => this.save());
    const copy = button('Copy', 'photo-button');
    copy.addEventListener('click', () => this.copy());
    actions.append(save, copy);
    if (typeof navigator.share === 'function') {
      const share = button('Share…', 'photo-button');
      share.addEventListener('click', () => this.share());
      actions.append(share);
    }
    this.recordButton = button('Record timelapse video', 'photo-button');
    this.recordButton.addEventListener('click', () => {
      this.close();
      this.on.record();
    });
    const done = button('Done', 'photo-button');
    done.addEventListener('click', () => this.finish());
    actions.append(this.recordButton, done);

    this.message = document.createElement('p');
    this.message.className = 'photo-message';
    panel.append(title, hint, looks, tuft, actions, this.message);
    return panel;
  }

  /** @param {import('./looks.js').Look} look */
  setLook(look) {
    this.look = look;
    LOOKS.forEach((each, i) => this.lookButtons?.[i].classList.toggle('is-picked', each === look));
    if (this.isOpen) this.canvas.style.filter = cssFilter(look);
  }

  /** @param {boolean} on */
  setPose(on) {
    this.posing = on;
    this.poseButton?.classList.toggle('is-picked', on);
    this.on.pose(on);
  }

  /** @param {string} text A word of feedback under the buttons. */
  say(text) {
    this.message.textContent = text;
    window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => (this.message.textContent = ''), 3500);
  }

  async save() {
    const blob = await toBlob(this.takePicture(), 'image/jpeg', 0.92);
    download(blob, fileName(this.framed ? 'postcard' : 'photo', new Date(), 'jpg'));
    this.say('Saved to your downloads');
  }

  async copy() {
    try {
      const blob = await toBlob(this.takePicture(), 'image/png');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.say('Copied: paste it anywhere');
    } catch {
      this.say("This browser won't copy pictures: try Save instead");
    }
  }

  async share() {
    const blob = await toBlob(this.takePicture(), 'image/jpeg', 0.92);
    const file = new File([blob], fileName('postcard', new Date(), 'jpg'), { type: blob.type });
    const { line } = postcardCaption(this.on.info());
    try {
      if (navigator.canShare && !navigator.canShare({ files: [file] })) throw new Error('no');
      await navigator.share({ files: [file], title: 'mow-town', text: line });
    } catch (error) {
      if (/** @type {Error} */ (error).name !== 'AbortError') {
        this.say("Sharing pictures isn't available here: try Save instead");
      }
    }
  }

  /**
   * Takes the picture: a fresh frame, in the chosen look, framed as a postcard (or not),
   * with a flash and a click.
   */
  takePicture() {
    this.on.shutter();
    this.flash.hidden = false;
    this.flash.classList.remove('is-flashing');
    void this.flash.offsetWidth; // (restarts the animation)
    this.flash.classList.add('is-flashing');
    window.setTimeout(() => (this.flash.hidden = true), 600);
    const photo = this.photo();
    return this.framed ? this.postcard(photo) : photo;
  }

  /** The current view, at most 2400 pixels across, recolored by the look. */
  photo() {
    // Render now and copy at once: the canvas only holds its picture until the page redraws.
    this.scene.render();
    const scale = Math.min(1, config.photo.maxWidth / this.canvas.width);
    const width = Math.round(this.canvas.width * scale);
    const height = Math.round(this.canvas.height * scale);
    const picture = document.createElement('canvas');
    picture.width = width;
    picture.height = height;
    const context = /** @type {CanvasRenderingContext2D} */ (picture.getContext('2d'));
    context.drawImage(this.canvas, 0, 0, width, height);
    if (this.look.steps.length > 0) {
      const pixels = context.getImageData(0, 0, width, height);
      applyMatrix(pixels.data, lookMatrix(this.look));
      context.putImageData(pixels, 0, 0);
    }
    return picture;
  }

  /**
   * The picture as a postcard: a cream card, the picture with rounded corners, a greeting
   * and where it was taken, and a stamp of the lawn's pattern with a postmark.
   *
   * @param {HTMLCanvasElement} picture
   */
  postcard(picture) {
    const layout = postcardLayout(picture);
    const card = document.createElement('canvas');
    card.width = layout.width;
    card.height = layout.height;
    const context = /** @type {CanvasRenderingContext2D} */ (card.getContext('2d'));
    context.fillStyle = CARD;
    context.fillRect(0, 0, layout.width, layout.height);

    const { photo } = layout;
    context.save();
    roundedRect(context, photo.x, photo.y, photo.width, photo.height, layout.radius);
    context.clip();
    context.drawImage(picture, photo.x, photo.y);
    context.restore();
    context.lineWidth = Math.max(1, layout.border * 0.04);
    context.strokeStyle = 'rgb(59 47 37 / 0.12)';
    roundedRect(context, photo.x, photo.y, photo.width, photo.height, layout.radius);
    context.stroke();

    const info = this.on.info();
    const { title, line } = postcardCaption(info);
    const { caption } = layout;
    context.textBaseline = 'alphabetic';
    context.fillStyle = GREEN;
    context.font = `900 ${layout.titleSize}px ${FONT}`;
    const middle = caption.y + caption.height / 2;
    context.fillText(title, caption.x + layout.border * 0.2, middle - layout.lineSize * 0.15);
    context.fillStyle = INK;
    context.globalAlpha = 0.7;
    context.font = `700 ${layout.lineSize}px ${FONT}`;
    context.fillText(line, caption.x + layout.border * 0.2, middle + layout.lineSize * 1.15);
    context.globalAlpha = 1;
    drawStamp(context, layout.stamp, info.patternId);
    return card;
  }
}

/**
 * A postage stamp: a perforated edge round a little picture of the lawn's pattern, and a
 * wavy postmark over its corner.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {import('./postcard.js').Box} box
 * @param {string} pattern
 */
function drawStamp(context, { x, y, width, height }, pattern) {
  const hole = width * 0.045;
  context.fillStyle = '#ffffff';
  context.fillRect(x, y, width, height);
  // Perforations: bites out of every edge, in the card's color.
  context.fillStyle = CARD;
  for (let along = hole; along < width; along += hole * 2.6) {
    for (const edge of [y, y + height]) dot(context, x + along, edge, hole);
  }
  for (let along = hole; along < height; along += hole * 2.6) {
    for (const edge of [x, x + width]) dot(context, edge, y + along, hole);
  }
  // The picture: the pattern, in two greens.
  const inset = width * 0.12;
  const inner = {
    x: x + inset,
    y: y + inset,
    width: width - inset * 2,
    height: height - inset * 2,
  };
  context.save();
  context.beginPath();
  context.rect(inner.x, inner.y, inner.width, inner.height);
  context.clip();
  context.fillStyle = '#9fd66b';
  context.fillRect(inner.x, inner.y, inner.width, inner.height);
  context.fillStyle = '#4f9e3f';
  const band = inner.width / 4;
  if (pattern === 'checkerboard') {
    for (let row = 0; row * band < inner.height; row++) {
      for (let column = row % 2; column < 4; column += 2) {
        context.fillRect(inner.x + column * band, inner.y + row * band, band, band);
      }
    }
  } else if (pattern === 'diagonal') {
    context.translate(inner.x + inner.width / 2, inner.y + inner.height / 2);
    context.rotate(Math.PI / 4);
    for (let offset = -inner.height; offset < inner.height; offset += band * 2) {
      context.fillRect(offset, -inner.height, band, inner.height * 2);
    }
  } else {
    for (let column = 1; column < 4; column += 2) {
      context.fillRect(inner.x + column * band, inner.y, band, inner.height);
    }
  }
  context.restore();
  // The postmark: a ring and wavy lines, in faded ink, over the stamp's left edge.
  context.strokeStyle = 'rgb(59 47 37 / 0.45)';
  context.lineWidth = Math.max(1, width * 0.025);
  const ringX = x - width * 0.05;
  const ringY = y + height * 0.42;
  const ring = width * 0.36;
  context.beginPath();
  context.arc(ringX, ringY, ring, 0, Math.PI * 2);
  context.stroke();
  for (let line = -1; line <= 1; line++) {
    context.beginPath();
    const lineY = ringY + line * ring * 0.4;
    for (let step = 0; step <= 24; step++) {
      const lineX = ringX + ring * 0.7 + (step / 24) * width * 0.9;
      const wave = Math.sin(step * 0.9) * ring * 0.08;
      if (step === 0) context.moveTo(lineX, lineY + wave);
      else context.lineTo(lineX, lineY + wave);
    }
    context.stroke();
  }
}

/** @param {CanvasRenderingContext2D} context @param {number} x @param {number} y @param {number} r */
function dot(context, x, y, r) {
  context.beginPath();
  context.arc(x, y, r, 0, Math.PI * 2);
  context.fill();
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {number} x @param {number} y @param {number} width @param {number} height
 * @param {number} radius
 */
function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), type, quality),
  );
}

/**
 * Saves a file to the player's downloads.
 *
 * @param {Blob} blob
 * @param {string} name
 */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * @param {string} label
 */
function row(label) {
  const element = document.createElement('div');
  element.className = 'photo-row';
  const name = document.createElement('span');
  name.className = 'photo-label';
  name.textContent = label;
  element.append(name);
  return element;
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
