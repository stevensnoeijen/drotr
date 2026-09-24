# Dracula: Reign of Terror Remake

[![Coverage Status](https://coveralls.io/repos/github/stevensnoeijen/drotr/badge.svg?branch=main)](https://coveralls.io/github/stevensnoeijen/drotr?branch=main)

Dracula: Reign of Terror Remake is a remake of "Dracula: Reign of Terror" (a.k.a. Vlad Tepes Dracula) strategy game from 1997.

This game is in development, but not every actively.

I do not own any of the rights of the original game!

Take a peek of the current state of the game [here](https://stevensnoeijen.github.io/drotr/).

# Requirements

- node

# QuickStart

```
npm install
npm run dev
```

A browser tab will open, click "Run in web browser".

# Test

Currently only some unit-tests are available thought running `npm run test`.

All tests are automaticly ran at pr!

# Debug

To use debug options add `#/game?debug=<options>` and replace `<options>` to the url and refresh the page.
Example: `#/game?debug=grid`.

Several options can be combined with commas, e.g. `#/game?debug=grid,health`.
They can also be toggled live from the in-game "Debug" menu.

Current debug options are:

- `grid`, shows the map's tile grid
- `health`, always shows every unit's health bar
- `unit-info`, shows a tooltip with the stats of the hovered unit
- `targets`, draws a line from each unit to its attack target
- `paths`, draws each unit's planned move path
- `tile-layers`, lists the map's tile layers under the option in the "Debug" menu, each with a show/hide toggle (starting from the layer's `visible` flag in the `.tmj`, so hidden layers such as `intact` and `ruined` on the `buildings` map can be switched on). Display only: collision is unaffected

# Scenarios

To select a scenario add `#/game?scenario=<scenario>` and replace `<scenario>` to the url and refresh the page.

Current scenario are:

- `randomunits` (default)
- `pathfinding`
- `behaviortree`

# Pack

This section describes a `gulp`-based pipeline that packed `raw/` into
`public/assets` (`npm run pack`, `gulpfile.js`, `TINIFY_KEY`/TinyPNG). That
pipeline no longer exists in this repo — it was removed by the Vite
toolchain migration and never replaced, and there is no `pack` script or
`gulpfile.js` today.

Going forward, assets/tiles/sprites are meant to be generated directly from
the original game data in `.cd/` rather than from `raw/`. `raw/sprites/units`
is kept for now only as a reference while that `.cd`-based pipeline is
built, and is expected to shrink/disappear once it does. See
[docs/ASSETS.md](docs/ASSETS.md) for the current audit and plan, and
[raw/README.md](raw/README.md) for the status of the old `raw/`-based
pipeline.
