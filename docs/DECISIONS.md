# Decisions

Short records of the choices that shape the project, so future-you (or Copilot) knows _why_.
Add an entry when a decision would be surprising to someone reading the code. Format: **Why**,
then **Revisit** (when to reconsider) and **Gotchas** (traps we fell into) where useful.

## 1. Started from p-washer v0.2.0

**Why:** p-washer's base systems (game loop, pointer-lock input, over-the-shoulder camera,
player movement, jobs as data, tuning panel, HTML HUD, synthesized audio, greybox kit, CI and
Pages deploy) were proven in two playtested releases and fit a mowing game as-is. Everything
cleaning-specific (dirt and wetness grids, the washer and spray, fence and patio, washing
jobs) was removed. The git history starts fresh; see the
[p-washer repo](https://github.com/burntsouup/p-washer) for the history of the kept code.

## 2. Babylon.js as the engine

**Why:** Free (Apache-2.0), JavaScript-first, and batteries-included: shadows, particles,
material plugins (how we'll draw grass), raw textures with partial uploads, and a built-in
Inspector. **Revisit if:** we hit a hard limitation, which is unlikely at this scale.

## 3. Plain JavaScript, not TypeScript

**Why:** No build step to learn, and Babylon ships type definitions so VS Code autocompletes
in plain JS anyway. Pure logic files use `// @ts-check` + JSDoc comments to catch type mistakes.
**Revisit if:** the codebase grows large enough that refactors keep breaking things.

## 4. No physics engine

**Why:** Walking on a flat yard and bumping into walls works with Babylon's built-in collisions
(`moveWithCollisions`). The feet are pinned to the ground each frame instead of simulating
gravity, since there are no slopes, stairs, or jumping. **Revisit when:** we need dynamic
objects or uneven ground. Then prefer Babylon's Havok plugin (`@babylonjs/havok`, MIT) over
Rapier because it integrates directly and includes a character controller.

## 5. Import Babylon.js from the package root

**Why:** Deep imports (`@babylonjs/core/Meshes/...`) shrink the bundle but can silently drop
features unless you add the right side-effect imports, which is a confusing trap early on.
Cost: the build is ~6.7 MB minified (~1.5 MB gzipped). **Revisit:** before a public release.

## 6. Babylon Inspector as a dev-only dependency

**Why:** The Inspector (click a mesh, tweak a light, view a texture) is one of the best ways to
learn and debug Babylon scenes. It's loaded with a dynamic `import()` only when
`import.meta.env.DEV` is true, so production builds don't include it. The CDN version doesn't
work with npm-installed Babylon. **Cost:** ~600 MB in `node_modules` (mostly an icon package),
on dev machines and CI only. **Revisit if:** installs or CI get noticeably slow.

## 7. Roadmap file instead of GitHub Issues

**Why:** Solo project. A checklist in `docs/ROADMAP.md` is simpler, versioned with the code,
and readable by Copilot. **Revisit if:** collaborators or public bug reports show up.

## 8. GitHub Pages for playtest builds, relative base path

**Why:** Free, and every merge to `main` deploys a playable URL automatically. `base: './'`
in `vite.config.js` makes the same build work on Pages and on itch.io (for a later release).
Load files from `public/` with `import.meta.env.BASE_URL` + path, never a leading `/`.

## 9. HTML/CSS for the HUD

**Why:** Simpler than in-engine GUI, familiar, and inspectable with browser devtools.

## 10. Level built in code from simple shapes

**Why:** A small "greybox kit" (`src/environment/greybox.js`) builds boxes, pyramids and blobs
from a few lines each, so moving the house or resizing the lawn is a one-number change with
instant live reload. No 3D modeling tool or asset pipeline needed yet.
**Revisit when:** we want real art. Then model in Blender and load `.glb` files.

## 11. Feedback ("juice") without asset files

**Why:** Placeholder art shouldn't block feel. Particle textures are drawn with the 2D canvas
API at startup, and sounds are synthesized with the Web Audio API (oscillators and filtered
noise). Pure functions decide what each sound layer does, so the sound design rules are
readable and tested. **Revisit when:** we want richer sound. Swap in CC0 recordings (e.g. from
Freesound) behind the same layers, and list them in `CREDITS.md`.
**Gotcha:** browsers block audio until the player interacts, so the audio graph is built on
the first click.

## 12. A job is done at 98%

**Why:** Hunting the last few tufts is the least fun part of any cleaning or mowing game. At
98% (`config.job.completeAt`) the job completes and the game finishes the rest for you, which
feels like a reward instead of a chore. The bar shows progress relative to that threshold, so
it reads 100% exactly at completion. The timer starts when you start working, so walking
around first doesn't count. `R` only restarts after completion, so a stray keypress can't wipe
your progress.

## 13. Tuning panel ships with the game (behind `T`)

**Why:** Feel is found by playing, not by editing numbers and reloading. The lil-gui panel
(MIT, ~30 KB) edits `config` live; most systems read it every frame, and the few that copy a
value at startup get an onChange hook. It's included in production builds, hidden until `T`,
so tuning works on the live site too. "Copy changes" copies only the edited values as JSON,
ready to paste into `config.js` (or into a Copilot chat). Nothing is saved between reloads, so
`config.js` stays the single source of truth.

## 14. Jobs are data, played in order

**Why:** A second job should be a few lines in the level, not new code. The level returns a
list of job definitions (title, hint, done text), and `JobList` (pure, tested) plays them in
order: `N` moves on only after finishing, `R` redoes the current job, and after the last one
`R` starts over from the beginning.
**Testing gotcha:** when stepping the game by hand in a test (hidden browser tabs are throttled
to ~1 fps), render every step. Babylon caches world positions per rendered frame, so skipping
renders makes collisions read stale positions and walls look leaky.

## 15. Babylon gotchas carried over from p-washer

Traps that cost real time in p-washer and will matter again for the grass:

- A material plugin with no other textures must request UVs: in
  `prepareDefinesBeforeAttributes` set `defines._needUVs = true; defines.MAINUV1 = true`, then
  sample with `vMainUV1`.
- Uniforms that change every frame must be set in `hardBindForSubMesh`, which Babylon only
  calls if the plugin sets `registerForExtraEvents = true` before `_enable(true)`.
- `RawTexture.CreateRTexture` defaults to float data: pass `Constants.TEXTURETYPE_UNSIGNED_BYTE`.
  For RGBA, call `new RawTexture(...)` with `Constants.TEXTUREFORMAT_RGBA` and that same byte
  type. Upload just the changed part with `engine.updateTextureData`.
- Cloning a material clones its textures, and a cloned `DynamicTexture` is blank (never ready):
  only clone when the material is shared.
- Particle systems: `updateSpeed = 1/60` makes their timings real seconds.
- UV orientation: a plane has u along +x, v along +y and faces −z; a ground has u along +x,
  v along +z.
- `Math.max(...bigArray)` overflows the stack; use a loop or `reduce`.
- Validate layout parameters in texture helpers: a misnamed parameter silently produced `NaN`
  sizes and a blank texture.

## 16. Grass is drawn with shell texturing

**Why:** Mowing needs thousands of blades whose height changes wherever the deck passes.
Shell texturing draws the lawn as a stack of flat layers (24 by default); a material plugin
decides per pixel whether a blade passes through that layer, from a hashed random per blade
cell and a grass-height texture. Blades taper toward the tip and long ones lean a little.
Cutting is then just writing smaller heights into the texture (uploaded in changed
rectangles), with no geometry changes at all. It's one draw call of 48 triangles, and the
cost is pixels, not blades: ~2 ms per frame at Retina resolution on an M3.
**Alternative:** instanced blade meshes look better from the side but need per-blade updates
when cut and cost far more vertices for a full lawn. Kept as the fallback.
**Details:** the shell mesh's local y runs 0..1 and is scaled to `config.grass.maxHeight`, so
the shader reads each shell's height from `position.y`. The bottom shell is solid ground. Far
away, blades are smaller than a pixel and would shimmer, so the shader fades them into a solid
carpet at their average height (using `fwidth` on the blade cells).
**Revisit if:** the lawn looks too flat at low camera angles (add more shells near the camera)
or slower GPUs struggle (fewer shells, or render at a lower pixel ratio).
**Gotchas:** Babylon's front faces are clockwise seen from the front; the first shell mesh
wound counter-clockwise was invisible from above. Compute `fwidth` before any `discard`.

## 17. The lawn is a CPU grid, cut at fixed 60 Hz ticks

**Why:** Like p-washer's dirt, the grass lives in a plain array (`GrassGrid`, ~3 cm per texel)
that the renderer uploads as a texture. Progress is exact and cheap, and the core is pure JS
we can unit-test. Per texel: height, a lawn mask, density (thick grass), and the direction
the deck was facing when it last passed over (for stripes, packed into the texture's green
and blue channels).
**Cutting:** the deck is a 56 × 45 cm rectangle (a 22-inch push mower; 53 cm until the
Milestone 7 tuning). `DeckCutter` works
out where the deck was at each fixed 60 Hz tick (`FixedTicker`) inside the frame and cuts a
stroke from the previous tick's pose, stamping the rectangle at least every half deck and
every ~5° of turning. So a fast or spinning mower leaves no gaps, and the lawn comes out
identical at 30, 60 or 144 fps. For multiplayer later, clients only need to share tick poses.
**Progress is weighted** by the grass each texel had to lose (starting height above the
target, times density), kept as a running total as texels get mowed. A texel counts as mowed
within `MOWED_TOLERANCE` (0.02) of the target height.
**Gotcha:** heights are stored as 32-bit floats, so `0.3` is stored as `0.30000001`, which is
"taller than 0.3" and got cut again (by nothing) every frame. Compare against
`Math.fround(cutTo)`.

## 18. The push mower: one rigid unit, two steering schemes

**Why:** Pushing should feel heavy but never fight you. `mowerMath.js` (pure, tested) gives
speed and turning momentum: ~0.8 s to get rolling at 1.4 m/s, a short coast when you stop,
slower pulling (0.8 m/s), and turning that builds up to ~85°/s. Turning swings the deck
around your hands, so you stay put and the camera doesn't lurch.
**Collisions:** the mower is a round puck (`moveWithCollisions`) around the deck, and the
player holds it one handle-length behind. Pushing moves the deck first, then the player
follows; pulling moves the player first. Whatever the deck hits soaks up speed, and the
heading always follows the line from your hands to the deck, so pushing into a wall at an
angle turns the mower to run alongside it instead of sticking.
**Steering:** two schemes, picked in the tuning panel. _Mouse_ (default): the mower heads
where you look, easing in so it doesn't overshoot; `A`/`D` swing the view too. It's the most
direct, but you can't look around without steering. _Keys_: `A`/`D` turn the mower and the
camera swings in behind it once the mouse is idle for 0.6 s. The playtest decides.
**Camera:** while mowing, the camera eases further back and higher, and the player fades to
45%, because the player's body otherwise hides the mower (see the roadmap findings).
**Gotchas:** Babylon ignores `moveWithCollisions` moves shorter than 1 mm
(`CollisionsEpsilon`), which is how far a mower rolls in its first frames, so tiny moves are
applied directly. Low obstacles don't stop an ellipsoid (it slides up and over them, then
we pin it back to the ground), so blockers must be taller than half the moving shape.

## 19. Stripes are shading, not geometry

**Why:** Real lawn stripes come from blades bent the way the mower went: bent away from you,
you see their shiny sides (lighter); bent toward you, you look into the shaded tips (darker).
The grid already stores each texel's mow direction, so the grass shader brightens or darkens
mowed grass by how much its direction points away from the camera (`config.grass.stripes`),
and leans the blade tips that way (`mowLean`). Opposite rows become stripes that swap as you
walk around them, for free. Looking straight down you can't tell which way blades lean, so
the effect fades out there.
**Thick grass** lives in the same texture: its alpha is 0 off the lawn and 128..255 for
density 1..3. `GrassGrid.workAhead` measures the grass just in front of the deck (1 = full,
normal grass) and the mower slows by `grassSlowdown` (15%) per unit, so long grass is a
little heavier and thick patches noticeably so, with no feedback loop through speed.
**Revisit when:** mowed grass should spring back (regrowth) or stripes should fade over time.

## 20. The engine sound follows a simulated engine speed

**Why:** A mower that bogs down in thick grass tells you the grass is thick before you see it.
`engineSound` (pure, tested) keeps an engine speed (0..1): it spins up when you grab the
handle, drops quickly under load (grass cut per second ÷ `fullLoadCutRate`), recovers more
slowly, and winds down when you let go. The synth follows it: a sawtooth + square buzz,
"chugging" at the firing rate (half the pitch) through a low-pass that opens as it revs,
over a low rattle, plus a blade layer (band-passed noise and a crackle) that follows the
load. Clippings use the same smoothed cut rate, so sound and particles agree.

## 21. The lawn job: one layout, shapes for everything, and an aerial reveal

**Why:** The lawn's layout lives in one table of shapes (`SPOTS` in `FrontYard.js`, using
`math/shapes.js`): the same rectangle or ellipse builds a flower bed's mulch and decides that
no grass grows there, so the grass and the props can't drift apart. Everything the mower can
bump into gets a tall invisible collider (see #18's gotcha), including the fence, whose rails
have gaps. The lawn is ~142 m², which a pacing check in Milestone 7 turns into minutes.
**Completion** reuses #12: at 98% the last tufts shrink away over 1.2 s, sparkles rise off the
lawn, and the chime plays. `F` paints every uncut texel magenta; `R` grows the grass back.
**The reveal:** finishing a lawn should end on the payoff, so `RevealCamera` flies up from
the player's view to above the street, swings slowly across the lawn, and flies back. Its
timing is a small pure timeline (`revealMath.js`). While it plays, `Input.blocked` makes the
game ignore keys, buttons and mouse look (so mouse steering can't swing the mower), and any
key or click after a second cuts it short. `V` plays it any time, which also helps to plan.

## 22. Pacing is checked by a bot, not by feel alone

**Why:** p-washer taught us that the first numbers can make a job take far longer than they
feel on paper (there, ~7.5 minutes of perfect play). `pacing.js` runs a tidy bot through the
real lawn with the real handling, grass and cutting, and `pacing.test.js` fails if the best
case leaves a 3–5.5 minute band, so a tuning change that turns the lawn into a slog shows up
in CI. It turns on the spot and ignores obstacles, so treat it as a lower bound; real players
take about 1.5× as long. **Revisit when:** more lawns arrive (give each its own band) or the
turn model matters (the real mower swings around your hands, which costs more at row ends).

## 23. Money: a price per job, plus a tip for neat stripes

**Why:** Money is what v0.2's loop runs on, and the tip ties it to the fun part: neat rows.
`stripeNeatness` (`lawn/neatness.js`) splits the lawn into 1.5 m patches and checks how
parallel the mowing directions are in each, doubling the angles first so a row and the next
one mowed the other way count as parallel. Patches instead of one score for the whole lawn,
so rows that bend around a tree only cost a little, and an L-shaped lawn can be mowed in two
directions. The tip is linear from a neatness of 0.6 (nothing) to 0.9 (all of it); see the
v0.2 findings in the roadmap for what scores what. Speed isn't paid for: rushing fights neat
stripes. The money counts up like a till (`countTowards`), with a synthesized "ka-ching".
Redoing a lawn pays again, so you can always earn what you need. Nothing is saved yet:
reloading the page starts over.
**Revisit when:** real runs score low (cleanup passes at odd angles overwrite the directions
underneath), or when saving is worth it (more upgrades, longer sessions).
**Gotcha:** only the deck records a mowing direction. The auto-finish at 98% doesn't, so the
leftover tufts don't count either way.
