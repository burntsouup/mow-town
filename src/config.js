// Every tunable number lives here, so game feel can be adjusted in one place.
export const config = {
  loop: {
    // Longest frame step we simulate at once (see game/time.js).
    maxDeltaSeconds: 1 / 30,
  },
  render: {
    antialias: true,
    // Pixels to render per CSS pixel: up to the screen's own (2 on a Retina Mac), but at most
    // highRefreshPixelRatio on screens faster than highRefreshAbove Hz. At 120 Hz there are
    // only 8.3 ms per frame, and at full Retina size the lawn takes ~10 ms on an M3 MacBook
    // (~6.6 ms at 1.5). See game/display.js.
    maxPixelRatio: 2,
    highRefreshAbove: 75,
    highRefreshPixelRatio: 1.5,
    shadowMapSize: 2048,
    // Sky dome gradient. The horizon color is also the fog color so distant ground fades out.
    // sunGlow: added around the sun; cloudShade: the undersides of clouds.
    // The sky and clouds skip the color grading, so these are the colors you see.
    sky: { zenith: '#4f97e8', horizon: '#dfeaf2', sunGlow: '#ffe6bf', cloudShade: '#cdd9ec' },
    // Linear fog, in meters from the camera. Hides the edge of the world.
    fog: { start: 45, end: 120 },
    // Direction the sunlight travels: a late-afternoon sun, low enough for long shadows.
    sun: { direction: [-0.55, -1, 0.7], intensity: 1.35, color: '#ffe0b3', shadowDarkness: 0.3 },
    // Soft light from the sky above and bounced light from the ground below. It's what
    // lights the shadows, so its blue keeps them cool next to the warm sun.
    fill: { intensity: 0.7, skyColor: '#b9d3f2', groundColor: '#8a8a5e' },
    // The final look (see applyColorGrading in environment/lighting.js). exposure/contrast:
    // 1 = unchanged. saturation: -100..100. Hues in degrees (40 = warm, 220 = blue);
    // densities 0..100. vignette: 0 = none.
    grading: {
      exposure: 1.05,
      contrast: 1.05,
      saturation: 6,
      highlights: { hue: 40, density: 18 },
      shadows: { hue: 215, density: 28 },
      vignette: 0.9,
      vignetteColor: '#3a2a4a',
    },
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
    shoulderOffset: 0.7, // how far to the right, so the player doesn't block the view ahead
    collisionPadding: 0.2, // gap kept between the camera and a wall it's pushed against
    returnSpeed: 6, // how quickly the camera eases back out once a wall is gone
    minHeight: 0.3, // never go lower than this above the ground
    nearClip: 0.05, // closest distance the camera can draw; small so walls don't clip
    // When pushed in close, fade the player out so they don't fill the screen (meters).
    seeThroughOpacity: 0.12, // how faint a tree's leaves get when they're in the way
    playerHiddenBelow: 0.7,
    playerSolidAbove: 1.4,
    // While pushing the mower: further back and higher, so you can see the mower ahead, with
    // the player see-through (the mower would otherwise hide right behind them).
    mowing: {
      distance: 4.6,
      shoulderOffset: 0.9,
      pivotHeight: 1.7,
      pitch: 0.42,
      playerOpacity: 0.6,
    },
    // While carrying the string trimmer: higher and a little closer, looking down at the head
    // in front of you (pitch: the least it tips down to when you take it out).
    trimming: {
      distance: 3.4,
      shoulderOffset: 0.8,
      pivotHeight: 1.9,
      pitch: 0.8,
      minPitch: 0.45, // ...and the least it looks down while you carry it
      playerOpacity: 0.8,
    },
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
  // Tuft, the character (see player/Tuft.js).
  tuft: {
    // Fur, limb and clothes colors are in player/wardrobe.js (you pick them in the closet).
    colors: {
      eyes: '#2f8fb0', // irises
      mouth: '#5a2436',
    },
    // shells: layers of fur; length: meters from skin to tips; density: strands per meter;
    // thickness: strand width at the root (0..1 of its spacing); softness: how blurry each
    // strand's edge is (fluffy, not spiky); sheen: the glow around the silhouette; trail:
    // how far the tips lag behind per m/s of speed.
    fur: {
      shells: 16,
      length: 0.08,
      density: 150,
      thickness: 0.45,
      softness: 0.12,
      sheen: 0.2,
      trail: 0.006,
    },
    // The eyebrow tufts: shorter, finer fur.
    browFur: {
      shells: 10,
      length: 0.028,
      density: 320,
      thickness: 0.45,
      softness: 0.12,
      sheen: 0.15,
    },
    // A beanie's pompom: a little furry ball.
    pompomFur: {
      shells: 10,
      length: 0.03,
      density: 280,
      thickness: 0.5,
      softness: 0.12,
      sheen: 0.2,
    },
    // The body is soft, like jelly: springs (stiffness: how quick the wobble; damping: how
    // fast it settles) make it lag and sway when you start, stop and turn (lean: radians per
    // m/s² of change in speed, up to maxLean), and its surface ripples (ripple: meters).
    jelly: { stiffness: 90, damping: 7, lean: 0.012, maxLean: 0.2, ripple: 0.004 },
    // stride: meters each foot travels either side of its hip; lift: how high feet step;
    // bob/squash: how much the body bounces and squishes per step; armSwing: arms vs feet;
    // fullAt: the speed (m/s) that counts as a full walk.
    walk: { stride: 0.25, lift: 0.09, bob: 0.05, squash: 0.06, armSwing: 0.9, fullAt: 1.2 },
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
    stripes: 0.18, // how much lighter/darker mowed grass looks leaning away/toward you
    mowLean: 0.35, // how far mowed blade tips lean the way the mower went (in blade widths)
    colors: { root: '#27401c', tip: '#86ad4d', longTip: '#5e8c38' },
  },
  mower: {
    // 'mouse': the mower turns toward where you look (A/D swing the view too).
    // 'keys': A/D turn the mower, and the camera swings in behind it when the mouse is idle.
    steering: 'mouse',
    pushSpeed: 1.7, // m/s: a brisk walk behind a mower
    pullSpeed: 0.8, // m/s when pulling it back
    acceleration: 2.2, // m/s²: heavy, so it takes most of a second to get rolling
    braking: 4, // m/s²: how quickly it stops when you stop pushing
    turnSpeed: 1.9, // radians per second at full turn (~110°/s)
    turnAcceleration: 8, // radians per second²: turning takes a moment to build up, too
    // Long grass slows you down: speed × (1 - grassSlowdown × work), where work is 1 for
    // full-length normal grass and up to ~2.5 in thick patches. Never below minSpeedFactor.
    grassSlowdown: 0.1,
    minSpeedFactor: 0.45,
    mouseFullTurnAngle: 0.35, // mouse steering turns fully when this far (radians) off your view
    cameraFollow: 2.5, // key steering: how quickly the camera swings in behind the mower
    grabKey: 'KeyE',
    grabRange: 1.6, // meters from the middle of the mower
    grabTime: 0.25, // seconds to step into the handle
    handleLength: 1.3, // meters from the middle of the deck to where you stand
    colliderRadius: 0.32, // meters: the round collision shape around the deck
    engineShake: 0.0025, // meters: how much the engine rattles the mower while running
    // The cutting area under the mower, in meters: a 22-inch deck, like a real push mower.
    deck: { width: 0.56, length: 0.45 },
  },
  shop: {
    buyRange: 1.2, // meters from the front of the sale stand that you can buy from
    // The 30-inch deck: about 40% more lawn per pass, but bulkier (a bigger collision shape,
    // in meters), so it can't get as close to things.
    wideDeck: { price: 50, width: 0.76, length: 0.5, colliderRadius: 0.42 },
    toastTime: 3, // seconds a message like "deck fitted" stays up
  },
  // The closet (the coat stand by the front door, or "Dress up" on the start screen).
  closet: {
    range: 1.4, // meters from the coat stand that you can press E to dress up
    // The camera orbits Tuft (drag to turn it, scroll to zoom): distance in meters, height
    // as an angle down from straight above (radians), turn: how far round from straight in
    // front (radians), shift: how far Tuft sits left of the middle (meters, to make room for
    // the panel).
    camera: { distance: 3.1, height: 1.32, turn: 0.4, shift: 0.6, near: 1.4, far: 5 },
  },
  trimmer: {
    key: 'KeyQ', // takes the string trimmer out, or puts it away
    radius: 0.17, // meters: how far the spinning line reaches (a 13-inch cut, like a real one)
    reach: { min: 0.6, max: 1.3 }, // meters from your feet that the head can reach
    follow: 14, // how snappily the head follows your aim
    maxSpeed: 3.5, // m/s: the fastest you can swing it
    walkSpeed: 2.2, // m/s: you walk carefully while carrying it (and can't run)
    aimFar: 20, // meters: looking above the ground aims this far out (then reach limits it)
  },
  effects: {
    clippingsPerCut: 900, // clippings per second, per unit of grass cut per second
    maxClippingsRate: 1200, // clippings per second, at most
    trimmerSprayPerCut: 2500, // the same for the string trimmer's spray of grass bits
    maxTrimmerSpray: 600,
    clippingColors: ['#86b84a', '#5b8a30'], // each clipping is somewhere between these
  },
  audio: {
    master: 0.7,
    // The mower engine (see audio/audioMix.js). Volumes are 0..1.
    engineFrequency: 52, // Hz: the engine's buzz at full speed
    engineIdle: 0.12, // blades spinning freely
    engineWorking: 0.2, // blades working hard
    cutting: 0.22, // blades whipping through grass
    fullLoadCutRate: 0.9, // grass cut per second that counts as full load (thick grass)
    bogDepth: 0.35, // how far a full load drags the engine speed down (0..1)
    // How quickly the engine speed follows: starting up, recovering, bogging, stopping.
    spinUp: 2.5,
    recover: 1.8,
    bog: 5,
    spinDown: 1.5,
    // The string trimmer's two-stroke engine (see trimmerSound in audio/audioMix.js).
    trimmer: {
      frequency: 150, // Hz: its buzz at full revs
      idleSpeed: 0.4, // engine speed (0..1) while carried with the trigger up
      revUp: 7,
      revDown: 3,
      bogDepth: 0.2,
      idle: 0.04,
      full: 0.11,
      cutting: 0.2,
      fullLoadCutRate: 0.15, // grass trimmed per second that counts as full load
    },
    chime: 0.22, // "job complete" jingle
    ding: 0.14, // "edges done"
    coins: 0.16, // "ka-ching" when you're paid
    muteKey: 'KeyM',
  },
  job: {
    completeAt: 0.98, // fraction of the lawn that counts as done; the rest is finished for you
    // The edges: lawn within this many meters of things you trim around (the fence, trees,
    // beds, toys). They're left long when the lawn is done, for the string trimmer, and count
    // as done at edgesDoneAt (then the last bits shrink away).
    edgeWidth: 0.25,
    edgesDoneAt: 0.97,
    cardTime: 6, // seconds the "Job complete" card stays up (after the aerial view)
    finishFadeTime: 1.2, // seconds for the leftover tufts to shrink away once it's done
    highlightKey: 'KeyF', // hold to highlight the grass that's left
    highlightColor: '#ff3df2', // bright magenta: stands out against every green
    revealKey: 'KeyV', // view the lawn from above (it also plays when the job is done)
    // The aerial shot: seconds to fly up (and back), seconds to hold, meters up and back
    // from the lawn's middle, and how far (radians) it swings across the lawn meanwhile.
    reveal: { flyTime: 2.2, holdTime: 4, height: 14, distance: 11, swing: 0.3, skipAfter: 1 },
    resetKey: 'KeyR', // after completion: redo the job (or, after the last one, start over)
    nextKey: 'KeyN', // after completion: move on to the next job
  },
  money: {
    // What each job pays when it's done, in dollars, by job id (see the level's jobs).
    jobPay: { frontLawn: 40, nextDoor: 65 },
    stripesTip: 10, // dollars, at most, for neat stripes
    edgesTip: 10, // dollars for trimming the edges
    // How neat the stripes are (0..1, see lawn/neatness.js): the tip starts above tipFrom
    // and is the whole amount at tipFull. Tidy rows score ~0.95; a random scribble ~0.35.
    tipFrom: 0.6,
    tipFull: 0.9,
    neatnessPatch: 1.5, // meters: stripes are judged in square patches this big
    // The money on screen counts up like a till (see countTowards in game/pay.js).
    countSpeed: 3,
    countMinSpeed: 15, // dollars per second
  },
};
