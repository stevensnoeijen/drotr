# `.MAP` file format (reverse-engineered)

Notes from reverse-engineering `COUNTIES/*.MAP` against the tile atlas
`ART/BATTLE.png` (converted from the original `ART/BATTLE.ART` PCX). Written to
guide a future converter that turns these into a more readable format (e.g.
JSON + PNG layers).

Confirmed against **all 12 county files** (`BRAILA`, `BRASOV`, `CUERTA`,
`FAGARAS`, `GIURGIU`, `HIRSOVA`, `OSTROV`, `PITESTI`, `RASOVA`, `SIBIU`,
`SNAGOV`, `TIRGO`) — identical layout and byte size (327,680) in every one.
Per-file measurements:

| file | secA nonzero lo | secA max lo | secB hi distinct |
|---|---|---|---|
| BRAILA  | 16378/16384 | 1471 | 0, 4, 256 |
| BRASOV  | 16163/16384 | 1423 | 0, 4 |
| CUERTA  | 16233/16384 | 1471 | 0, 4, 256 |
| FAGARAS | 16169/16384 | 1471 | 0, 4, 256 |
| GIURGIU | 15412/16384 | 1471 | 0, 4, 256 |
| HIRSOVA | 15406/16384 | 1471 | 0, 4 |
| OSTROV  | 16134/16384 | 1387 | 0, 4 |
| PITESTI | 16179/16384 | 1471 | 0, 4 |
| RASOVA  | 15279/16384 | 1471 | 0, 4 |
| SIBIU   | 16080/16384 | 1471 | 0, 4 |
| SNAGOV  | 16359/16384 | 1423 | 0, 4 |
| TIRGO   | 16215/16384 | 1471 | 0, 4, 256 |

Section A `hi` is `0` in every single one of these 12 files, and Section B
`lo` is all-zero in every one — both invariants hold with no exceptions.
`BUILDING.MAP` breaks both invariants (see its own section below) — it is
**not** just three more county maps.

## Tile atlas — `ART/BATTLE.png`

- 640 × 9367 px, 8-bit palette.
- Built from **64×64 px tiles**, **10 columns wide**, packed row-major into a
  single flat index:

  ```
  tile_index = row * 10 + col
  row = y / 64
  col = x / 64
  x0,y0 = col*64, row*64  (tile occupies [x0,y0]..[x0+64,y0+64))
  ```

- Observed `tile_index` range: 0–1471 (0 = "empty/no tile").
- The atlas is **not** just terrain — it's one contiguous sheet holding
  terrain/wall tiles (roughly rows 0–56, i.e. y 0–3648, all opaque, no
  transparency), then sprite frames on a `(0, 251, 192)` teal color-key
  background: units, decorative objects, a bitmap font, and a border
  graphic near the very end. All of it shares the same index space.
- Verified by decoding real map indices and cropping the corresponding
  atlas tile: e.g. indices 1382–1387 (the most common non-zero tile in
  every county's Section A, see below) land at row 138, cols 2–7, and are
  a row of impaled-victim/stake battlefield decorations — thematically
  correct for this game and visually coherent, confirming the row/col
  formula.

## `COUNTIES/<NAME>.MAP` — 327,680 bytes, always

Every cell in the file, in both sections below, is a **4-byte little-endian
record** = two `u16` fields:

```
u16 lo  (bytes 0-1)  — tile index into BATTLE.png (see above)
u16 hi  (bytes 2-3)  — flags / secondary layer value
```

### Section A — offset `0x00000`, 65,536 bytes = 128×128 grid

- Row-major, 128 cells wide, 128 rows: `offset = (y*128 + x) * 4`.
- `lo` = tile_index as decoded above (0 = empty, else index into the
  atlas).
- `hi` = always 0 in this section (county files only — `BUILDING.MAP`
  breaks this, see below).
- Row width of 128 was derived empirically (not assumed): computed
  average `|value[i] - value[i+W]|` for every integer divisor `W` of the
  cell count and took the minimum — `W=128` came out far ahead of any
  other divisor, and rendering the grid at that width produces a
  visually coherent map (vs. noise at other widths).

**Correction from the first pass of this doc:** Section A is *not* a full
ground/terrain fill. Rendering it with the actual atlas art (compositing
the real 64×64 tile per cell, not just visualizing the raw index as
grayscale) shows the canvas is overwhelmingly the atlas's `(0,251,192)`
teal transparent color-key, with only sparse solid content. Checked on
`TIRGO`: of 16,215 non-zero cells, only 572 (3.5%) reference the opaque
terrain rows (0–56) of the atlas — the other 96.5% reference sprite-region
tiles sitting on transparent background (dominated by the impaled-stake
decoration frames, see atlas section above). So **Section A is a sparse
object/decoration overlay** (props, corpses-on-stakes, fence pieces, wall
fragments — individual sprites), not the ground itself. The actual base
terrain/ground graphic for a battle is not present in this file at all —
it must come from elsewhere (a separate fixed background per county, not
yet located, or something generated outside these `.MAP` files).

### Section B — offset `0x10000`, 262,144 bytes = 256×256 grid

- Exactly 2× Section A's resolution per axis (2 sub-samples per terrain
  tile). Row-major, 256 wide: `offset = 0x10000 + (y*256 + x) * 4`.
- `lo` = always 0 in every county file checked.
- `hi` = the real payload, values seen across county files: `0`, `4`, and
  rarely `256` (~20 occurrences per map). Rendering `hi` as an image
  (0=black, 4=green, 256=red) produces a clean **topographic contour map
  with a winding river** — this is almost certainly an elevation/river/
  passability mask at finer-than-tile resolution, not noise/padding.
