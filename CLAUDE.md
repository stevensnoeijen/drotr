# CLAUDE.md

Guidance for Claude Code (and contributors) working in this repository.

## Working on tickets

- Every ticket (GitHub issue) is implemented on its own branch, created from
  an up-to-date `main`. Never commit ticket work directly to `main`.
  - Branch name: `<issue-number>-<kebab-case-slug-of-title>`, e.g.
    `75-replace-build-toolchain`.
- Move the issue's GitHub Project status to "doing" when you start working it,
  and "done" once the PR merges.
- Before opening a PR, run the full local check suite and confirm it's green:
  - `npm run build`
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
- Open the PR against `main` and reference the issue it closes (e.g.
  `Closes #75`).
- Prefer small, focused PRs scoped to a single issue over bundling multiple
  tickets together.

## File naming

- All new file names (source files, test files, scripts, docs) use
  kebab-case, e.g. `unit-health-bar.tsx`, `pathfinding-grid.ts`.
- Existing non-kebab-case files may be renamed opportunistically when you're
  already touching them, but renaming purely for style is not itself worth a
  PR — don't go out of your way to do it.

## Maps and scenarios

- Maps (`src/game/maps`) and scenarios (`src/game/scenarios`) are chosen
  independently, via `?map=<id>` and `?scenario=<id>` on `/game`. A map
  supplies terrain and named, team-agnostic spawn points (a spawn is just a
  location — it has no team or unit type of its own). A scenario decides
  what to spawn at which of the map's spawn points, and for which team
  (`claimSpawn` in `~/game/systems/spawn-system`), plus any other world
  setup.
- Scenario ids that exist to exercise the engine or harness itself — not to
  demonstrate a real gameplay setup — are prefixed `test-`, e.g.
  `test-empty`, `test-skirmish`, `test-health`.

## Stack

- React 19 + PixiJS (imperative canvas mount) + `miniplex` ECS, built with
  Vite, TypeScript, and Vitest. Tailwind CSS v4 for any UI chrome outside the
  canvas.
- No Vue or `sim-ecs` code should be reintroduced — that stack was fully
  removed (#76) in favor of the React/Pixi/miniplex stack (#75, #77-#80).

## Testing

- Vitest is the test runner (`npm test`, `npm run test:coverage`). Place unit
  tests next to the code they cover or under `src/test/` for shared harness
  code.
- New engine systems (movement, combat, perception, etc.) should ship with
  unit tests for their core logic, independent of PixiJS rendering.

## Roadmap awareness

The GitHub milestones describe the phased plan for this engine rewrite; keep
new work aligned with the current phase instead of jumping ahead:

1. **Stack** — React + Pixi v8 + miniplex foundation (routing, ECS
   bootstrap, URL-param test-case harness).
2. **Primitive foundations** — Tiled map rendered as colored-rectangle
   primitives, units as shapes with health bars, click/drag selection, pan
   and zoom.
3. **Movement, pathfinding and flocking** — A* over the Tiled collision
   grid, per-unit speed, boids steering, formation-based group orders.
4. **Real-time combat** — perception/auto-targeting, cooldowns and damage,
   ranged projectiles, death and cleanup with no orphaned Pixi objects.
5. **Original assets: .ART decoder and map pipeline** (parallel track) —
   decode the original tile atlas and `.MAP` files, export Tiled tilesets
   and maps, load real county maps with working pathfinding.
6. **Asset integration** — replace primitives with re-extracted original
   sprites and audio (via `howler.js`) without changing mechanics.

When picking up a ticket, check its milestone to understand which phase it
belongs to, and avoid depending on capabilities from a later phase that
don't exist yet.
