import { config } from '../config.js';

const FPS_REFRESH_SECONDS = 0.25;

/**
 * Developer overlay: an FPS readout and, in dev builds only, a hotkey that toggles the
 * Babylon Inspector. The Inspector is loaded on first use and never ships to players.
 */
export class DebugOverlay {
  /**
   * @param {import('@babylonjs/core').AbstractEngine} engine
   * @param {import('@babylonjs/core').Scene} scene
   * @param {HTMLElement} hudRoot
   */
  constructor(engine, scene, hudRoot) {
    this.engine = engine;
    this.scene = scene;
    this.secondsSinceRefresh = 0;
    /** @type {import('@babylonjs/inspector').InspectorToken | null} */
    this.inspector = null;

    this.fpsLabel = document.createElement('div');
    this.fpsLabel.className = 'debug-fps';
    this.fpsLabel.hidden = !config.debug.showFps;
    hudRoot.append(this.fpsLabel);

    if (import.meta.env.DEV) {
      window.addEventListener('keydown', (event) => {
        if (event.code === config.debug.inspectorKey && !event.repeat) this.toggleInspector();
      });
    }
  }

  async toggleInspector() {
    // Checked here (not just around the key listener) so production builds drop the import.
    if (!import.meta.env.DEV) return;
    if (this.inspector && !this.inspector.isDisposed) {
      this.inspector.dispose();
      this.inspector = null;
      return;
    }
    const { ShowInspector } = await import('@babylonjs/inspector');
    if (!this.inspector || this.inspector.isDisposed) {
      document.exitPointerLock(); // free the mouse so you can click around the Inspector
      this.inspector = ShowInspector(this.scene);
    }
  }

  /** @param {number} dt Seconds since the previous frame. */
  update(dt) {
    this.secondsSinceRefresh += dt;
    if (this.secondsSinceRefresh < FPS_REFRESH_SECONDS) return;
    this.secondsSinceRefresh = 0;
    this.fpsLabel.textContent = `${Math.round(this.engine.getFps())} fps`;
  }
}
