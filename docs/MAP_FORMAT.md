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
- Observed `tile_index` range in the county maps: 0–1471 — well inside the
  sheet. **Index 0 is not a blank/"no tile" sentinel**: it is an ordinary,
  fully opaque pale stone-and-gravel ground tile (25 distinct colours), and
  tiles 0–7 are a run of stone/gravel ground variants. Skipping cells whose
  `lo` is 0 punches holes through cliff plateaus and riverbanks; drawing
  them fills those areas in seamlessly.
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
- `lo` = tile_index as decoded above. Every value is a real tile, index 0
  included — there is no "empty cell" encoding, and all 16,384 cells carry
  ground.
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

Measured across **all 12 county files**, not just one: of every non-zero
`lo` in every county, **100% reference fully opaque atlas tiles** (see the
per-file non-zero counts in the table at the top; e.g. all 16,215 of
`TIRGO`'s, all 15,279 of `RASOVA`'s). Not a single cell in any county
references a tile carrying a transparent pixel. Counting index 0 as the
real ground tile it is, coverage is **16,384/16,384 cells in every
county** — the layer has no holes at all.

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
- **Column-major, same as Section A — confirmed, not presumed.** Section B
  carries no tile indices, so the trick that pinned Section A doesn't
  apply; instead, score each orientation by how well the mask is predicted
  by the Section A tile beneath it, via the conditional entropy
  `H(blocked | tile_index)`. If the orientations agree, a given terrain
  tile is consistently blocked or consistently open and the entropy
  collapses. Same-order scores **0.03–0.14 bits** across the counties
  versus **0.47–0.84 bits** transposed — an order of magnitude, and
  same-order wins in **12 of 12** counties.
- `lo` = always 0 in every county file checked.
- `hi` = the real payload, values seen across county files: `0`, `4`, and
  rarely `256` (0–209 cells depending on the county; see below).

**`hi` is a collision mask, not elevation.** The earlier reading of it as a
"topographic contour map" was a description of what the rendered mask looks
like, not of what it means. Two measurements settle it:

- The near-zero conditional entropy above means blocking is essentially a
  **function of the terrain tile**: a tile index is either always blocked
  or always open, rather than varying with height or position. (That test
  scores `hi != 0` as blocked, i.e. it treats `4` and `256` alike; the
  next section shows why that lumping is safe.)
- Cross-referencing the always-blocked tile indices against the atlas art,
  they are trees/forest, boulders, a cave mouth and water; the always-open
  ones are plain stone, gravel and grass ground. On `TIRGO`, 22.7% of
  subcells are blocked, and the blocked region traces exactly the river,
  the cliff ridges and the tree clusters visible in the Section A render.

So bit 2 (`4`) means **impassable**. This is the pathfinding/collision
grid, at 2× tile resolution — which is what phase 3's A* wants. Note the
scope of that claim: it is a *unit-movement* mask, and it is the only
terrain distinction the county files make. It says nothing about where
buildings may be placed — see "What this does not tell us" below.

### `256` is not a third terrain class

Bit 8 is worth pinning down, because a third state in this field is the
obvious place a "buildable vs merely walkable" distinction would live. It
isn't one. Measured across all 12 counties:

- It is **absent from 7 of the 12 counties entirely** (`BRASOV`, `HIRSOVA`,
  `OSTROV`, `PITESTI`, `RASOVA`, `SIBIU`, `SNAGOV` have none at all), and
  where it does occur the counts are tiny and uneven — 12 cells in
  `BRAILA`, 22 in `TIRGO`, 59 in `FAGARAS`, 136 in `GIURGIU`, 209 in
  `CUERTA`. A terrain classification that a map needs in order to be
  playable could not be missing from half the maps.
- It only ever sits on **seven** distinct tile indices — 702, 718, 784,
  1302, 1303, 1318 and 1319 — and six of those are **water** (mean colour
  around `rgb(101,107,140)`); the seventh, 784, is stone.
- Those same tiles carry plain `4` almost everywhere else: tile 702 appears
  as `4` 9,986 times against `256` 148 times, tile 718 as `4` 9,870 times
  against `256` 168.

So `256` is a **rare modifier on cells that are already blocked**, nearly
always water — not a distinct passability or buildability class. Treating
`hi != 0` as "blocked" is therefore safe, which is what the orientation
test above relies on. What the bit actually marks is unresolved; a ford,
a boat or dock spot, or a scripted location are all plausible, and the
county data is too sparse to choose between them.

Remaining detail on the field:

- `4` and `256` are both powers of two (bit 2 and bit 8). `BUILDING.MAP`
  (below) additionally shows `8, 12, 16, 32, 64, 128` in the same field,
  including `12 = 4|8` — i.e. this is a **bitmask of terrain/feature
  flags**, not an enum. Those extra bits appear **only** in `BUILDING.MAP`
  and never in a county file.
- Row width of 256 was derived the same way as Section A (autocorrelation
  minimum over divisors of 65,536).

### What this does *not* tell us: building placement

Read literally, the county files describe terrain with a single binary
distinction — a cell is either walkable or it is not. Nothing found so far
distinguishes **"buildable"** from **"walkable but not buildable"**, and it
is worth being explicit that this is an absence of evidence rather than a
settled answer, because placing buildings plainly needs more than a walk
mask (a unit can cross a patch of open ground that a keep could not be
founded on).

Everything that could have carried a second distinction has been checked
and is empty or accounted for:

