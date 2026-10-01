# Asset audit findings

Notes from auditing the sprite/asset pipeline while reverse-engineering the
original game's map format (see `docs/MAP_FORMAT.md`).

## Findings

- `raw/sprites/units` has **199 GIF files with `.png` extensions** — the
  bytes are GIF-encoded but the filenames end in `.png`. Frame dimensions
  are also **inconsistent per unit**: different units' animation frames
  are cropped to different widths/heights rather than a single uniform
  frame size across the set. This directory is kept only as a temporary
  reference (see "Rebuilding committed assets from `.cd`" below) — the
  plan is to reconstruct sprites/tiles directly from `.cd` and remove
  `raw/sprites/units` once that pipeline exists.
- `public/assets/unit-spritesheet.png` is **TinyPNG-quantized to a
  256-colour palette**. This is a lossy compression step applied to keep
  the packed spritesheet small; it means the committed spritesheet is not
  a lossless copy of the source frames in `raw/sprites/units`.
- ~~`.cd/ART/BATTLE.png` is **truncated at tile index 1459**, while the
  county `.MAP` files reference tile indices up to **1471**.~~
  **Withdrawn — this was wrong.** Decoding `.cd/ART/BATTLE.ART` directly
  (see [`ART_FORMAT.md`](./ART_FORMAT.md)) shows nothing was ever lost.
  The atlas is a grid of **40x40** tiles, 16 columns wide — not 64x64/10
  columns — and on that grid the 640x9367 sheet holds **3744** complete
  tiles, so 1460–1471 are ordinary, fully present tiles. The apparent
  truncation was arithmetic from the wrong tile size: at 64px the last
  complete row lands at index 1459. `BATTLE.png` has the same dimensions
  as the source `.ART`, so that conversion was faithful; only its
  interpretation was wrong.
- `.cd/ART/BATTLE.png` is still not a good source to build from: it is
  8-bit palettised and carries the `(0, 251, 192)` teal colour key instead
  of alpha. `src/lib/art` now decodes the `.ART` losslessly and resolves
  that key to real alpha, so the `.png` is redundant.

## Rebuilding committed assets from `.cd`

