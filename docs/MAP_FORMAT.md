# `.MAP` file format (reverse-engineered)

Notes from reverse-engineering `COUNTIES/*.MAP` against the tile atlas in
`ART/BATTLE.ART`, decoded by `src/lib/art` (see
[`ART_FORMAT.md`](./ART_FORMAT.md)). Written to guide a future converter
that turns these into a more readable format (e.g. JSON + PNG layers).

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

## Tile atlas — `ART/BATTLE.ART`

> **Corrected.** An earlier pass of this doc read the atlas as **64×64
> tiles, 10 columns** and concluded it was truncated at index 1459. That
> was wrong, and several conclusions below depended on it — see
> [`ART_FORMAT.md`](./ART_FORMAT.md) for the measurements. The tile size
> and the affected conclusions have been corrected in place.

- 640 × 9367 px, 8-bit palette, decoded straight from the `.ART` (a PCX)
  by `src/lib/art`. The `.png` conversion is redundant.
- Built from **40×40 px tiles**, **16 columns wide**, packed row-major into
  a single flat index:

  ```
  tile_index = row * 16 + col
  row = y / 40
  col = x / 40
  x0,y0 = col*40, row*40  (tile occupies [x0,y0]..[x0+40,y0+40))
  ```

- The sheet holds **3744 complete tiles** (234 whole rows, plus a 7px
  remainder that carries no tile).
- Observed `tile_index` range in the county maps: 0–1471 (0 = "empty/no
  tile") — well inside the sheet.
- The atlas is **not** just terrain: one contiguous sheet holds terrain and
  wall tiles, sprite frames on a `(0, 251, 192)` teal color-key
  background, units, decorative objects, a bitmap font and UI furniture,
  all sharing the same index space. 1576 of the 3744 tiles are fully
  opaque; the first tile containing any transparency is index 205.
- Verified by decoding real map indices and cropping the corresponding
  atlas tile: indices 1437–1439, 1453–1455 and 1469–1471 form a single
  coherent 3×3 rocky-shoreline object (three horizontal runs of three,
  stacked), and the same object appears as a 3×3 block in the map grid.

## `COUNTIES/<NAME>.MAP` — 327,680 bytes, always

Every cell in the file, in both sections below, is a **4-byte little-endian
record** = two `u16` fields:

```
u16 lo  (bytes 0-1)  — tile index into the BATTLE.ART atlas (see above)
u16 hi  (bytes 2-3)  — flags / secondary layer value
```

### Section A — offset `0x00000`, 65,536 bytes = 128×128 grid

- 128 cells per axis, stored column-major: `offset = (x*128 + y) * 4`
  (see the orientation note below).
- `lo` = tile_index as decoded above (0 = empty, else index into the
  atlas).
- `hi` = always 0 in this section (county files only — `BUILDING.MAP`
  breaks this, see below).
- Row width of 128 was derived empirically (not assumed): computed
  average `|value[i] - value[i+W]|` for every integer divisor `W` of the
  cell count and took the minimum — `W=128` came out far ahead of any
  other divisor, and rendering the grid at that width produces a
  visually coherent map (vs. noise at other widths).

**Section A is the full ground layer.** Composited with the real atlas art
on the corrected 40×40/16-column grid, it renders as continuous, coherent
terrain — grass, rock, roads, a winding river with rocky shorelines.
Measured on `TIRGO`: **all 16,215** non-zero cells (100%) reference fully
opaque atlas tiles; none reference a tile with any transparent pixel.

> An earlier pass claimed the opposite — that only 3.5% of cells hit opaque
> terrain, that Section A was "a sparse object/decoration overlay", and
> that the real ground graphic lived somewhere else entirely. All three
> followed from reading the atlas on the wrong 64×64 grid, which made most
> cells land on the wrong (transparent) part of the sheet. There is no
> missing background to find.

**Cell order is column-major.** `offset = (x*128 + y) * 4`, i.e. a flat
index `i` is at `x = i / 128`, `y = i % 128` — horizontally adjacent cells
are 128 records apart, vertically adjacent cells 1 apart. The 128×128 grid
is square, so the autocorrelation that established the row width could not
distinguish the two orientations; the atlas settles it. The 3×3 shoreline
object above occupies three *horizontally* adjacent atlas tiles per run
(1437,1438,1439), and those three land 128 records apart in the map, which
only works if 128 is the x stride.

### Section B — offset `0x10000`, 262,144 bytes = 256×256 grid

- Exactly 2× Section A's resolution per axis (2 sub-samples per terrain
  tile), 256 cells per axis: `offset = 0x10000 + (x*256 + y) * 4`.
  Presumed column-major to match Section A; unlike Section A this has not
  been pinned against the atlas (there are no tile indices here to pin it
  with), so the two axes could still be the other way round.
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
On the same 128×128 canvas — a plain grass fill, not transparency — there
are **eleven** separate, discrete compounds: octagonal and hexagonal
walled enclosures, several ringed by a water moat, each containing tiled
roofs and towers, plus a few loose stretches of wall/fence. Each is
roughly 15–25 tiles across, at distinct non-overlapping positions.

> The earlier figures here ("4,096/15,913 (25.7%) of non-zero refs from
> opaque terrain rows, vs. 3.5% in `TIRGO`") came from the wrong 64×64
> atlas grid and are withdrawn. On the corrected grid **100%** of block 0's
> 15,913 non-zero refs are fully opaque tiles — the same as a county map —
> so that contrast does not exist. The prefab reading below still holds; it
> rests on the rendered layout, which is unambiguous.

Each cluster is very likely one building "prefab" — assembled
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
- Whether Section B uses the same column-major cell order as Section A. It
  carries no tile indices, so the trick that pinned Section A's
  orientation against the atlas doesn't apply; something else (e.g.
  lining its river mask up against Section A's rendered river) is needed.

## Test fixture strategy

The real `.MAP`/`.ART` files described above live locally under `.cd/` (a
gitignored copy of the original game's CD data, e.g. `.cd/COUNTIES/*.MAP`
and `.cd/ART/BATTLE.ART`/`BATTLE.png`). They are original commercial game
assets, this repository is public, and redistributing them would be a
copyright/redistribution risk — so `.cd/` stays local-only and gitignored,
and none of the original `.MAP`/`.ART` files are committed.

The `.ART` decoder added since follows exactly this strategy — synthetic
in-memory PCX fixtures for the format-level tests, plus golden hashes
(never pixels) for the real file, skipped when `.cd/` is absent. See
[`ART_FORMAT.md`](./ART_FORMAT.md).

Any future automated test for a `.MAP` parser should likewise use a
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
