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
- `.cd/ART/BATTLE.png` (the converted tile atlas referenced in
  `docs/MAP_FORMAT.md`) is **truncated at tile index 1459**, while the
  county `.MAP` files reference tile indices up to **1471**. The last 12
  tile indices used by real maps (1460–1471) have no corresponding art in
  the current `BATTLE.png` conversion — the source `.cd/ART/BATTLE.ART`
  PCX should be re-checked/re-converted to confirm whether the original
  data actually has those tiles or the conversion step dropped them.

## Rebuilding committed assets from `.cd`

The original commercial game data lives locally, outside version control,
under `.cd/` (see `docs/MAP_FORMAT.md` for why it isn't committed).

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
  format; it is not committed or repacked into `public/assets`.

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

Two remaining scripts operate only on the already-packed spritesheet, not
on `.cd` or `raw/`:

- `scripts/generate-animation-models.ts` — generates
  `public/assets/animation-models.json` from the game's unit/state/direction
  type lists (`src/game/types`); it doesn't read image data at all.
- `scripts/add-animations-to-unit-spritesheet.ts` — post-processes an
  already-generated `public/assets/unit-spritesheet.json` to group numbered
  frame keys into named animations; it assumes the spritesheet JSON already
  exists and doesn't touch `raw/` or `.cd/`.

So a future contributor with access to the original `.cd` data who needs to
regenerate `public/assets/unit-spritesheet.png` should build a new
extraction/packing step that reads directly from `.cd` — not restore the
old `gulp`/`raw/sprites/units` pipeline (history around commits
`ab7067c6`/`17c3acce`/`78f5df2d` shows how the old one worked, for
reference, but it's not the target design). Once that new pipeline exists
and is verified, `raw/sprites/units` can be deleted.
