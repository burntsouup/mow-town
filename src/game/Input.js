/**
 * Keyboard and mouse state, read by game systems each frame.
 *
 * Mouse look uses the Pointer Lock API: clicking the game hides the cursor and reports raw
 * mouse movement, so you can turn forever without hitting the screen edge. Esc releases it.
 */
export class Input {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    /** Keys currently held, by KeyboardEvent.code (e.g. 'KeyW', 'ShiftLeft'). */
    this.keysDown = new Set();
    /** Keys that went down this frame. */
    this.keysPressed = new Set();
    /** Mouse buttons currently held (0 = left, 2 = right). Only tracked while locked. */
    this.mouseButtons = new Set();
    /** Mouse movement in pixels since the previous frame. */
    this.mouseDelta = { dx: 0, dy: 0 };
    this.isPointerLocked = false;

    canvas.addEventListener('click', () => {
      if (!this.isPointerLocked) this.lockPointer();
    });
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
      if (!this.isPointerLocked) this.releaseAll();
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.isPointerLocked) return;
      this.mouseDelta.dx += event.movementX;
      this.mouseDelta.dy += event.movementY;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (this.isPointerLocked) this.mouseButtons.add(event.button);
    });
    window.addEventListener('mouseup', (event) => this.mouseButtons.delete(event.button));
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keysDown.add(event.code);
      this.keysPressed.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.keysDown.delete(event.code));
    // Switching windows mid-keypress would otherwise leave keys "stuck" down.
    window.addEventListener('blur', () => this.releaseAll());
  }

  /** @param {string} code KeyboardEvent.code, e.g. 'KeyW'. */
  isDown(code) {
    return this.keysDown.has(code);
  }

  /** @param {string} code True only on the frame the key went down. */
  wasPressed(code) {
    return this.keysPressed.has(code);
  }

  /** @param {number} button 0 = left, 2 = right. */
  isMouseDown(button = 0) {
    return this.mouseButtons.has(button);
  }

  async lockPointer() {
    // Ask for raw mouse movement (no OS acceleration); fall back if the browser can't.
    // If both fail (e.g. the page isn't focused yet), the next click simply tries again.
    const canvas = /** @type {any} */ (this.canvas);
    try {
      await canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await canvas.requestPointerLock();
      } catch {
        // Nothing to do; stay on the "click to play" screen.
      }
    }
  }

  releaseAll() {
    this.keysDown.clear();
    this.mouseButtons.clear();
  }

  /** Called once per frame after every system has read the input. */
  endFrame() {
    this.mouseDelta.dx = 0;
    this.mouseDelta.dy = 0;
    this.keysPressed.clear();
  }
}
