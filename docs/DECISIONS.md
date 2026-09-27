# Decisions

Short records of the choices that shape the project, so future-you (or Copilot) knows _why_.
Add an entry when a decision would be surprising to someone reading the code.

## 1. Babylon.js as the engine

**Why:** Free (Apache-2.0), JavaScript-first, and batteries-included: picking that returns
UV coordinates (essential for cleaning), shadows, particles, material plugins, and a built-in
Inspector. **Revisit if:** we hit a hard limitation, which is unlikely at this scale.

## 2. Plain JavaScript, not TypeScript

**Why:** No build step to learn, and Babylon ships type definitions so VS Code autocompletes
in plain JS anyway. Pure logic files use `// @ts-check` + JSDoc comments to catch type mistakes.
**Revisit if:** the codebase grows large enough that refactors keep breaking things.

## 3. No physics engine in v0.1

**Why:** Walking on a flat yard and bumping into walls works with Babylon's built-in collisions
(`moveWithCollisions`). The feet are simply pinned to the ground each frame instead of
simulating gravity, since v0.1 has no slopes, stairs, or jumping. The spray is a raycast, not
physics. **Revisit when:** we need dynamic objects or uneven ground. Then prefer Babylon's Havok
plugin (`@babylonjs/havok`, MIT) over Rapier because it integrates directly and includes a
character controller.

## 4. Dirt is a CPU-side grid in UV space

