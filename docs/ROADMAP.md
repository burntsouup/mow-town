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

### 3. GrassGrid core (pure JS, test-first) ✅

- [x] Grass height per texel (plus a lawn mask and a density, for thick patches)
- [x] The mower deck's footprint cuts along its path (stroke interpolation, no gaps at speed)
- [x] A mow-direction channel, for stripes
- [x] Weighted progress and changed rectangles (partial texture uploads)
- [x] Cutting runs in fixed 60 Hz steps (deterministic, ready for multiplayer later)
- [x] The HUD shows mowing progress; the job timer starts with the first cut

### 4. Push mower ✅

- [x] `E` to grab and let go; heavy handling with momentum
- [x] The deck cuts the grass beneath it
- [x] Collisions with the house, trees and props
- [x] Two steering schemes, selectable in the tuning panel: mouse-steer vs `A`/`D` turn
- [x] A mowing camera: further back and higher, with the player see-through

**Findings:** right behind the player, the mower hid completely behind their body (the
camera, player and mower line up, and no reasonable camera height fixes that), so the player
fades to 45% while mowing. Babylon ignores collision moves under 1 mm, so a mower starting to
roll never got going until tiny moves skipped the collision check. Low obstacles don't stop
the player (Babylon slides them up and over, then their feet get pinned back down), so the
parked mower's invisible blocker is 1.6 m tall.

### 5. Juice ✅

- [x] View-dependent stripes from the mow direction (mowed blades also lean that way)
- [x] Clippings particles, thrown from the side chute in proportion to the grass cut
- [x] Engine sound with load and bogging, plus a blade-cutting layer and clunks
- [x] Thick grass slows the mower (a few seeded thick patches: taller, darker, chunkier)

**Findings:** stripes read well even as a first pass, and flip light/dark as you walk around
them. Thick patches look a bit like shadows from some angles; revisit their look after the
playtest. Can't judge the engine sound headlessly beyond levels (RMS ~0.03 idle, ~0.05
cutting, peaks under 0.2): the playtest decides.

### 6. Lawn job ✅

- [x] A bounded front lawn (~142 m²) with a tree, a flower bed and toy obstacles (a ball, a
      toy truck, the mailbox), fenced on the left and edged by a bed along the house
- [x] Progress, completion at 98%, hold `F` to highlight what's left
- [x] An aerial reveal camera that shows off the stripes (also on `V` any time)
- [x] `R` to mow it again

**Findings:** from the aerial view the stripes are the star: bold and clean. Straight rows at
0.5 m spacing across the whole lawn reach 100%, and 31 rows left the 24 cm strip along the
driveway uncut (97%), so edges matter. The toys, the mailbox post and the tree leave small
uncut rings the deck can't reach, well inside the 2% slack (and a reason for a string trimmer
in v0.2).

### 7. Tuning + playtest pass

- [x] Pacing simulation (how long does a good run take?)
- [x] Tuning pass, findings recorded here
- [ ] Playtest

### v0.1 pacing (simulated, after tuning)

A tidy bot (`src/lawn/pacing.js`) mows the real 142 m² lawn in straight rows with 8 cm of
overlap, using the real handling, grass and cutting. It turns on the spot and drives through
obstacles, so it's a best case; expect a real run to take roughly 1.5× longer.

| Handling                                | Long rows (22–23)      | Short rows (33–35) |
| --------------------------------------- | ---------------------- | ------------------ |
| First numbers (1.4 m/s, 21" deck)       | 5.8 min                | 6.4 min            |
| Tuned (1.7 m/s, faster turns, 22" deck) | 4.3 min (0.75 turning) | 4.9 min            |

`pacing.test.js` fails if the best case leaves the 3–5.5 minute band.

### v0.1 tuning findings (Milestone 7)

- The first handling took 5.8 minutes of perfect play, so a real player would have needed
  9+ minutes to reach the reveal. Now: push 1.7 m/s (was 1.4), acceleration 2.2 (1.8),
  turning 1.9 rad/s (1.5) with acceleration 8 (6), long grass slows 10% (15%), 22-inch deck.
- Still the biggest open question: a real run is probably ~6 minutes. If that drags, the
  quickest fixes are a smaller lawn (~110 m²) or a wider starting deck (and wider decks make
  a natural first upgrade in v0.2). `V` shows the stripes from above at any time.
- Stripes softened a touch (0.2 → 0.18) with a less neon cut-grass tip; thick patches darken
  less (28%), since they read like shadows.
- Uncut rings the deck can't reach (around the ball, the truck, the mailbox post and the
  flower bed) add up to well under 1% of the lawn, inside the 2% slack.
- Performance: at 2880 × 1800 on an M3, grass costs ~3.4 ms per frame with the lawn filling
  the view. Fine at 60 Hz; on a 120 Hz display it may not hold 120 fps (a pixel-ratio cap would
  be the lever).

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
