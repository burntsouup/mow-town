// Colors and small constants shared by the level's builders. Units are meters.

export const COLORS = {
  ground: '#5b8a3c', // everyone else's lawns
  street: '#3a3b3f',
  streetLine: '#d9b64a',
  sidewalk: '#b9b6ad',
  concrete: '#c4c0b6',
  walls: '#e3dccd',
  roof: '#5a5552',
  garageDoor: '#f1efe9',
  frontDoor: '#8c3b2e',
  window: '#3f4f5f',
  trunk: '#6b4a32',
  leaves: '#4a7a34',
  bush: '#3f6e2e',
  bin: '#35524a',
  mailbox: '#2f3136',
  mulch: '#5b4331',
  edging: '#9a8f82',
  fence: '#a0876a',
  ball: '#d63b3b',
  truck: '#f2b632',
  tire: '#26272b',
  // Next door
  theirWalls: '#cfd9df',
  theirRoof: '#4c535c',
  theirDoor: '#2f5d8c',
  hedge: '#355f2a',
  shed: '#8a6f52',
  shedRoof: '#4d4a47',
  stone: '#b9b3a8',
  water: '#7fb3d5',
  gnomeHat: '#d63b3b',
  gnomeCoat: '#3d6fb5',
  gnomeFace: '#f1c9a5',
  gnomeBeard: '#f4f1ea',
};
export const FLOWER_COLORS = ['#e84a5f', '#f7c948', '#f4f1ea', '#b565d9', '#ff8f3d'];

// Flat surfaces are stacked a few millimeters apart so they don't flicker ("z-fighting").
export const LAYER = { mulch: 0.008, street: 0.01, marking: 0.02, sidewalk: 0.02, paving: 0.03 };
// Where two flat surfaces meet at different heights, the lower one extends this far under
// the higher one. Otherwise, at low camera angles, you can see the lawn through the seam.
export const SEAM_OVERLAP = 0.1;
/** Invisible colliders are this tall: low ones would let the player slide over them. */
export const COLLIDER_HEIGHT = 1.6;
