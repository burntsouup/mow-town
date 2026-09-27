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
    // A fairly high sun (~60°) keeps the house's shadow from covering the backyard patio.
    sun: { direction: [-0.35, -1.5, 0.75], intensity: 0.75, color: '#fff3dc' },
    // Soft light from the sky above and bounced light from the ground below.
    fill: { intensity: 0.5, skyColor: '#dbe8f5', groundColor: '#7d8a62' },
  },
  debug: {
    showFps: true,
    // KeyboardEvent.code that toggles the Babylon Inspector (the ` key, left of 1).
    inspectorKey: 'Backquote',
    tuningKey: 'KeyT', // toggles the live tuning panel
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
    shoulderOffset: 0.7, // how far to the right, so the player doesn't block the crosshair
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
    aimTurnSpeed: 25, // while spraying, how quickly the body turns to face where you aim
    sprayingSpeedFactor: 0.6, // walk/run speed multiplier while spraying: heavier, steadier
  },
  cleaning: {
    texelsPerMeter: 51.2, // dirt detail: ~2 cm per texel (the 5 m wide driveway gets 256)
    brushHardness: 0.6, // 0..1: how much of the spray is full strength before its soft edge
    cleanRate: 5.5, // dirt removed per second at full strength, head-on (1 = extreme dirt)
    // Dirt colors from light to heavy. Clean concrete is the surface's own color.
    dirtColors: { light: '#9e957f', grime: '#6b604f', oil: '#25211d' },
    // Moss is tough: the spray must hit it harder than minStrength (0..1) to lift it at all,
    // which in practice means getting within ~2.9 m. After that it comes off at `rate` × normal.
    moss: { minStrength: 0.65, rate: 0.9 },
    mossColors: { light: '#86913f', dark: '#3d5122' },
    wetSpread: 1.3, // the wet patch is this much wider than the cleaning spot
    dripChance: 0.5, // on upright surfaces: chance per frame of a trickle running down
    dripLength: [0.35, 1.1], // trickle length range, meters
    dripWidth: 0.055, // meters
    dryTime: 8, // seconds for a soaked spot to dry completely
    wetDarkening: 0.62, // wet surfaces are multiplied by this (1 = no darkening)
  },
  washer: {
    pickupRange: 1.8, // how close (meters) you need to be to pick up the washer
    maxRange: 6, // the spray stops cleaning beyond this distance (meters)
    fullStrengthRange: 1.2, // full power up to here, fading to nothing at maxRange
    nozzleRadius: 0.08, // spray spot radius right at the nozzle (meters)
    spreadPerMeter: 0.09, // how much wider the spot gets per meter: ~29 cm radius at 2.3 m
    // The water comes out as a flat fan: this is its thickness ÷ width (1 = round). The fan's
    // area matches a round spot of the radius above, just squashed.
    fanFlatness: 0.45,
    fanKey: 'KeyQ', // turns the fan between upright and flat
    startVertical: true, // upright suits side-to-side sweeps along the ground
    maxStretch: 2.5, // at glancing angles the footprint stretches, but never more than this
  },
  effects: {
    splashRate: 450, // water droplets per second at full strength
    mistRate: 50, // soft mist puffs per second
    splatterPerDirt: 1.2, // dirt droplets per unit of dirt removed per second
    maxSplatterRate: 500,
    streamSpeed: 3, // how fast the streaks in the water beam rush outward
  },
  audio: {
    master: 0.7,
    // Layer volumes (0..1). See audio/audioMix.js for when each one plays.
    humIdle: 0.05, // engine, once you've picked up the gun
    humSpraying: 0.1, // engine working harder while spraying
    hiss: 0.16, // water rushing out of the nozzle
    impact: 0.22, // water hitting a surface
    strip: 0.3, // gritty crackle of dirt coming off
    fullStripRate: 300, // dirt removed per second that gives the loudest stripping sound
    chime: 0.22, // "job complete" jingle
    muteKey: 'KeyM',
  },
  job: {
    completeAt: 0.98, // fraction of dirt that counts as done; the rest fades away for you
    finishFadeTime: 1.2, // seconds for leftover specks to fade out when the job completes
    highlightKey: 'KeyF', // hold to highlight the dirt that's left
    highlightColor: '#ff3df2', // bright magenta: stands out against concrete and grime
    resetKey: 'KeyR', // after completion: redo the job (or, after the last one, start over)
    nextKey: 'KeyN', // after completion: move on to the next job
  },
};
