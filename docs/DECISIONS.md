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

## 24. The string trimmer: aim by looking, cut only what's long

**Why:** The mower can't reach right up to fences, trunks and posts, and a second tool that
can is a small, different kind of fun: precise work after the broad strokes. `Q` takes it out
(no pickup to lose, and grabbing the mower puts it away), and holding the mouse button runs
it. Aiming works like p-washer's nozzle: where your view meets the ground
(`trimmerMath.groundAim`), kept within arm's reach (0.6–1.3 m) and swung there at a human
speed, with your body turning to face the head. It cuts a 34 cm circle (a 13-inch trimmer) at
fixed 60 Hz ticks (`TrimCutter`, like `DeckCutter`), but only grass that still needs cutting:
waving it over neat stripes leaves them alone, and trimmed grass has no mowing direction, so
it neither leans nor counts toward stripe neatness.
**The view:** carrying it switches the camera to a trimming view (higher, closer, the player
at 55%): from the walking view the head sat out of reach of the middle of the screen, or
hidden behind your body. It tips down to the head as you take it out, and won't look above
the horizon meanwhile (`camera.trimming.minPitch`).
**Gotcha:** a higher camera can sit inside a tree's canopy, which isn't solid, so the
camera's wall check never moves it out. Meshes marked `metadata.seeThrough` fade while the
line from the camera to the player passes through them.
**Revisit when:** the playtest says aiming feels floaty (lower `follow`/`maxSpeed`), or edges
need a different tool (an edger, for a crisp line along paths).

## 25. Edges are what you trim around, and they pay a tip

**Why:** The trimmer needs a job, and it should be the job it has in real life: the strip
along the fence and around the tree, the flower bed, the toys and the mailbox post, where the
mower's deck can't quite reach. `GrassGrid.markEdges` marks lawn within 25 cm of those (the
level's `edgeAt` says which non-lawn spots count; flat paths don't) and tracks their progress
separately. When the lawn completes at 98%, the leftovers in the middle shrink away as before
(#12), but the edges stay long for the trimmer; at 97% they count as done, the rest shrink
away, and a $10 "crisp edges" tip is paid. Trimming first works too: the tip is on the receipt
when the lawn is done. It's a tip, not a requirement, so skipping it is fine.
**Revisit when:** the playtest shows the mower leaving almost nothing along the edges (widen
them, or lower `edgesDoneAt`) or far too much (narrow them).

## 26. The first upgrade is a wider deck, sold at a garage-sale table

**Why:** A wider deck is the upgrade you feel in every pass: more lawn per row, wider stripes,
and a lawn that takes 29% less time (the pacing check runs both decks). It's also a little
worse at something, which keeps the trimmer useful: its bigger collision shape can't tuck in
as close to things. It's sold at a table at the top of the driveway, not from a menu, so
buying it is something you walk up to and do, like grabbing the mower. The price ($50) is the
front lawn's pay plus one tip. The deck goes onto your mower wherever it is (`fitDeck`
changes the cutting area, the collision shape and the model). The rules (`shop.js`) are pure
and tested; the stand's sign is a `DynamicTexture` painted with the canvas API.
**Revisit when:** there's more than one thing to buy (a shop menu, or a shelf of items), or
upgrades need saving.
**Gotcha:** `E` means both "grab the mower" and "buy". The shop runs before the mower each
frame and backs off whenever the mower would take the key (you're holding it or standing by
it), so one press never does both.

## 27. Next door: a second, bigger lawn on the same street

**Why:** The upgrade needs somewhere to prove itself, and "mow-town" wants a street of
clients, not separate levels. So the Parkers' lawn is next door, in the same scene: you push
the mower down the driveway, along the sidewalk and past their hedge. It's an L (a wide front
yard plus a side yard between the houses), so you choose which way to run your rows (and
stripe neatness is judged in patches, #23, so running each part its own way still pays). It's
sized so the 30-inch deck mows it in about the time the 22-inch deck took on the front lawn:
the upgrade lets you take on more in the same time.
**How:** the level is built from shared pieces (`props.js`: houses, trees in mulch rings,
flower beds, mailboxes), with each yard's layout as pure data (`frontYardLayout.js`,
`nextDoorLayout.js`). Each job names its lawn; the Game keeps every lawn live, so the mower
and the trimmer cut whichever one they're on, while progress, the highlight and the aerial
view (zoomed out a bit for bigger lawns, `revealScale`) follow the current job. After the
last job, `R` regrows everything and starts over; money and upgrades stay yours.
**Revisit when:** a street has many lawns (only build the shells near you), or jobs need to
be offered rather than played in order.
**Gotcha:** a lawn's grass grid covers its bounding box, so an L-shaped lawn's grid (and its
shells) also covers the house beside it. The mask keeps grass out of it, and the house hides
the shells, but the empty part still costs a little memory and drawing.