**Why:** Each cleanable surface stores one dirt value per texel in a plain array. Spray hits
give a UV coordinate; we subtract a soft brush there and upload the changed grid as a texture.
It's sharp enough, progress is exact and cheap, and the core is pure JS we can unit-test.
Alternatives considered: vertex colors (blurry, needs dense meshes) and GPU render-target
painting (faster at scale, but progress needs GPU readback and it's harder to debug).
**Details:** ~2 cm per texel (the 5 × 10 m driveway is 256 × 512). Dirt comes off linearly, so
extreme dirt (1.0) takes 4× as long as a light film (0.25). A texel counts as clean at ≤ 0.05.
Starting dirt is generated from a seed in meters, so it doesn't depend on texture resolution.
**Revisit if:** we need many large, high-resolution surfaces at once.

## 5. Import Babylon.js from the package root

**Why:** Deep imports (`@babylonjs/core/Meshes/...`) shrink the bundle but can silently drop
features unless you add the right side-effect imports, which is a confusing trap early on.
Cost: the build is ~6.7 MB minified (~1.5 MB gzipped). **Revisit:** before a public release.

## 6. Babylon Inspector as a dev-only dependency

**Why:** The Inspector (click a mesh, tweak a light, view a texture) is one of the best ways to
learn and debug Babylon scenes; we'll use it to look at the dirt texture in Milestone 6. It's
loaded with a dynamic `import()` only when `import.meta.env.DEV` is true, so production builds
don't include it. The CDN version doesn't work with npm-installed Babylon.
**Cost:** ~600 MB in `node_modules` (mostly an icon package), on dev machines and CI only.
**Revisit if:** installs or CI get noticeably slow.

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
from a few lines each, so moving the house or resizing the driveway is a one-number change
with instant live reload. No 3D modeling tool or asset pipeline needed yet.
**Revisit when:** we want real art. Then model in Blender and load `.glb` files, keeping
the driveway (and anything cleanable) as separate meshes with clean UVs.

## 11. Dirt drawn by a material plugin

**Why:** `DirtMaterialPlugin` adds ~10 lines of shader code to Babylon's standard material,
so dirty surfaces keep normal lighting and shadows. The dirt grid is uploaded as a one-byte-
per-texel texture with mipmaps (~0.1 ms per upload). The alternative, coloring an RGBA texture
on the CPU, is simpler but can't add wetness or sharp detail later without a rewrite.
**Uploads (v0.2):** each grid tracks the rectangle that changed, and wetness also tracks the
area that might still be wet, so drying and uploads scale with what you're spraying, not with
total surface size (`updateTextureData` uploads just that rectangle, then regenerates mipmaps).
**Gotcha:** the plugin must request UVs (`_needUVs`, `MAINUV1`) because the material has no
other textures. `RawTexture.CreateRTexture` defaults to float data, so pass the byte type.
Values that change every frame (the highlight) must be set in `hardBindForSubMesh`, which
Babylon only calls if the plugin sets `registerForExtraEvents = true` before enabling.

## 12. Two-ray aiming and distance falloff

**Why:** The crosshair ray (from the camera) decides _what_ you aim at; a second ray from the
nozzle to that point is the actual water. This keeps third-person aiming intuitive while
letting walls and props block the spray realistically. With distance, the spot widens and
weakens linearly; beyond 6 m nothing happens. Because most of the driveway is a light film,
a wide, weaker spray (2–4 m) clears it fastest, while getting close gives full strength for
tire tracks, corners and oil stains. That choice is the mechanic.
**Tuning (Milestone 10):** a simulation of a player sweeping rows at 1.5 m/s showed the first
numbers needed ~7.5 min of _perfect_ play to finish. With `cleanRate: 3`, `nozzleRadius:
0.08`, `spreadPerMeter: 0.09`, one pass at 2.3 m clears ~90% and perfect play finishes in
~2.4 min (a real player: ~4–5 min), with heavy dirt still needing extra passes.

## 13. Feedback ("juice") without asset files

**Why:** Placeholder art shouldn't block feel. Wetness lives in the dirt texture's second
channel (red = dirt, green = wetness), so one upload covers both; the shader darkens wet spots
and adds a sky sheen and sun glints. Particle and beam textures are drawn with the 2D canvas
API at startup. Sounds are synthesized with the Web Audio API: filtered noise for water,
random clicks for grit, oscillators for the engine. A pure `audioMix()` decides the volume of
each layer from the washer's state, so the sound design rules are readable and tested.
**Revisit when:** we want richer sound. Swap in CC0 recordings (e.g. from Freesound) behind the
same four layers, and list them in `CREDITS.md`.
**Gotcha:** browsers block audio until the player interacts, so the audio graph is built on
the first click.

## 14. A job is done at 98%

**Why:** Hunting the last invisible specks is the least fun part of cleaning games. At 98%
(`config.job.completeAt`) the job completes and leftover dirt fades away in about a second,
which feels like a reward instead of a chore. The bar shows progress relative to that
threshold, so it reads 100% exactly at completion. Holding `F` highlights anything still
counted as dirty, for players who want to find what they missed. The timer starts at the
first spray so walking around first doesn't count. `R` only restarts after completion, so a
stray keypress can't wipe your progress.
**Progress is weighted by starting dirt (v0.2):** a spot counts for as much dirt as it started
with, once it's fully clean. Counting spots equally let players reach 98% without touching
the oil stains (only ~1% of the area); weighted, the stains are ~3% of progress and heavy
grime makes the bar jump.

## 15. Tuning panel ships with the game (behind `T`)

**Why:** Feel is found by playing, not by editing numbers and reloading. The lil-gui panel
(MIT, ~30 KB) edits `config` live; most systems already read it every frame, and the few that
copy a value at startup (camera FOV, master volume, job threshold) get an onChange hook. It's
included in production builds, hidden until `T`, so tuning works on the live site too.
"Copy changes" copies only the edited values as JSON, ready to paste into `config.js` (or
into a Copilot chat) to make them the new defaults. Nothing is saved between reloads, so
`config.js` stays the single source of truth.

## 16. Dirt types: tough dirt needs a strong spray

**Why:** "Get closer for tough dirt" needed teeth. Each texel has a dirt type, and each type has
a rule: the spray's force at that texel (strength by distance × the spot's soft falloff) must
exceed `minStrength` to lift it at all, and `rate` scales how fast it comes off after that.
Grime: `{ 0, 1 }`. Moss: `{ 0.65, 0.9 }` after the v0.2 tuning pass (`config.cleaning.moss`,
was `{ 0.7, 0.6 }`), so it resists from more than ~2.9 m and only the strong middle of the spot
lifts it. When the spray hits moss it can't
lift, the HUD says so, so it never feels like a bug. Types live in the texture's blue channel
for drawing (green instead of brown).
**Revisit when:** adding more types (e.g. paint, rust). The rule table already supports them.

