// Colors and small constants shared by the level's builders. Units are meters.

export const COLORS = {
  ground: '#6d9a45', // everyone else's lawns (under the ground texture)
  streetLine: '#f1d27a',
  curb: '#d6cfc2',
  walls: '#f3e7d3',
  trim: '#fbf8f0', // window frames, sills, eaves, the picket fence
  foundation: '#b9ad9b',
  roof: '#b9654b',
  garageDoor: '#fbf7ef',
  groove: '#ddd6ca', // the lines across a garage door
  frontDoor: '#3f8f86',
  shutters: '#3f8f86',
  glass: '#a9cbe0',
  knob: '#d8b25a',
  step: '#cfc8bb',
  trunk: '#7a563a',
  leaves: '#5c9a3f',
  bush: '#4f8a3a',
  bin: '#3f6f64',
  mailbox: '#34495e',
  mailboxFlag: '#e0483c',
  post: '#fbf8f0',
  edging: '#b3a896',
  fence: '#fbf8f0',
  ball: '#e0483c',
  truck: '#f5b93a',
  tire: '#2b2c30',
  // Next door
  theirWalls: '#d3e3ec',
  theirRoof: '#5d6b7c',
  theirDoor: '#f2b93b',
  hedge: '#3f7a33',
  shed: '#9a7a58',
  shedRoof: '#5d5249',
  stone: '#c7c0b4',
  water: '#8cc3e3',
  gnomeHat: '#e0483c',
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