## 28. A softer render on fast screens

**Why:** Filling the screen with shell-textured grass is the most expensive thing we draw.
At full Retina size (2880 × 1800 on an M3 MacBook) a view full of lawn takes ~10 ms, fine for
60 Hz (16.7 ms) but over budget for 120 Hz (8.3 ms). Rendering at 1.5 pixels per CSS pixel
instead of 2 roughly halves the pixels (~6.6 ms) and is hard to tell apart in motion. Before
the game loop starts, `Game.start` times a few idle frames to find the refresh rate
(`display.js`: the median frame time, and only while the tab is visible, since background
tabs are slowed on purpose), and above 75 Hz it caps the resolution at 1.5×. The FPS readout
shows the ratio; the tuning panel can change both caps.
**Revisit when:** a slower computer can't hold 60 fps (lower the cap there too, or adapt it
while playing), or the grass gets cheaper.

## 29. Soft toy suburbia, built in code

**Why:** v0.2 played well but looked like a test level. Before adding machines and lawns,
we settled the art style, so everything after is built once, in the final look. The
direction: chunky, rounded shapes, a warm late-afternoon sun, soft shadows, and a rich but
harmonious palette, with only two fuzzy things (the grass and the character). It's all made
in code, like before: `roundedBox` (pure, tested) for soft-edged shapes, smooth "puffs"
shaded darker underneath with vertex colors, contact shadows under things on paths, and
tileable surfaces painted with the canvas API (`surfaceTextures.js`, seeded so they're the
same every load). Shared pieces in `props.js` (houses, trees, flower beds, mailboxes) mean
every yard picks up the look.
**Color:** Babylon's image processing (ACES tone mapping, exposure, contrast, a warm/cool
color grade, a vignette) runs inside each material's shader, so it costs no extra
full-screen pass. The sky and clouds opt out, so their colors are exactly as picked.
**The backdrop:** houses across the street and a treeline make it a neighborhood, not a
lawn on a plane. They cast no shadows: the sun's shadow map fits every shadow caster, so far
casters would stretch it and blur the shadows up close.
**Gotchas:** meshes can only be merged if they have the same vertex attributes, so
`roundedBox` provides UVs even where nothing uses them. A cloned `DynamicTexture` comes out
blank (#15), so every roof shares one shingle texture, scaled through its UVs. Smooth
icospheres get expensive fast (a subdivision-3 puff is 642 vertices), so small puffs use
fewer subdivisions, unless they're seen up close (`smooth`). A half cylinder (`arc: 0.5`) is
built on its -z side.
**Walls (v0.4 milestone 4):** siding, brick and stone are patterns worked out from each
pixel's world position (`WallPatternPlugin`), not textures: no texture coordinates to line
up across faces or rotated houses, and no pictures to load.
**Props and the HUD (v0.3 milestone 4):** props built outside the level kit (the mower,
the trimmer, the sale table, Tuft's clothes) share `toyMeshes.js`: `roundedMesh`, and a
`plastic` material with a bright, tight highlight, which is most of what makes a shape read
as a toy. The HUD is cream cards with soft shadows, rounded lettering (`ui-rounded`: SF
Rounded on Apple devices), striped progress bars and keycaps, so it belongs to the same
world instead of floating over it as dark glass.
**Revisit when:** code-built art hits its ceiling somewhere it matters (then consider CC0
model packs for props, matched to this palette).

## 30. Tuft: an original fuzzy critter, animated in code

**Why:** A character you can grow attached to (and later dress up) does more for the look
than anything else on screen, and a round, furry body suits this game: fur is the grass's
shell trick again (`furShells`, `FurMaterialPlugin`), and a body with no joints can be
animated in code with no skeleton or rig. Tuft is our own design, inspired by the friendly
monsters in Microsoft Reflect but not copied from them (a gumdrop-shaped two-tone body, googly
eyes, eyebrow tufts, a small smile, noodle limbs, mitts and sneakers; no giant mouth or
medallion).
**How:** strands sit on a 3D grid over the skin (no texture seams), taper, vary in length,
get darker at the roots, and trail a little behind as you move (a vertex offset that grows
toward the tips). Limbs are tubes reshaped every frame along a curve (`limbCurve`); feet slide
back in a straight line while planted (so they stay put on the ground) and swing forward in
an arc (`footOffset`); the body bobs once per step, squashes, breathes when still and leans
in to push. Hands hold the mower's and trimmer's handles (`gripPoints`) while you use them.
**Soft fur:** strands have blurry edges and are blended, layer over layer, over a separate
solid skin. That sorts correctly without any per-frame work because the shells are drawn
from the skin outward with back faces hidden, and the body is round, so the outer layers
always land on top. The fur lights itself (a "wrapped" sun that bends a little round the
edges, plus sky and ground light, and one ray a frame toward the sun to dim it in shade),
because Babylon's full lighting in every layer cost more than the rest of the scene.
**See-through:** fading splits the opacity across the layers (16 faint layers would still
stack up to solid), the skin is drawn before the fur, and the face fades first.
**Shape and jelly:** the body is a gumdrop, not an egg (`bodyPoint`): a furry egg reads as a
ball. Its outline is built from smooth curves only (bell curves and sines), because any kink
(an `abs()`, a `max()`) shows as a crease in the fur; its normals come from two tiny steps
across the surface, so they always match the shape. It sways, sloshes and leans on springs
(`springStep`: pulled toward a target, overshooting a little) driven by how fast Tuft speeds
up, slows down and turns, and the fur shader adds a small ripple.
**Gotchas:** Babylon's `CUSTOM_FRAGMENT_UPDATE_ALPHA` hook only exists in the shader when the
material has a diffuse texture, so the fur's alpha is applied in `CUSTOM_FRAGMENT_BEFORE_FOG`
instead, on `color.a`. `furShells` with 0 shells (the solid skin) once divided 0 by 0: every
vertex was NaN, so the skin silently never drew; a test covers it now.
**Juice:** looking around (`Glancer`) turns the body a little as well as the eyes, since the
camera mostly sees Tuft from behind; cheers (`cheerPose`) are a timeline of hops, arms and
a wave, laid over whatever Tuft was doing; footsteps come from the walk cycle itself
(`footLandings`: the moment each foot's phase reaches its landing point), so puffs and
sounds always match the feet.
**Revisit when:** the walk needs to react to slopes or stairs (plant feet by raycasting), or
Tuft needs more expressions (a mouth that opens).

## 31. Clothes are cut from the body, and hide the fur under them

**Why:** Tuft is one furry blob with no neck, waist or shoulders to hang clothes on, and
modelled clothes would each need fitting by hand. Instead a garment is the band of the
body's own surface between two levels (`bodyBand` in clothesMath.js), pushed out along its
normals: it always fits, and the same code makes shirts, shorts and hat crowns. A level is
`y - tilt × z = height`, so an edge can slope: a shirt's neckline dips below the smile at the
front and rises round the back; a hat sits tipped back to clear the eyebrows. Where clothes
cover the body, the fur shader discards its strands (`FurMaterialPlugin.cover`), or they poke
through the fabric. Sleeves and shorts legs are short tubes that follow the first part of
each limb. What there is to wear is plain data in wardrobe.js; TuftOutfit.js builds every
style once and switches them on and off.
**Gotchas:** a shirt that stops at the body's widest point looks like a bowl with the fur
spilling over it: it has to wrap over the shoulders. Clothes much closer to the skin than
the fur's length make the fur above them overhang.
**Revisit when:** clothes should crease, flap or be bought (a shop with a changing room), or
Tuft gets a new body shape (the levels in `CLOTHES` are tuned to this one).

## 32. Saving: a small save in localStorage

**Why:** coming back to your money, your deck and your dressed-up Tuft makes the game feel
like yours; losing them on every reload made upgrades pointless. localStorage needs no
server and no account. The save is small on purpose: money, what you own, which job you're
on, and your outfit, with a version number. How much of a lawn you'd mowed isn't saved (a
job you come back to starts fresh), which keeps it simple.
**How:** save.js is pure (the storage is passed in) and tested. Reading fixes up anything
odd instead of trusting it (a hand-edited or old save, an item or job that no longer exists)
and returns nothing for saves it can't read. The game saves after you're paid, buy
something, move on to the next job, or finish dressing up. "Start over" resets progress but
keeps your outfit.
**Gotcha:** some private windows throw just for looking at `localStorage`, so it's read
inside a try/catch, and the game plays on without saving.
**Revisit when:** there's more to save (half-mowed lawns, a street of clients), or saves
should move between devices.

## 33. Looking amazing on a frame budget: fakes over screen effects

**Why:** at 120 fps there are 8.3 ms a frame, and the lawn already takes about half. Screen
effects that redraw the scene (ambient occlusion, bloom) cost 2-4 ms each here, because the
grass and fur are many layers deep. So the look comes from cheap tricks that do most of the
same job: shading from each pixel's height in the world (`GroundShadePlugin`: darker toward
the ground and under the eaves), soft dark strips on the ground at the foot of walls, haze
that thickens with the square of distance, a per-pixel sky (`skyColor`, tested) with clouds
painted in code, and reflections of that sky taken once (`createSkyReflections`) for anything
whose material says it's glossy.
**How we measure:** in the dev build's console, render 60 frames back to back with
`game.scene.render()`, then wait for the last one with a one-pixel `readPixels`, at
1440 × 900 and the 1.5× render; the time divided by 60 is the frame cost. The GPU timer queries Chrome
offers on Apple GPUs gave nonsense (25 ms for a 4 ms frame).
**Gotcha:** SSAO in "prepass" mode switched off the materials' own color grading (the scene
came out washed out and too bright), on top of costing the most.
**Revisit when:** there's frame time to spare (a lighter grass for far away, or WebGPU),
then real ambient occlusion and bloom are worth another look.

## 34. Grass: layers everywhere, real blades near you

**Why:** shells (see #16) are cheap for a whole lawn and make cutting just a texture write,
but they look like stacked coins up close, where the player's eye is. Real blades
everywhere would be far too many. So within a few meters of a spot just ahead of you, long
grass is real geometry (`GrassBlades`): one fixed patch of 90,000 five-point blades, placed,
sized and bent in the vertex shader from the same grass map the layers read, so cutting
still works the same way. The patch moves a whole cell at a time, so blades never slide.
Toward its edge the blades thin out while the layers' blades thin in (each keeps a share
set by a random number per blade and the distance), so there's no line where one meets the
other. Mowed grass stays layers: it's short enough to look fine, and swapping it made a ring
show. Both share their colors, stripes and glow (`grassShading.js`).
**Gotchas:** a blade's lighting uses a straight-up normal, like the layers, or the two
don't match. Sines are dear when they run for every layer of every pixel: work out anything
you can after the cheap test that throws most pixels away.
**Revisit when:** frame time allows a bigger patch, or blades should cast shadows.

## 35. Plants: a dark core under real leaves

**Why:** faceted balls read as clay, not leaves. The stylized-tree trick: scatter little
clusters of leaves over a plant's rough shape (a few overlapping balls, `leafCards`), and
light every leaf as if the plant were one ball (its normal points out from the plant's
middle, not along the leaf), so the crowd shades softly from light on top to dark
underneath. A darker core inside fills the gaps. The same code makes trees, bushes, the hedge,
the flower beds' clumps and the treeline on the horizon (fewer, bigger clusters far off).
Flowers are flat, cupped heads with a round middle and petal lobes (`flowerHeads`).
**Gotchas:** leaves as pictures on see-through squares (alpha testing) go wrong with
mipmaps: smaller copies of the texture blur the see-through edges, so whole squares turn
up, dark. Real triangles avoid it and are faster on Apple GPUs, which can't skip hidden
pixels once a shader may throw some away. A see-through canopy of thousands of leaves looks
like broken glass and is slow to blend, so leaves vanish instead of fading
(`seeThroughOpacity: 0`).
**Revisit when:** plants should rustle more (bushes that part as you walk through), or
leaves change color with the seasons.

## 36. Show it off before bigger machines

**Why:** a look at the other lawn-mowing games (September 2026) showed a niche that's real
but has no hit. Lawn Mowing Simulator (2021) is a realistic work sim with real mower brands,
and its sequel launched to mixed reviews; the Roblox mowing games reach millions of players
with simple mow-earn-upgrade loops and short visits; and Grass (Cosmic Dog, not out yet) is
a cozy co-op lawn care game. So co-op alone won't make mow-town stand out, but charm and
moments worth sharing can: Tuft and the wardrobe, lawn art, the aerial reveal, and playing
in a browser from a link. Patterns, a replay, music and a postcard build on what's already
there, and they make everything after them (machines, clients, co-op) shareable too. The
riding mower moves to v0.6.
**Revisit when:** playtests show people don't want to share what they made, or the
cozy co-op games move into the same space.