- Section B `hi` has only two meaningful states in county files, per the
  measurements above.
- Section B `lo` is all-zero in every county file.
- Section A `hi` is all-zero in every county file.
- The richer flag vocabulary exists only in `BUILDING.MAP`, whose blocks
  1 and 2 are per-prefab masks whose correspondence to individual
  buildings is still unresolved (see below).

There is also still no identified **building-placement layer** in a county
file at all: buildings appear in a county only as ordinary tiles stamped
into Section A, with no separate record of which building was placed where.

So whoever implements building placement should treat buildability as an
open question rather than assume this document has answered it. The
plausible sources, none yet verified, are: deriving it from Section A's
tile index (grass and gravel behaving differently from cliff or water),
recovering it from `BUILDING.MAP`'s flag blocks once prefab boundaries are
extracted, or discovering it was logic in the original executable and never
stored in the map data at all. Establishing which is a piece of research in
its own right.

`0x10000 (Section A) + 0x40000 (Section B) = 0x50000 = 327,680` — accounts
for the entire file, no leftover/unknown bytes.

## The search for a separate ground layer — closed

For a while the working theory was that a county's base terrain graphic
lived *outside* the `.MAP` files, because Section A looked like a sparse
decoration overlay (only ~3.5% of its cells appeared to reference opaque
terrain) and Section B's `lo` is empty. Both observations were artifacts of
reading the atlas on the wrong 64×64/10-column grid, which sent most cells
to the wrong part of the sheet.

On the measured 40×40/16-column grid there is nothing missing, so the
search is closed. The candidate locations were each checked anyway, to rule
them out on their own evidence rather than by inference:

| candidate | verdict | evidence |
|---|---|---|
| Section A itself | **this is the ground layer** | 100% of non-zero `lo` in all 12 counties hit fully opaque tiles; full 16,384-cell coverage; renders as seamless terrain |
| `BATTLE.ART` beyond the referenced indices | ruled out | the 12 counties use 451 distinct indices, max 1471; tiles 1472–3743 are only **5.6% fully opaque** — they are unit frames, siege engines, banners and UI on the teal key, not terrain |
| `ART/MINIMAP.WG` | ruled out | 4,896 bytes total. One county's Section A alone is 32,768 bytes / 16,384 cells; this file holds 1,632 records. Too small for even one county, let alone twelve — true under *any* interpretation of its contents |
| `ART/LOADING.ART` | ruled out | decodes as a single 640×480 PCX: a pre-rendered loading screen ("Gone Fishing! Wait a second…"), one picture, no tile structure |
| `AUDIO/CHECK.BIN` | ruled out | the file is **0 bytes** |
| the `.WG` container generally | ruled out; also a misnomer | every `AUDIO/**/*.WG` begins `52 49 46 46 … 57 41 56 45` — plain RIFF/WAVE audio. `MINIMAP.WG` does not, so `.WG` is not one format; the extension is reused for unrelated files |

A sweep of every file on the CD by size closes the remaining gap: apart
from the `.MAP` files themselves, nothing outside the `.ART` sheets and
`CINEMA/INTRO.CIN` (video) is even large enough to hold twelve per-county
ground layers, and the `.ART` sheets are all accounted for as single
images or as the shared atlas.

**Decision: the ground layer is `COUNTIES/<NAME>.MAP` Section A**, rendered
through the `BATTLE.ART` atlas on the 40×40/16-column grid, column-major,
with index 0 drawn as a real tile. The fallback of classifying terrain from
Section B's `hi` bitmask is **not needed and should not be used for
graphics** — `hi` is the unit-movement collision mask (bit 2 = impassable)
and is the right source for the pathfinding grid, which is a different job.
It is not a general terrain classifier, and in particular it does not
answer where buildings may be placed.

### Reproducing the evidence

The rendered images behind the claims above are deliberately **not
committed**: a composite of a county's Section A is a faithful reproduction
of the original artwork, and this repository is public (see "Test fixture
strategy" below). To regenerate them locally with `.cd/` present, decode
`ART/BATTLE.ART` with `src/lib/art`, then for each Section A record at flat
index `i` draw tile `lo` at `x = i / 128`, `y = i % 128`:

```
image(x, y) = extractTileRgba(decodePcx(BATTLE.ART), lo)
```

`TIRGO` comes out as grass and dirt with a rocky ridge system through the
upper half and a stone-banked river across the lower third; `RASOVA` as a
wide river delta between stone flats and grassland. Rendering Section B's
`hi` over the same coordinates (0 = open, 4 = blocked) lands the blocked
cells exactly on that river, those ridges and the tree clusters.

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
- **Where building *buildability* is encoded, if anywhere.** County files
  make a single walkable/blocked distinction and nothing more, so the
  rules for where a building may be founded are not in the map data as
  currently understood — see "What this does not tell us" above for the
  candidate sources. This needs answering before building placement is
  implemented.
- What the Section B `hi` bits *other than* bit 2 mean, including what
  bit 8 (`256`) marks on the water cells it occurs on. `BUILDING.MAP`
  shows more bits set (`8,16,32,64,128`) than any county file (`4,256`
  only), so county data alone won't resolve the rest.
- Whether Section A's `hi` field is ever non-zero in a *county* file (only
  ever seen non-zero in `BUILDING.MAP` so far).

Resolved since: Section B's cell order (column-major, same as Section A)
and whether a separate ground layer exists elsewhere on the CD (it does
not) — both covered in their sections above.

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
