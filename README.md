# mow-town

**▶ Play the latest build: https://burntsouup.github.io/mow-town/**

A small, satisfying 3D lawn-mowing game. Grab the mower, push it across a shaggy lawn, and
watch the stripes appear. Built with [Babylon.js](https://www.babylonjs.com/) and plain
JavaScript.

**Status:** v0.1, "Mowing feels satisfying": grab the push mower on the driveway, mow the
fenced front lawn around a tree, a flower bed and some toys, and finish with an aerial view
of your stripes. In progress (v0.2, "A little mowing business"): money, a string trimmer, a
first upgrade and a bigger lawn next door. See [docs/ROADMAP.md](docs/ROADMAP.md)
for what's done and next.

mow-town started as a copy of [p-washer](https://github.com/burntsouup/p-washer) v0.2.0 (a
pressure-washing game), stripped down to its base systems: the game loop, input, camera,
player movement, jobs, tuning panel, HUD, and synthesized audio.

## Controls (current)

| Input         | Action                                              |
| ------------- | --------------------------------------------------- |
| Click         | Capture the mouse and play                          |
| Mouse         | Look around                                         |
| WASD / arrows | Move                                                |
| Shift         | Run                                                 |
| E             | Grab the mower / let go (or buy, at the sale stand) |
| W / S         | Push / pull the mower                               |
| Mouse         | Steer the mower (default: it heads where you look)  |
| A / D         | Steer the mower (with "A / D keys" steering)        |
| Q             | Take out / put away the string trimmer              |
| Hold mouse    | Run the trimmer (its head goes where you look)      |
| Hold F        | Highlight the grass that's left                     |
| V             | View the lawn from above                            |
| N             | Next job (once this one's done)                     |
| R             | Mow it again (once it's done)                       |
| M             | Mute / unmute                                       |
| T             | Tuning panel (live sliders; "Copy changes")         |
| Esc           | Release the mouse                                   |
| `` ` `` (key) | Toggle the Babylon Inspector (dev builds only)      |

**Dev tip:** in dev builds, type `game` in the browser console to inspect the running game,
e.g. `game.scene.meshes` or `game.camera.yaw`.

## Run it locally

Requires **Node 24** (see `.nvmrc`).

```bash
npm install
npm run dev      # opens http://localhost:5173 with live reload
```

| Script            | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Dev server with live reload                              |
| `npm test`        | Run unit tests once (`npm run test:watch` to keep going) |
| `npm run lint`    | Check code for mistakes (ESLint)                         |
| `npm run format`  | Auto-format everything (Prettier)                        |
| `npm run build`   | Production build into `dist/`                            |
| `npm run preview` | Serve the production build locally                       |
| `npm run check`   | Everything CI runs: lint, format check, tests, build     |

## Project layout

```
src/
  main.js              Entry point: creates the Game
  config.js            Every tunable number lives here
  game/                Game loop, keyboard/mouse input, jobs and pay, tuning helpers
  environment/         The level (level.js): our yard, next door, lighting + sky, greybox kit
  player/              The player character (movement.js is the tested, pure part)
  camera/              Third-person camera and the aerial reveal (*Math.js: tested, pure)
  lawn/                The grass: GrassGrid + cutters and neatness (tested, pure), renderer
  mower/               The push mower (mowerMath.js is the tested, pure handling)
  trimmer/             The string trimmer (trimmerMath.js: tested, pure aiming)
  shop/                The sale stand by the garage (shop.js: tested, pure rules)
  audio/               Synthesized sounds (audioMix.js is the tested, pure part)
  effects/             Grass clippings and particle textures drawn in code
  math/                Small pure helpers: seeded noise, rectangles, ground shapes
  ui/                  HTML overlay: HUD, prompts, "click to play", tuning panel
docs/
  ROADMAP.md           Milestones and checklists (our plan)
  DECISIONS.md         Why things are the way they are
```

**Rule of thumb:** files that import Babylon.js are glue. Game logic and math go in "pure"
files (no Babylon imports) with a `*.test.js` file next to them.

## How we work

1. Branch off `main` for each roadmap milestone: `git switch -c m2-grass-spike`
2. Commit small, working steps with short imperative messages ("Add grass shells")
3. Push and open a pull request. CI runs lint, format check, tests, and build
4. Squash-merge when green. `main` auto-deploys to GitHub Pages in about a minute
5. Play the deployed build, write down what feels bad, repeat

`main` should always be playable.

## License

Code: [MIT](LICENSE). Third-party libraries and assets: see [CREDITS.md](CREDITS.md).
