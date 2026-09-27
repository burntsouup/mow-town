import { Engine } from '@babylonjs/core';
import { Game } from './game/Game.js';
import './style.css';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const hud = /** @type {HTMLElement} */ (document.getElementById('hud'));

if (Engine.IsSupported) {
  const game = new Game(canvas, hud);
  game.start();
  // Dev builds only: type `game` in the browser console to inspect or tweak it live.
  if (import.meta.env.DEV) Object.assign(window, { game });
} else {
  hud.innerHTML =
    '<p class="fatal-error">Your browser does not support WebGL, which this game needs.</p>';
}
