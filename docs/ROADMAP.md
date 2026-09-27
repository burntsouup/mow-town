# Roadmap

Planning lives here instead of GitHub Issues: one list, versioned with the code.
Check items off in the same PR that completes them.

## v0.1 — "Mowing feels satisfying"

Goal: one front lawn, one push mower. After a few minutes of play, mowing the lawn should
feel good: heavy push, crisp cut, stripes appearing behind you. See the success checklist at
the bottom.

Priorities, in order: fun core interaction > visual polish > technical sophistication >
feature count.

### 1. Strip & rename ✅

- [x] Remove the pressure washer, dirt, moss, fence, patio and washing jobs from p-washer v0.2.0
- [x] Keep the base systems: game loop, input, camera, player, jobs, tuning panel, HUD, audio
- [x] Rename to mow-town (package, page title, HUD, README)
- [x] Fresh roadmap and decisions log (base decisions carried over)
- [x] `.github/copilot-instructions.md` with the project conventions

### 2. Grass rendering spike ✅

Biggest risk first: can we draw a lawn that looks cuttable, at a good frame rate?

- [x] Shell texturing: 24 alpha-tested layers over the lawn, driven by a height texture
- [x] A debug brush that cuts the grass where you walk (hold `C`)
- [x] FPS check on the dev machine. Fallback if too slow: instanced blades (not needed)

**Findings:** on an M3 MacBook at Retina resolution (2880 × 1800), the grass costs about 2 ms
per frame with 24 shells and ~2.6 ms with 48; the game holds 60 fps. Cut grass reads clearly
(shorter, brighter). Individual blades are visible within a few meters; farther away the lawn
fades into a solid carpet (by design, to avoid shimmer), so stripes will have to carry the
look at a distance.

### 3. GrassGrid core (pure JS, test-first)

- [ ] Grass height per texel
- [ ] The mower deck's footprint cuts along its path (stroke interpolation, no gaps at speed)
- [ ] A mow-direction channel, for stripes
- [ ] Weighted progress and changed rectangles (partial texture uploads)
- [ ] Cutting runs in fixed 60 Hz steps (deterministic, ready for multiplayer later)

### 4. Push mower

- [ ] `E` to grab and let go; heavy handling with momentum
- [ ] The deck cuts the grass beneath it
- [ ] Collisions with the house, trees and props
- [ ] Two steering schemes, selectable in the tuning panel: mouse-steer vs `A`/`D` turn

### 5. Juice

- [ ] View-dependent stripes from the mow direction
- [ ] Clippings particles
- [ ] Engine sound with load and bogging
- [ ] Thick grass slows the mower

### 6. Lawn job

- [ ] A bounded front lawn (~140 m²) with a tree, a flower bed and toy obstacles
- [ ] Progress, completion at 98%, hold `F` to highlight what's left
- [ ] An aerial reveal camera that shows off the stripes
- [ ] `R` to mow it again

### 7. Tuning + playtest pass

- [ ] Pacing simulation (how long does a good run take?)
- [ ] Tuning pass, findings recorded here
- [ ] Playtest

### v0.1 success checklist

- [ ] Pushing the mower feels heavy but responsive
- [ ] It's instantly readable what's cut and what isn't
- [ ] Stripes look good and reward neat rows
- [ ] Sound and particles make cutting feel physical
- [ ] Finishing the lawn feels like a reward

## Deliberately not in v0.1

Money, a shop, upgrades, riding mowers, multiple lawns, a string trimmer, bagging clippings,
regrowth, multiplayer.

## Later (ideas, not commitments)

- **v0.2:** money, a first upgrade, a bigger property, and a string trimmer for the edges
- **v0.3:** a riding mower and large properties
- **Later:** co-op multiplayer (why cutting runs in fixed, deterministic steps)
