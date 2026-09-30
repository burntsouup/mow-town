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
  glass: '#5d7c93', // dark enough for the sky's reflection to show in it
  knob: '#d8b25a',
  step: '#cfc8bb',
  trunk: '#7a563a',
  leaves: '#6aa845',
  leavesCore: '#3f6e2c', // the dark middle of a tree's canopy
  bush: '#5a9a40',
  bushCore: '#35652a', // the dark middle of a bush, between its leaves
  bin: '#3f6f64',
  mailbox: '#34495e',
  mailboxFlag: '#e0483c',
  post: '#fbf8f0',
  edging: '#b3a896',
  fence: '#fbf8f0',
  ball: '#e0483c',
  truck: '#f5b93a',
  tire: '#2b2c30',
  coatStand: '#8b5e3c', // the closet by the front door
  // Next door
  theirWalls: '#d3e3ec',
  theirRoof: '#5d6b7c',
  theirDoor: '#f2b93b',
  hedge: '#4a8a3a',
  hedgeCore: '#2e5c25',
  shed: '#c0573f', // barn red
  shedBatten: '#a8472f',
  shedRoof: '#5d5249',
  stone: '#c7c0b4',
  water: '#3f7396',
  gnomeHat: '#e0483c',
  gnomeCoat: '#3d6fb5',
  gnomeFace: '#f1c9a5',
  gnomeBeard: '#f4f1ea',
  gnomeNose: '#f2a08a',
  gnomeBoot: '#5a3a28',
  bird: '#4c7fd9',
  birdBelly: '#f3c6a0',
  birdBeak: '#f2a33a',
};
/**
 * Colors that are shiny, and how mirror-like (0..1): they reflect the sky (see
 * reflections.js) and catch the sun.
 */
export const GLOSSY = { [COLORS.glass]: 0.9, [COLORS.water]: 0.7 };

export const FLOWER_COLORS = ['#e84a5f', '#f7c948', '#f4f1ea', '#b565d9', '#ff8f3d'];

// Flat surfaces are stacked a few millimeters apart so they don't flicker ("z-fighting").
export const LAYER = { mulch: 0.008, street: 0.01, marking: 0.02, sidewalk: 0.02, paving: 0.03 };
// Where two flat surfaces meet at different heights, the lower one extends this far under
// the higher one. Otherwise, at low camera angles, you can see the lawn through the seam.
export const SEAM_OVERLAP = 0.1;
/** Invisible colliders are this tall: low ones would let the player slide over them. */
export const COLLIDER_HEIGHT = 1.6;
