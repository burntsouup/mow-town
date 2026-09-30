# Roadmap

Planning lives here instead of GitHub Issues: one list, versioned with the code.
Check items off in the same PR that completes them.

## v0.1 — "Mowing feels satisfying" ✅ (released as 0.1.0)

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

### 7. Tuning + playtest pass ✅

- [x] Pacing simulation (how long does a good run take?)
- [x] Tuning pass, findings recorded here
- [x] Playtest

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

### v0.1 success checklist ✅ (confirmed in playtest)

- [x] Pushing the mower feels heavy but responsive
- [x] It's instantly readable what's cut and what isn't
- [x] Stripes look good and reward neat rows
- [x] Sound and particles make cutting feel physical
- [x] Finishing the lawn feels like a reward

## Deliberately not in v0.1

Money, a shop, upgrades, riding mowers, multiple lawns, a string trimmer, bagging clippings,
regrowth, multiplayer.

## v0.2 — "A little mowing business" ✅ (released as 0.2.0)

Goal: mow for money, spend it on a better mower, and take on a bigger yard. Earning,
upgrading and then feeling the difference should be satisfying.

The loop: mow your front lawn and get paid (plus a tip for neat stripes), trim the edges the
mower can't reach (another tip), buy a wider deck, then push the mower next door and mow the
neighbors' bigger lawn.

### 1. Money ✅

- [x] Each job pays a set price; the money shows on screen and counts up when you're paid
- [x] A tip for neat stripes: how parallel your rows are, patch by patch (a row and the next
      one mowed the other way count as parallel), so tidy rows pay in any direction
- [x] The "Job complete" card becomes a receipt; redoing a lawn (`R`) pays again

**Findings:** neatness scores (1.5 m patches): the tidy pacing bot gets 0.95–0.96 on the real
front lawn (turns and obstacles included), rows wobbling ±20° still ~0.9, laps around the
lawn ~0.8, and a random scribble ~0.35–0.45. So the tip starts at 0.6 and is whole at 0.9.
The open question for the playtest: cleanup passes at odd angles overwrite the direction
underneath, so a real, careful run may score lower than the bot.

### 2. String trimmer ✅

The biggest open question about feel, so it comes early.

- [x] `Q` takes it out or puts it away; hold the mouse button to run it
- [x] Aim by looking (like p-washer's nozzle), within about an arm's length
- [x] A small round cut that gets where the deck can't, in fixed 60 Hz ticks; trimmed grass
      has no stripe lean
- [x] Its own buzz and flying grass bits

**Findings:** aiming by looking needed its own camera. From the walking view, the ground in
the middle of the screen is 2.5 m or more away (out of reach), and a head straight in front
of you hides behind your body. So carrying the trimmer switches to a higher, closer view with
the player see-through, which tips down to the head when you take it out and won't look up
past the horizon meanwhile. That higher camera ended up inside the tree's leaves when
trimming around the trunk, so canopies now fade while they're in the way. The trimmer only
cuts grass that still needs it, so waving it over neat stripes doesn't smudge them. The sound
can only be judged in the playtest.

### 3. Edges ✅

- [x] A narrow strip along every border and obstacle counts as edges, with its own bar
- [x] At 98% the game still tidies up the middle, but leaves the edges for the trimmer
- [x] A "crisp edges" tip once the edges are done

**Findings:** counting every border as an edge made the edges 15% of the lawn, and the mower
cuts nearly all of that anyway (it rolls right over the sidewalk, driveway and walkway), so
the trimmer had nothing to do. Now the edges are only where you'd really trim: 25 cm along
the fence and around the tree, flower bed, toys and mailbox post, about 4% of the front lawn
(7 m²). They count as done at 97%. The "Job complete" card sat in the middle of the screen
while you trimmed, so it now tucks away 6 s after the aerial view and pops back up when a tip
comes in. Still open for the playtest: how much of the edges the mower leaves in real play (a
bot pushing the real mower got wedged against the fence and the flower bed too often to say).

### 4. First upgrade ✅

- [x] A sale stand by the garage sells a 30-inch deck; `E` to buy it
- [x] About 40% more lawn per pass and wider stripes, but bulkier: it can't get as close to
      things, so the trimmer matters more
- [x] The pacing bot runs with both decks

**Findings:** a tidy run of the front lawn takes 3.0 minutes with the 30-inch deck instead of
4.3 (15 rows instead of 22, 29% faster), and still earns the whole neat-stripes tip. The deck
costs $50: the front lawn's price plus one tip, so a tidy first job pays for it. It's fitted
to your mower wherever the mower is, so there's no fetching it first. The stand shares `E`
with the mower; if you're holding the mower or standing by it, `E` is for the mower.

### 5. Next door ✅

- [x] A second house with a bigger L-shaped lawn (~1.5× the front lawn) and more to mow
      around; its long grass is visible from the start
- [x] The second job: push the mower over along the sidewalk
- [x] Sized so it takes about as long with the new deck as the front lawn did with the old

**Findings:** the Parkers' lawn is 192 m² (1.35× the front lawn by area, 1.44× by the grass
to cut, since it's a little shaggier), behind a low hedge to the right of our driveway: a
wide front yard with a tree, an island flower bed, a birdbath and a garden gnome, and a side
yard running back between the houses to a shed. A tidy run takes 4.2–4.3 minutes with the
30-inch deck, the same as the front lawn with the 22-inch one, and 5.9 minutes without the
upgrade. The pacing bot had to learn rows that stop short for the L. Every lawn stays live:
you can mow next door before it's your job (it just won't pay until it is). From our
driveway, their long grass reads as a solid carpet (the blades fade with distance), so it's
visible but not obviously shaggy.

