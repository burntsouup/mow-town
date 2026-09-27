// Every tunable number lives here, so game feel can be adjusted in one place.
export const config = {
  loop: {
    // Longest frame step we simulate at once (see game/time.js).
    maxDeltaSeconds: 1 / 30,
  },
  render: {
    antialias: true,
    shadowMapSize: 2048,
    // Sky dome gradient. The horizon color is also the fog color so distant ground fades out.
    sky: { zenith: '#5b8fd8', horizon: '#cfdfee' },
    // Linear fog, in meters from the camera. Hides the edge of the world.
    fog: { start: 45, end: 120 },
    // Direction the sunlight travels. Keep x/z small-ish so faces get distinct brightness.
    // Sun + fill should add up to roughly 1 on sunlit ground, or colors wash out to white.
    sun: { direction: [-0.35, -1.5, 0.75], intensity: 0.75, color: '#fff3dc' },
    // Soft light from the sky above and bounced light from the ground below.
    fill: { intensity: 0.5, skyColor: '#dbe8f5', groundColor: '#7d8a62' },
  },
  debug: {
    showFps: true,
    // KeyboardEvent.code that toggles the Babylon Inspector (the ` key, left of 1).
    inspectorKey: 'Backquote',
    tuningKey: 'KeyT', // toggles the live tuning panel
    cutKey: 'KeyC', // hold to cut the grass around your feet (rendering test brush)
    cutRadius: 0.35, // meters
  },
  camera: {
    fov: 1.0, // vertical field of view in radians (~57°)
    sensitivity: 0.0025, // radians of turn per pixel of mouse movement
    invertY: false,
    initialPitch: 0.2,
    minPitch: -0.9, // how far you can look up (radians, negative = up)
    maxPitch: 1.2, // how far you can look down
    pivotHeight: 1.6, // the point the camera orbits: roughly the player's head
    distance: 4, // how far behind the player
    shoulderOffset: 0.7, // how far to the right, so the player doesn't block the view ahead
    collisionPadding: 0.2, // gap kept between the camera and a wall it's pushed against
    returnSpeed: 6, // how quickly the camera eases back out once a wall is gone
    minHeight: 0.3, // never go lower than this above the ground
    nearClip: 0.05, // closest distance the camera can draw; small so walls don't clip
    // When pushed in close, fade the player out so they don't fill the screen (meters).
    playerHiddenBelow: 0.7,
    playerSolidAbove: 1.4,
  },
  player: {
    height: 1.8,
    radius: 0.35,
    walkSpeed: 3.5, // meters per second
    runSpeed: 6.5, // while holding Shift
    acceleration: 30, // m/s²: reaches walking speed in ~0.1 s. Lower feels heavier.
    deceleration: 40, // m/s²: how hard you brake when letting go of the keys
    turnSpeed: 14, // how quickly the body turns to face the direction of travel
  },
  grass: {
    // The grass is drawn as a stack of see-through layers ("shells"); see
    // lawn/GrassMaterialPlugin.js. More shells = smoother blades, but slower to draw.
    shellCount: 24,
    maxHeight: 0.12, // meters: how tall the tallest uncut grass is
    texelsPerMeter: 32, // detail of the grass-height map: ~3 cm per texel
    bladesPerMeter: 50, // blade density: one blade per 2 cm cell
    bladeThickness: 0.6, // blade radius at the root, relative to its cell
    uncutHeight: [0.7, 1], // starting height range, as fractions of maxHeight
    cutHeight: 0.3, // height after mowing, as a fraction of maxHeight (~3.5 cm)
    colors: { root: '#23391a', tip: '#8dbb4c', longTip: '#5f8f35' },
  },
  audio: {
    master: 0.7,
    chime: 0.22, // "job complete" jingle
    muteKey: 'KeyM',
  },
  job: {
    completeAt: 0.98, // fraction of the lawn that counts as done; the rest is finished for you
    resetKey: 'KeyR', // after completion: redo the job (or, after the last one, start over)
    nextKey: 'KeyN', // after completion: move on to the next job
  },
};
