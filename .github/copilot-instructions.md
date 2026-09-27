# Copilot instructions for mow-town

A small, satisfying 3D lawn-mowing game: plain JavaScript ES modules, Babylon.js 9, Vite,
Vitest, lil-gui. Solo developer who is newer to game dev.

## Priorities

Fun core interaction > visual polish > technical sophistication > feature count. Keep code
simple: no enterprise abstractions, no frameworks. Explain game-dev concepts briefly in
comments and PR bodies.

## Code conventions

- Files that import Babylon.js are glue. Logic and math go in pure `// @ts-check` modules
  (JSDoc types, no Babylon imports) with a `*.test.js` next to them.
- Every tunable number lives in `src/config.js`, with a short comment and units. Add a slider
  for it in `src/ui/TuningPanel.js` if it affects feel.
- `Game.update()` calls systems in an explicit order; keep it that way.
- Randomness is seeded (`src/math/noise.js`), so levels look the same every load.
- Cutting grass runs in fixed 60 Hz steps, so it's deterministic (for multiplayer later).
- Only comment code that needs clarification.
- Run `npm run check` (lint, format check, tests, build) before committing.

## Workflow

- One branch per roadmap milestone (`m2-grass-spike`), small logical commits, each one passing
  `npm run check`. Open a PR with a clear body, wait for the `check` job, squash-merge.
- Every commit ends with `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Keep docs current in the same PR: `docs/ROADMAP.md` (plan, checkboxes, findings),
  `docs/DECISIONS.md` (numbered entries: Why / Revisit / Gotchas), `README.md` (controls,
  layout, status). Planning lives in the roadmap, not GitHub Issues.
- Releases (after a playtest): `npm version X.Y.Z --no-git-tag-version`, a "Release X.Y.Z" PR,
  then `gh release create vX.Y.Z --target main` with notes.

## Testing in the browser

Dev builds expose `window.game`. Hidden tabs are throttled, so step the game by hand and
render every step (Babylon caches world matrices per render; skipping renders breaks
collisions):

```js
window.step = (n, dt = 1 / 60, each) => {
  for (let i = 0; i < n; i++) {
    each?.(i);
    game.update(dt);
    game.input.endFrame();
    game.scene.render();
  }
};
```

Fake pointer lock with `game.input.isPointerLocked = true`, keys with
`window.dispatchEvent(new KeyboardEvent('keydown', { code }))`, and the mouse with
`game.input.mouseButtons.add(0)`.

See `docs/DECISIONS.md` #15 for Babylon gotchas (material plugins, raw textures, particles).