### 6. Tuning + playtest ✅

- [x] Prices and pay, pacing bands for each lawn and deck, findings recorded here
- [x] Frame rate with two lawns on screen; cap the resolution on high-refresh screens
- [x] Playtest

### v0.2 pacing (simulated)

The tidy bot from v0.1 (straight rows, 8 cm overlap, turning on the spot, ignoring obstacles),
so a best case: expect a real run to take roughly 1.5× longer. Each lawn has its own band in
`pacing.test.js`.

| Lawn                         | 22-inch deck                  | 30-inch deck         |
| ---------------------------- | ----------------------------- | -------------------- |
| Front lawn (142 m²)          | 4.3 min (4.7 with short rows) | 3.0 min (29% faster) |
| Parkers' lawn (192 m², an L) | 5.9 min                       | 4.2–4.3 min          |

### v0.2 tuning findings

- Money: the front lawn pays $40 and the Parkers' $65, with up to $10 each for neat stripes
  and crisp edges; the deck costs $50. A tidy first job affords it with either tip, and the
  edges tip can always be earned after the lawn is done, so even sloppy stripes can get
  there by trimming. The first time you can afford the deck, a message points out the stand.
- Frame rate: at 2880 × 1800 on an M3 MacBook, a view full of lawn takes ~10 ms (the grass
  ~4.6 ms of it). Both lawns in view costs less than one filling the view, since each covers
  less of the screen. At 1.5 pixels per CSS pixel it's ~6.6 ms, and at 1× ~4.7 ms. So on
  screens faster than 75 Hz (8.3 ms per frame at 120 Hz) it now renders at 1.5×; the FPS
  readout shows which.
- Open for the playtest: how much of the edges the mower leaves, how neat a real run scores,
  whether aiming the trimmer feels precise, the trimmer's sound, and the walk next door.

### v0.2 success checklist ✅ (confirmed in playtest)

- [x] Getting paid feels good, and the tip makes neat stripes worth the effort
- [x] Trimming is quick and satisfying, not a chore
- [x] The wider deck feels like a clear upgrade
- [x] The neighbors' yard feels like a step up, not a slog

## Deliberately not in v0.2

Saving (money and the upgrade reset when you reload), more than one upgrade, a riding mower,
regrowth, time pressure or client ratings, bagging clippings, multiplayer.

## v0.3 — "Looking good"

Goal: the game looks like one charming little toy world, and you play as your own fuzzy
critter.

Art direction, "soft toy suburbia": chunky, rounded shapes (soft-edged boxes, pill-shaped
hedges, puffy trees), a warm late-afternoon sun with soft shadows, and a rich but harmonious
palette. Only two things are fuzzy, the grass and you, so they stand out. The character is
our own design (working name "Tuft"), inspired by the friendly monsters in Microsoft Reflect
but not copied from them: a round, two-tone fur body drawn with the same shells as the grass,
big googly eyes, eyebrow tufts, noodle limbs with mitts and sneakers, all animated in code.

Budget: 120 fps at the 1.5× render on an M3 MacBook, 60 fps everywhere else. Anything too
expensive gets cut or faked.

### 1. Style test ✅

- [x] New lighting, color grading, sky and palette
- [x] A rounded-shape kit and painted surfaces (concrete, asphalt, mulch, shingles)
- [x] Our front yard restyled with them; frame cost measured; screenshots for a checkpoint

**Findings:** lighting and color alone didn't fix "basic": the shapes did. Framed windows
with shutters, a panelled garage door, shingles, a picket fence, puffy bushes and textured
paths changed the look far more than the grade. So did filling the world in: an empty green
plane to the horizon read as a test level, and a row of houses across the street plus a
treeline made it a neighborhood. Because the house, tree, flower bed and mailbox are shared
pieces, next door and the backdrop got the new look for free. Color grading runs inside the
materials (no extra full-screen pass); the sky skips it so its colors come out as picked.
The first pass had 243k vertices, mostly tiny flowers (smooth puffs are expensive), so small
puffs now use fewer triangles and flowers cast no shadows (141k in the playable area, plus
the backdrop, which casts no shadows so the sun's shadow map doesn't stretch). In the
embedded browser's timing test, frames cost the same as v0.2 (within noise); the real check
is the FPS readout on a 120 Hz screen in the playtest.

### 2. Tuft ✅

- [x] A round, furry body, a face (eyes that glance around and blink, eyebrow tufts) and
      noodle arms and legs with mitts and sneakers