## 17. A flat fan you can turn, with angle-aware footprints

**Why:** A round spot made every stroke the same. Real nozzles spray a flat fan, and turning it
is a real technique. The fan keeps the area of a round spot of the same radius, squashed by
`fanFlatness` (0.45). Where it lands is computed properly (`sprayFootprint`): each fan axis is
followed along the spray onto the surface, so hitting at a low angle stretches the footprint
(capped by `maxStretch`), and `density` spreads the same water more thinly over the bigger
area, so angled spraying isn't an exploit. Dirt and wetness share one ellipse walker
(`brushShape.js`), and strokes space stamps by how far the ellipse reaches in the direction of
travel. Each surface finds its texture's u/v directions from its own mesh.
**The choice:** sweeping side to side with the fan **upright** clears a tall, shallow swath
(fast coverage, good for film); **flat** gives a shorter, deeper one (better for grime).
Neither is simply better. `Q` turns it, and a bar through the crosshair shows which way.
**Tuning:** the angle-aware footprint spreads a typical 30° spray over ~2× the area, which
halved per-pass cleaning, so `cleanRate` went from 3 to 4.5 (and to 5.5 in the Milestone 18
pass, once weighted progress and moss had lengthened jobs). First pass (simulated): flat
~75% (≈ v0.1), upright ~52% but ~40% faster coverage. Pointing straight at dirt is now
stronger than before, which fits "get closer, aim straight".

## 18. Textured cleanable surfaces: the fence and the patio

**Why:** The fence is merged into one mesh for collisions and one draw call, so its cleanable
side is a separate flat panel (a plane with clean UVs) placed just in front of it. Posts stick
out through it. Each surface definition can set its own detail (`texelsPerMeter`) and dirt
colors (`palette`: silvery weathering and mud on wood instead of concrete dust), and belongs
to a `job`. The clean look comes from the material: a warm wood color times a neutral grey
board texture drawn in code, so dirt blends over the same boards. On upright surfaces
(detected from the texture's u/v directions) some water trickles down as thin wet streaks.
The patio works the same way on the ground: pavers drawn in code with a stone color, and
`paverAt()` shared by the texture and the dirt so grime and moss sit exactly in the joints.
The sun was raised to ~60° (and dimmed slightly to keep sun + fill ≈ 1) so the house's shadow
no longer covers most of the patio.
**Gotchas:** (1) Cloning a material also clones its textures, and a cloned canvas texture
starts blank, so a surface's material is only copied if another mesh shares it. (2) A
misnamed texture parameter silently produced `NaN` sizes and no boards; the texture helper
now throws on bad layout numbers. Both were found by inspecting the data (material
readiness, then the canvas pixels), after two plausible shadow theories turned out wrong.

## 19. Jobs are data, played in order

**Why:** A second job should be a few lines in the level, not new code. `createBackyard()`
returns a list of job definitions (title, hint, done text, and what it `unlocks`), and each
cleanable surface names its job. `JobList` (pure, tested) plays them in order: you move on with
`N` only after finishing, `R` redoes the current job, and after the last one `R` starts over
from the beginning. The backyard job unlocks the side gate, which physically blocks the
backyard until then, making the unlock something you can see and walk through.
**Testing gotcha:** when stepping the game by hand in a test (the embedded browser throttles
hidden tabs to ~1 fps), render every step. Babylon caches world positions per rendered frame,
so skipping renders makes collisions read stale positions and walls look leaky.