- `4` and `256` are both powers of two (bit 2 and bit 8). `BUILDING.MAP`
  (below) additionally shows `8, 12, 16, 32, 64, 128` in the same field,
  including `12 = 4|8` — i.e. this is very likely a **bitmask of terrain/
  feature flags**, not an enum, even though county files only ever
  populate two of the bits. Which bit means what (river? ford? elevation
  step?) is not yet confirmed.
- Row width of 256 was derived the same way as Section A (autocorrelation
  minimum over divisors of 65,536).

`0x10000 (Section A) + 0x40000 (Section B) = 0x50000 = 327,680` — accounts
for the entire file, no leftover/unknown bytes.

## `COUNTIES/BUILDING.MAP` — 983,040 bytes = 3 × 327,680

Same overall byte size as 3 county files, and splits cleanly into three
327,680-byte blocks at the same offsets — but it is **not** three county
maps. Checked each block against the county layout (Section A = first
65,536 bytes / 128×128, Section B = next 262,144 bytes / 256×256):

| block | secA nonzero lo | secA max lo | secA hi distinct | secB lo all-zero | secB hi distinct |
|---|---|---|---|---|---|
| 0 | 15913/16384 | 1447 | `0` | **no** (max 1451) | `0,4,8,12,16,32,128,256` |
| 1 | 0/16384 | 0 | `0,4,8,12,16,32,128,256` | yes | `0,4,8,12,16,32,64,128,256` |
| 2 | 0/16384 | 0 | `0,4,12,64,128` | yes | `0,4` |

Both invariants that hold across every county file break here: Section A's
`hi` is non-zero (block 1/2), and Section B's `lo` is non-zero (block 0).

Rendering block 0's Section A with the real atlas art (composited, not
grayscale) confirms what it is: a **library of prefab multi-tile
buildings**, matching the hypothesis that buildings are combined-tile
structures meant to be placed into a county map's Section A object layer.
On the same 128×128 canvas (mostly transparent teal, same as a county map),
there are roughly a dozen separate, discrete clusters of solid
architecture — walls, tiled roofs, towers — each cluster maybe 15–25 tiles
across, scattered at distinct, non-overlapping positions across the grid,
clearly distinguishable from the surrounding transparency. This is a very
different composition from a county map: block 0 pulls 4,096/15,913 (25.7%)
of its non-zero refs from the opaque terrain rows of the atlas (vs. 3.5% in
`TIRGO`), consistent with solid building walls/roofs rather than sparse
decorations. Each cluster is very likely one building "prefab" — assembled
once here from atlas tiles, then copy-pasted (stamped) into a county's
Section A at the right grid position wherever that building exists in the
actual map, rather than every county map re-authoring every building
tile-by-tile.

Blocks 1 and 2 have no tile references at all (`lo` is all-zero throughout)
but carry the same bitmask-flag values seen in Section B `hi` elsewhere —
likely per-building collision/placement masks paired with block 0's
clusters (e.g. which cells are blocked/buildable under each prefab), but
the exact block-to-block correspondence (which flag region belongs to
which building cluster) is **not** resolved yet.

**Do not assume `BUILDING.MAP` decodes with the plain county
interpretation** — block 0's `lo` fields are prefab tile data (usable once
cluster boundaries are extracted), blocks 1/2 are flags whose association
to individual buildings still needs work.

## Open questions for later

- Where the actual ground/terrain graphic comes from for a county battle —
  it is not in Section A (that's a sparse object overlay, see above) or
  Section B (`lo` always 0 in county files). Possibly a fixed background
  per county not yet located, or derived some other way.
- The individual building clusters in `BUILDING.MAP` block 0 need their
  bounding boxes extracted (e.g. connected-component analysis on non-zero
  cells) so each prefab can be cut out and placed independently — this is
  the next concrete step toward a converter.
- How `BUILDING.MAP` block 0's clusters correspond to blocks 1/2's flag
  regions (same coordinates? a lookup by index?), and whether a building's
  placement *into* a county map is recorded anywhere in the county file
  (no second/sparse "building instance" layer has been identified in
  county `.MAP`s yet — worth another pass once cluster boundaries exist).
- Which bit(s) of the Section B `hi` bitmask mean what (river? ford?
  elevation step?) — `BUILDING.MAP` shows more bits set (`8,16,32,64,128`)
  than any county file (`4,256` only), so county data alone won't fully
  resolve this.
- Whether Section A's `hi` field is ever non-zero in a *county* file (only
  ever seen non-zero in `BUILDING.MAP` so far).

## Test fixture strategy

The real `.MAP`/`.ART` files described above live locally under `.cd/` (a
gitignored copy of the original game's CD data, e.g. `.cd/COUNTIES/*.MAP`
and `.cd/ART/BATTLE.ART`/`BATTLE.png`). They are original commercial game
assets, this repository is public, and redistributing them would be a
copyright/redistribution risk — so `.cd/` stays local-only and gitignored,
and none of the original `.MAP`/`.ART` files are committed.

Any future automated test for a `.MAP`/`.ART` parser should instead use a
small **synthetic fixture**: a hand-built byte buffer (or a tiny committed
binary file) shaped like the format documented above — e.g. one 327,680-byte
buffer with a handful of non-zero Section A `lo` tile indices and a couple
of Section B `hi` flag values (`4`, `256`) — rather than a trimmed copy of a
real county file. That's enough to exercise the section-offset math, the
128×128 / 256×256 row-major decoding, and the two-`u16`-per-record layout
without shipping any original game data. No parser or test currently reads
`.MAP` files (see `docs/ASSETS.md` for the current state of the asset
pipeline), so no fixture has been created yet — this section documents the
decision for whoever implements that parser next.
