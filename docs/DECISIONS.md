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
**Cutting:** the deck is a 53 × 45 cm rectangle (a 21-inch push mower). `DeckCutter` works
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
