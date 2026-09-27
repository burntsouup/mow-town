# p-washer

**▶ Play the latest build: https://burntsouup.github.io/p-washer/**

A small, satisfying 3D pressure-washing game. Walk up to something dirty, blast it clean,
enjoy the before/after. Built with [Babylon.js](https://www.babylonjs.com/) and plain
JavaScript.

**Status:** v0.2: two jobs, a driveway, then a fence and patio out back,
with stubborn moss and a flat-fan spray you can turn. See [docs/ROADMAP.md](docs/ROADMAP.md) for
what's done and next.

## Controls (current)

| Input         | Action                                         |
| ------------- | ---------------------------------------------- |
| Click         | Capture the mouse and play                     |
| Mouse         | Look around                                    |
| WASD / arrows | Move                                           |
| Shift         | Run                                            |
| E             | Pick up the pressure washer (when close)       |
| Hold click    | Spray                                          |
| Q             | Turn the fan of water (upright / flat)         |
| Hold F        | Highlight the dirt that's left                 |
| N             | Next job (after finishing one)                 |
| R             | Redo the job (after finishing it)              |
| M             | Mute / unmute                                  |
| T             | Tuning panel (live sliders; "Copy changes")    |
| Esc           | Release the mouse                              |
| `` ` `` (key) | Toggle the Babylon Inspector (dev builds only) |

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
  game/                Game loop, keyboard/mouse input, shared helpers
  environment/         The level: layout (Backyard.js), lighting + sky, greybox kit, textures
  player/              The player character (movement.js is the tested, pure part)
  camera/              Third-person camera (cameraMath.js is the tested, pure part)
  cleaning/            Dirt and wetness grids, patterns, the dirt shader, CleaningSystem
  pressure-washer/     The machine, the spray gun, aiming, water beam and particles
  audio/               Synthesized sounds (audioMix.js is the tested, pure part)
  ui/                  HTML overlay: HUD, prompts, "click to play", tuning panel
docs/
  ROADMAP.md           Milestones and checklists (our plan)
  DECISIONS.md         Why things are the way they are
```

**Rule of thumb:** files that import Babylon.js are glue. Game logic and math go in "pure"
files (no Babylon imports) with a `*.test.js` file next to them.

## How we work

1. Branch off `main` for each roadmap step: `git switch -c m2-greybox`
2. Commit small, working steps with short imperative messages ("Add driveway mesh")
3. Push and open a pull request. CI runs lint, format check, tests, and build
4. Squash-merge when green. `main` auto-deploys to GitHub Pages in about a minute
5. Play the deployed build, write down what feels bad, repeat

`main` should always be playable.

## License

Code: [MIT](LICENSE). Third-party libraries and assets: see [CREDITS.md](CREDITS.md).