The original commercial game data lives locally, outside version control,
under `.cd/` (see `docs/MAP_FORMAT.md` for why it isn't committed).

**Policy:** any asset-build tooling written going forward (sprite
extraction, tile-atlas conversion, spritesheet packing) must read from
`.cd/` directly, not from `raw/`. `raw/` is a legacy, reference-only copy
kept temporarily during the transition — see [raw/README.md](../raw/README.md)
— and is expected to be trimmed/removed incrementally as `.cd`-based
generation replaces the parts it covers.

`raw/sprites/units/*.png` is a **temporary, reference-only** copy of
per-unit animation frames extracted from the original game's sprite data.
It predates the current asset plan and is kept around for now only so its
contents can be cross-checked while reconstructing tiles/sprites directly
from `.cd`. It is not the source of truth going forward and is intended to
be **removed once the `.cd`-based reconstruction pipeline replaces it** —
new tooling should read from `.cd` directly rather than from `raw/`.

- `public/assets/unit-spritesheet.png` (+ `.json`) — the packed spritesheet
  currently built from `raw/sprites/units`, quantized via TinyPNG (see
  finding above). Once the `.cd`-based pipeline exists, this should be
  regenerated straight from `.cd` instead.
- `.cd/ART/BATTLE.png` — a PNG conversion of `.cd/ART/BATTLE.ART` (a PCX),
  used only as a local reference while reverse-engineering the `.MAP`
  format; it is not committed or repacked into `public/assets`. Superseded
  by `src/lib/art`, which decodes the `.ART` directly and losslessly; new
  tooling should read the `.ART` rather than this conversion.

**Current state of the tooling:** as of this audit, there is **no working
script in this repository that regenerates sprites or the spritesheet from
`.cd`** (nor, going forward, is `raw/sprites/units` meant to be that
source). The repo previously had a `gulp`-based pipeline that packed
`raw/sprites/units` into the spritesheet — `README.md`'s "Pack" section
still documents it (`npm run pack` / `npx gulp pack-sprites` / `npx gulp
pack-sounds`, configured via `gulpfile.js` and a `TINIFY_KEY` in
`.gulp.env`) — but the toolchain replacement in `f1f3ce24` ("replace build
toolchain with vite 8, ts 5.9, react 19, vitest 4") removed `gulpfile.js`
and the `gulp` dependency without replacing the pack step; there's no
`pack` script in `package.json`'s `scripts` and no `gulpfile.js` in the
repo today. `README.md`'s "Pack" section is stale, and in any case
described a `raw/`-based pipeline that the new `.cd`-based approach is
meant to supersede rather than restore.

Maps, unlike sprites, are now built from `.cd` directly:

- `npm run export:terrain-tileset` decodes `ART/BATTLE.ART` into the
  committed `public/maps/terrain.tsx` and `terrain.png` (see
  [`ART_FORMAT.md`](./ART_FORMAT.md)).
- `npm run convert:map -- <COUNTY>` converts a county's
  `COUNTIES/<NAME>.MAP` into a Tiled map, `public/maps/<name>.tmj`, drawn
  with that tileset (see "Converting to Tiled" in
  [`MAP_FORMAT.md`](./MAP_FORMAT.md)). All of
  `public/maps/fagaras.tmj`, `public/maps/sibiu.tmj`,
  `public/maps/brasov.tmj`, `public/maps/rasova.tmj`,
  `public/maps/pitesti.tmj`, `public/maps/hirsova.tmj`,
  `public/maps/snagov.tmj`, `public/maps/braila.tmj`,
  `public/maps/giurgiu.tmj`, `public/maps/tirgo.tmj`,
  `public/maps/cuerta.tmj` and `public/maps/ostrov.tmj` (the 12
  counties) are converted and committed; `npm run convert:maps`
  re-converts all 12 at once, keeping any hand-placed spawn points. `npm run convert:map -- BUILDING` converts
  `BUILDING.MAP` as-is into `public/maps/buildings.tmj` (committed); its
  buildings aren't yet cut out as individual prefabs.

One remaining script operates only on the already-packed spritesheet, not
on `.cd` or `raw/`:

- `scripts/add-animations-to-unit-spritesheet.ts` — post-processes an
  already-generated `public/assets/unit-spritesheet.json` to group numbered
  frame keys into named animations; it assumes the spritesheet JSON already
  exists and doesn't touch `raw/` or `.cd/`.

(`scripts/generate-animation-models.ts`, which generated
`public/assets/animation-models.json` from the old stack's
`src/game/types`, was removed once those types no longer existed; nothing
in `src` reads that JSON.)

So a future contributor with access to the original `.cd` data who needs to
regenerate `public/assets/unit-spritesheet.png` should build a new
extraction/packing step that reads directly from `.cd` — not restore the
old `gulp`/`raw/sprites/units` pipeline (history around commits
`ab7067c6`/`17c3acce`/`78f5df2d` shows how the old one worked, for
reference, but it's not the target design). Once that new pipeline exists
and is verified, `raw/sprites/units` can be deleted.

## Unit spritesheets

`npm run pack:sprites [unit...]` (`scripts/unit-sprites/`) cuts unit frames
out of `ART/BATTLE.ART` and packs one lossless, straight-RGBA Pixi v8 sheet
per unit type, both teams on it, into `public/assets/units/`:
`<unit>.png`, `<unit>.sheet.json` (animations keyed by `AnimationKey`) and
the `<unit>.json` manifest. With no unit named, every unit with a frame map
is packed. So far only `swordsmen` is migrated; the other units still use
`public/assets/unit-spritesheet.*`.

Unit frames are not on the atlas's 40 px tile grid, nor on any uniform
grid, so each unit has a committed **frame map**
(`scripts/unit-sprites/frame-maps/<unit>.ts`): the measured atlas rect of
every team × action × direction × frame, in playback order. Frames are
copied untrimmed, so all frames of an animation share one size and pivot;
the teal key becomes alpha and nothing else is changed. `idle` has no
frames of its own and reuses one explicitly chosen move frame per team and
direction.

The swordsmen map was bootstrapped by template-matching
`raw/sprites/units` against the decoded atlas (every frame matched exactly
one position), then normalised to atlas column order, which fixed the
dump's ordering errors (swapped, reversed and rotated frame runs, and a
blue idle that pointed at a death frame).

## Unit sprite contract

Unit sprites are described by a typed contract shared by the sprite pipeline
and the runtime renderer; the manifest path is derived from the unit type, so
`UnitDefinition` carries no asset reference.

- Animation keys (`src/game/render/sprites/animation-key.ts`):
  `<unit>.<team|neutral>.<action>.<direction>`, e.g. `swordsmen.red.move.nw`;
  frames append a 1-based index, e.g. `swordsmen.red.move.nw_01`. Actions are
  `idle | move | attack | dead`; directions are compass abbreviations
  `n ne e se s sw w nw`.
- Manifest (`src/game/render/sprites/unit-manifest.ts`) at
  `public/assets/units/<unit>.json`, next to the Pixi sheet
  `<unit>.sheet.json` (`unitSpritesheetPath`): `frameSize`, `anchor`, `teams`, and
  `actions`, each action having `frames` (per direction), `fps`, `loop`, and
  optionally `hitFrame` (attack only, 0-based, must be `< frames`) or
  `holdLast`. Actions a unit has no frames for may be omitted; single-frame
  actions are valid. `dead` is the dying animation itself — it must not
  loop, and normally sets `holdLast` to stay on the corpse frame. Check manifests with `validateUnitManifest`.

This supersedes `public/assets/animation-models.json`.