- [x] Walking, pushing and trimming, animated in code; replaces the orange capsule
- [x] A checkpoint to look at Tuft before building on it

**Findings:** fine, dense fur (90 strands per meter, 4.5 cm long) read as a fuzzy texture,
like a kiwi fruit; longer, sparser strands (55 per meter, 7 cm) with brighter roots read as
soft fur. The first pupils sat just inside the eye whites, so the eyes looked blank; and
eyebrows tilted inward read as cross, so they tilt the other way now. A walk that looks
planted needs the feet to slide back in a straight line while down (not on a curve), then
swing forward in an arc. From the mowing camera (behind and above), Tuft still hides the
mower, so Tuft goes see-through there as the capsule did, and the face fades first so no
eyes show through the back of its head. Glancing around and celebrating come in milestone 5.

At the checkpoint, the first Tuft was "not quite right": it should look polished, like the
Reflect monsters. The fixes: much finer strands (150 per meter) with soft, blurry edges,
blended layer over layer instead of cut out (spiky, grainy fur became fluffy); glossy eyes
with an iris and sparkles; fuzzy eyebrows; rounder, rubbery limbs, mittens with thumbs and
detailed sneakers. Blending exposed that Babylon's "update alpha" shader hook only exists for
materials with a diffuse texture, so the fur's alpha was never applied (it looked fine only
because it was opaque). Lighting every one of 20+ layers with Babylon's full lights and
shadows was expensive, so the fur lights itself (a wrapped sun plus sky and ground light, and
one ray a frame to tell whether Tuft stands in shade). Fading needs care too: 16 faint layers
still stack up to nearly solid, so each layer gets only its share of the opacity.

At the second checkpoint, the body was "too circular; it should be more fluid". An egg looks
like a ball once it's furry, so the body became a soft gumdrop: fuller low down, narrower on
top, flatter underneath, with gentle lumps. Any sharp corner in the shape's math shows up as
a crease in the fur, so every curve in it is smooth. It moves like jelly too: it sways back
when you set off, sloshes forward when you stop, leans into turns and ripples a little as it
walks, using springs that overshoot and settle. While reshaping it, we found the solid skin
under the fur hadn't been drawn at all since the polish (a divide by zero in the fur layers
put it at "not a number"), which is why the fur looked thin and seamy from some angles. And
the eyebrows now sit on the head: the top slopes back, so brows placed straight above the
eyes floated in front of it.

### 3. Wardrobe and saving ✅

- [x] Fur colors, hats, glasses, gloves, shirts, shorts and shoes
- [x] A customize screen from the start menu, and a closet at your front door
- [x] Your outfit, money, deck and current job are saved between visits

**Findings:** eight fur colors; a cap, beanie (with a furry pompom), bucket hat and sun hat;
round specs, sunglasses and star shades; garden gloves; a T-shirt, striped tee and tank top;
shorts; sneakers or rain boots; eleven colors for all of them, and a "Surprise me" button.
Clothes on a blob are tricky: Tuft has no neck or waist, so clothes are cut from the body's
own surface and pushed out a little, and the fur under them is hidden in the shader (it
poked straight through otherwise). The first shirt stopped at Tuft's widest point with the
fur overhanging it, like a muffin in its case; now it sits nearly as far out as the fur and
its neckline dips at the front and rises round the back, so it wraps over the shoulders.
Hats hug the head, tipped back so they clear the eyebrows. Every style is built once and
switched on and off, so changing clothes is instant. The closet has its own camera that
circles Tuft, and Tuft turns to face you first, so that camera lands where the view was
already clear (not inside the house). Saving is small: money, the deck, which job you're on
(it starts fresh) and your outfit; lawns from jobs you'd finished come back mowed.

### 4. Restyle the world

- [ ] The mower, the trimmer, the sale table, next door and the HUD, in the new style

### 5. Character juice

- [ ] A jump and a wave when a job's done, blinking and looking around, footstep puffs and
      sounds

### 6. Tuning + playtest

- [ ] Frame rate on the budget above, findings recorded here
- [ ] Playtest

### v0.3 success checklist

- [ ] The game looks charming, not basic, from every angle you'd play from
- [ ] Tuft is lovable, and fun to watch walking, pushing and trimming
- [ ] Dressing Tuft up is fun, and it's still dressed that way next time
- [ ] It runs as smoothly as v0.2

## Deliberately not in v0.3

New machines or lawns, buying clothes with money (starter items are free), saving the state
of half-mowed lawns.

## Later (ideas, not commitments)

- **v0.4, "Bigger machines":** a riding mower, a large property built for it, and a real
  shop with more than one thing in it
- **v0.5, "Mow-town":** a street of clients, jobs you pick, lawns that grow back day by day,
  and a reputation that unlocks bigger clients
- **v0.6, "Pride in the craft":** clients asking for patterns, bagging or blowing clippings,
  an edger, a golden-hour aerial view
- **v0.7, "Co-op":** two players on one lawn (why cutting runs in fixed, deterministic steps)
- **v1.0, "A full summer":** about a dozen properties, 5–6 tools and upgrades, a big finale,
  an art and sound pass, settings and gamepad support
