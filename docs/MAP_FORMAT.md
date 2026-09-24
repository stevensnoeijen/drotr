# `.MAP` file format (reverse-engineered)

Notes from reverse-engineering `COUNTIES/*.MAP` against the tile atlas in
`ART/BATTLE.ART`, decoded by `src/lib/art` (see
[`ART_FORMAT.md`](./ART_FORMAT.md)). The county files are parsed by
`src/lib/county-map` and converted to Tiled maps by `scripts/county-map` —
see "Converting to Tiled" below.

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
`BUILDING.MAP` doesn't follow this layout at all (see its own section
below) — it is **not** just three more county maps.

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
- `hi` = always 0 in this section (county files only — `BUILDING.MAP`'s
  flag grids, laid out the same way, carry flags there; see below).
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
buildings may be placed — see "Buildable locations: not encoded in the
county files" below.

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
test above relies on.

Splitting the `256` subcells by the tile beneath them, every single one
falls into exactly one of two shapes, with no exceptions in any county:

| county | whole water tiles (all 4 subcells `256`) | tile-784 subcells |
|---|---|---|
| BRAILA  | 3 (2 clusters) | 0 |
| CUERTA  | 52 (4 clusters) | 1 |
| FAGARAS | 8 (1 cluster) | 27 |
| GIURGIU | 34 (9 clusters) | 0 |
| TIRGO   | 0 | 22 |

- **On water** (tiles 702, 718, 1302, 1303, 1318, 1319) the bit covers all
  four subcells of a tile, replacing `4` rather than adding to it. The
  tiles form irregular blobs out in open water. They don't span a river
  bank to bank, and most don't reach a shore. `FAGARAS`'s is a 2×4-tile
  strip running *along* its river at the top map edge.
- **On tile 784**, a cliff-ridge tile, the bit replaces `0` on the tile's
  **top-left subcell only** (`256, 4, 0, 4` against the usual
  `0, 4, 0, 4`). It marks some but not all 784 tiles (27 of 48 in
  `FAGARAS`), and together they trace the western rim of the cliff
  ridges, every 3 tiles, in a lattice. That's dozens per map, and they
  follow the geology.

Neither shape looks like a building site: they come as blobs or as rows
along a ridge, not as a handful of discrete plots. What the bit actually
marks is still unresolved. A shallow/deep water distinction, or a climbable
cliff edge, both fit better than anything to do with buildings.

Remaining detail on the field:

- `4` and `256` are both powers of two (bit 2 and bit 8). `BUILDING.MAP`'s
  flag grids (below) additionally show `8, 12, 16, 32, 64, 128`,
  including `12 = 4|8` — i.e. this is a **bitmask of terrain/feature
  flags**, not an enum. Those extra bits appear **only** in `BUILDING.MAP`
  and never in a county file.
- Row width of 256 was derived the same way as Section A (autocorrelation
  minimum over divisors of 65,536).

`0x10000 (Section A) + 0x40000 (Section B) = 0x50000 = 327,680` — accounts
for the entire file, no leftover/unknown bytes.

### Buildable locations: not encoded in the county files

A dedicated search looked for per-map coordinates marking where buildings
(bridge, tower, castle, …) can be built. The expected signature was a
**handful of discrete spots per county, present in every county**, and
since the two sections already cover every byte of the file, any such
marker would have to sit inside one of them. Every place it could hide was
checked against all 12 counties. **None of them holds it.**

| candidate | verdict | evidence |
|---|---|---|
| Section A `hi` | empty | all-zero in all 12 counties |
| Section B `lo` | empty | all-zero in all 12 counties |
| Section B `hi` bit 8 (`256`) | not build spots | absent from 7 of 12 counties. Where present it's water blobs or a cliff-rim lattice, dozens of subcells rather than a few plots (see "`256` is not a third terrain class") |
| Section B `hi` bit 2 (`4`) deviations | not build spots | Section B is nearly a function of the tile beneath it. The cells that break from their tile's usual 2×2 pattern are one-subcell nudges along cliff and shore edges, plus a few isolated unblocked holes in open water that no unit could reach. There are 6–707 per county, scattered (2–240 clusters), with no shared shape |
| a marker tile index in Section A | not build spots | the only tile in all 12 counties at a few-per-map count is **701**, a signpost on a cairn, and it only ever sits on the map border. See "Map-edge signposts" below |
| building art stamped into Section A | none present | `BUILDING.MAP`'s three tile grids (interior, intact and ruined) use 922 distinct tiles. 856 of them — every roof, tower and wall — appear in **no** county. The other 66 are plain terrain (gravel, grass, water, shoreline, one tree), used for the ground around the compounds |
| a third section / trailing bytes | none | Sections A + B are exactly 327,680 bytes |

**Conclusion (high confidence for the negative):** county `.MAP` files do
not record buildable locations or building-type constraints. The natural
hypotheses — bits in Section B's `hi`, or marker tiles in Section A — were
tested directly and don't hold. A cell is walkable or blocked, and
that's all a county file says about it.

What this leaves open is **where** the build spots live, and this CD
can't answer that. It holds no game executable (only `ART/`, `AUDIO/`,
`CINEMA/` and `COUNTIES/`), so the remaining sources can't be checked from
here. In order of likelihood:

1. Hard-coded per county in the original executable, alongside the other
   scenario setup the `.MAP` files also leave out (unit spawns, for one).
2. Derived at runtime from terrain (e.g. any open grass area large enough
   for a prefab's footprint), with no per-map data at all.
3. `BUILDING.MAP`'s flag grids (3–14), if one of their flag regions turns
   out to be a per-county placement table rather than a per-prefab mask. Nothing
   suggests this yet, and prefab extraction is its own separate piece of work.

**Decision:** rather than wait on any of the above, build spots will be
**authored by hand**, the same way spawn points are: as objects in each
county's Tiled map, added/curated manually per county as that county's
scenario work needs them. There's no original data to convert them from,
so this is a deliberate scope call, not a placeholder pending further
research — it can be revisited if `BUILDING.MAP` prefab work (a separate
ticket) or another source later turns up real per-county placement data.

The evidence is pinned by golden tests across all 12 counties, in
`scripts/county-map/county-map-markers-golden.spec.ts` (skipped without
`.cd/`).

### Map-edge signposts (tile 701)

This turned up during the buildable-location search. It isn't a build spot,
but it is the only per-map *marker-like* feature a county file carries.
Tile 701 is a wooden signpost on a stone cairn over grass. It appears in
**every** county, 1–6 times, and **every** occurrence sits on the map
border (x or y is 0 or 127). It's always set in open grass, and its
Section B pattern (`4, 4, 0, 0`: top half blocked) is the same everywhere.

| county | signposts (x, y) |
|---|---|
| BRAILA  | (0,39) (0,120) |
| BRASOV  | (127,44) (0,69) (42,127) (84,127) |
| CUERTA  | (17,0) (123,0) |
| FAGARAS | (0,28) (127,43) (87,127) |
| GIURGIU | (72,0) (121,0) |
| HIRSOVA | (31,0) (0,78) |
| OSTROV  | (46,0) (0,19) |
| PITESTI | (77,0) (0,2) (124,127) |
| RASOVA  | (47,0) (0,8) |
| SIBIU   | (20,127) |
| SNAGOV  | (28,0) (127,19) (127,60) (0,62) (127,107) (27,127) |
| TIRGO   | (50,0) (0,45) (127,73) (71,127) |

The likeliest reading is that they mark where the county borders a
neighbour: an entry or exit point for armies arriving from the strategic
map. (Their surroundings are plain grass, tiles 1382–1387, not road.) That's an inference from where they sit and what they look
like. No game logic confirms it. They aren't currently converted into the
Tiled output.

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

## `COUNTIES/BUILDING.MAP` — 983,040 bytes = 15 × 128×128 grids

Same overall byte size as 3 county files, but it is **not** three county
maps, nor laid out like one. It is a series of **fifteen 128×128 grids**,
each exactly like a county's Section A: 4-byte records (`u16 lo`, `u16 hi`,
little-endian), stored column-major (`offset = gridOffset + (x*128 + y) *
4`). Grid `k` starts at byte `k * 65536`, so each 327,680-byte "block" holds
five grids. Parsed by `src/lib/building-map`.

| grid | offset | non-zero `lo` | max `lo` | `hi` distinct (non-zero cells) |
|---|---|---|---|---|
| 0 | `0x00000` | 15,913/16,384 | 1447 | `0` |
| 1 | `0x10000` | 4,940 | 1449 | `0` |
| 2 | `0x20000` | 2,767 | 1451 | `0` |
| 3–6 | `0x30000`–`0x60000` | 0 | — | `4,8,12,16,32,128,256` (5,230 / 3,788 / 2,157 / 2,944) |
| 7–10 | `0x70000`–`0xA0000` | 0 | — | `4,12,64,128` (5,959 / 3,802 / 1,655 / 2,715) |
| 11–14 | `0xB0000`–`0xE0000` | 0 | — | `4` (149 / 189 / 235 / 194) |

The first three grids hold tiles (`BATTLE.ART` atlas indices, all ≤ 1451,
inside the terrain tileset's verbatim range), drawn on one shared canvas
and aligned cell-for-cell:

- **Grid 0 — interior view.** Open buildings seen from above: wooden
  floors and the walls around them, on a plain grass fill (atlas tiles
  1382–1387). Every cell is a real tile: the 471 zero cells are atlas
  index 0, the plain ground tile, running as seams and lines through the
  building interiors — not holes. Every tile in this grid is fully opaque.
- **Grid 1 — intact exterior.** Battlements and red roofs. Where non-zero,
  the tile **replaces** the interior tile under it; `0` means no overlay.
  Only 229 of its 4,940 cells use a tile with any transparency.
- **Grid 2 — ruined state.** Crumbled walls with the interior still
  showing through, with the same alignment and semantics as grid 1 (34 of
  its 2,767 cells use a tile with any transparency).

Rendered, grid 0 shows **12 castle compounds**:

- 5 unmoated castles of increasing size down the left column;
- 1 large unmoated castle (top centre);
- 1 large moated castle (top right);
- 3 small castles on stone pads (right column);
- 2 moated castles (bottom);

plus two strips of loose wall, gate and palisade pieces. 121 overlay cells
(in both grid 1 and grid 2) lie on the grass fill just outside the walls —
hedge and rubble spill that belongs to the buildings.

Each compound is very likely one building "prefab", assembled once here
from atlas tiles and stamped into a county's Section A wherever that
building stands, rather than every county re-authoring every building tile
by tile. The file carries **no building names or identifiers** (no text at
all), and nothing else on the CD provides them.

Grids 3–14 have all-zero `lo` and carry only flag values in `hi`, the same
bitmask vocabulary as a county's Section B `hi` plus the extra bits
`8,16,32,64,128`. Their meaning, and which flag region belongs to which
building, is unresolved (see "Open questions" below).

> **Correction.** Earlier revisions of this document read each 327,680-byte
> block as a county file (a 128×128 Section A, then one 256×256 Section B),
> described eleven compounds, and noted that "block 0's Section B `lo`"
> held a second layer of tile data (7,707 non-zero cells, 554 distinct
> indices, max 1451). That reading is **wrong for this file**: block 0's
> "Section B" is grids 1–4, i.e. the two 128×128 overlay grids above
> (4,940 + 2,767 = 7,707 cells) followed by two flag-only grids. Drawn as
> one 256×256 grid, the buildings come out squashed and duplicated.
> Likewise the "Section A `hi`" of blocks 1 and 2 is the `hi` of grids 5
> and 10.

## Converting to Tiled

A county converts to a Tiled map, drawn with the committed
`public/maps/terrain.tsx` tileset, with:

```
npm run convert:map -- FAGARAS
```

The name is case-insensitive (`BUILDING` converts `BUILDING.MAP` instead;
see "Converting `BUILDING.MAP`" below). The script reads
`COUNTIES/<NAME>.MAP` from the CD data
(`DROTR_CD_DIR`, defaulting to `.cd/`) and writes
`public/maps/<name>.tmj`. The raw `.MAP` is never committed, but the
converted `.tmj` is (so far `fagaras.tmj`). The output is deterministic,
so re-running the script over an up-to-date file changes nothing.
`src/lib/county-map` does the pure parsing and
`scripts/county-map/county-map-tiled.ts` builds the Tiled JSON.

The map is 128×128 tiles of 40 px, matching the tileset, and references
`terrain.tsx` as its only (external) tileset, at `firstgid` 1. It has three
layers:

- **`terrain`** — Section A, the full ground layer: `gid = tile index + 1`,
  so index 0 is gid 1 and gid 0 never appears. The engine's collision grid
  is built from this layer, through the tileset's per-tile `blocked` flags.
- **`spawns`** — an empty object layer; spawn points aren't in the `.MAP`
  and are placed by hand.
- **`collision`** — hidden by default. Section B collapsed to one
  value per tile (blocked only when all four subcells are; see "Test
  fixture strategy" below), drawn as the plain ground tile (gid 1) where
  blocked and left empty (gid 0) where open. It is **for inspection in the
  Tiled editor only**: toggle it on (and `terrain` off) to see the original
  collision data. The engine never reads it; the loader only looks at the
  layer named `terrain`.

The two collision sources don't agree. For `FAGARAS`, the collapsed
Section B mask blocks **3,315** tiles, while the tileset-derived grid the
engine actually uses blocks **5,152**; they differ on **1,859 of 16,384
cells (11.3%)**. Per tile, the number of blocked subcells is 0 for 10,748
tiles, 1 for 448, 2 for 1,049, 3 for 824 and 4 for 3,315. (Counting only
bit 2, i.e. leaving the `256`-only subcells open, would give 3,307 blocked
tiles and 1,867 disagreeing cells instead.) Which source the engine should
end up using is still open.

### Converting `BUILDING.MAP`

```
npm run convert:map -- BUILDING
```

converts `COUNTIES/BUILDING.MAP` **as-is** into one Tiled map,
`public/maps/buildings.tmj` (committed), on the same terms as a county —
128×128 tiles of 40 px, `terrain.tsx` at `firstgid` 1, `gid = atlas index +
1`, deterministic output. `scripts/county-map/building-map-tiled.ts` builds
it. Its layers, back to front:

- **`terrain`** — grid 0, the interior view, every cell set (index 0 is
  gid 1). The engine's collision grid comes from this layer.
- **`intact`** — grid 1, visible. Empty (gid 0) where the grid is 0.
- **`ruined`** — grid 2, **hidden**. Empty (gid 0) where the grid is 0.
  The engine drops hidden layers, so this one is for inspection in the
  Tiled editor: toggle `intact` off and `ruined` on.
- **`spawns`** — an empty object layer (the loader requires one).

In the engine it is the `buildings` map; view it with the `empty`
scenario, which spawns nothing and is allowed on every map
(`/game?map=buildings&scenario=empty`).

## Open questions for later

- The individual compounds in `BUILDING.MAP` (and its loose wall pieces)
  need their bounding boxes extracted (e.g. connected-component analysis
  on the interior grid) so each prefab can be cut out and placed
  independently, in all three states. Today `buildings.tmj` is the whole
  file as-is.
- What `BUILDING.MAP`'s flag grids (3–14, `hi` values `4, 8, 12, 16, 32,
  64, 128, 256`) mean, and which flag region belongs to which building
  (same coordinates? a lookup by index?). They come in three runs of four
  grids with distinct vocabularies (see the table above). Also, whether a
  building's placement *into* a county map is recorded anywhere. It isn't
  in the county file itself: no county contains any prefab building tile
  (see "Buildable locations" above).
- **Where build spots come from.** They aren't in the county files (see
  "Buildable locations: not encoded in the county files" above). The
  remaining candidates are the original executable (not on this CD),
  runtime derivation from terrain, or `BUILDING.MAP`'s flag grids — but the
  decision made there is to hand-author build spots in the Tiled maps
  rather than wait on one of those being confirmed.
- What the Section B `hi` bits *other than* bit 2 mean, including what
  bit 8 (`256`) marks on the water blobs and cliff-rim subcells it occurs
  on. `BUILDING.MAP`
  shows more bits set (`8,16,32,64,128`) than any county file (`4,256`
  only), so county data alone won't resolve the rest.
- Whether Section A's `hi` field is ever non-zero in a *county* file (only
  ever seen non-zero in `BUILDING.MAP`'s flag grids so far).

Resolved since: Section B's cell order (column-major, same as Section A),
whether a separate ground layer exists elsewhere on the CD (it does not),
and whether county files carry buildable-location markers (they do not) —
all covered in their sections above.

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

The county `.MAP` parser, `src/lib/county-map`, and its converter,
`scripts/county-map` (see "Converting to Tiled" above), follow it too.
Their tests use a **synthetic fixture** (`src/test/county-map-fixture.ts`):
a hand-built, in-memory 327,680-byte buffer with a handful of Section A
`lo` tile indices and Section B `hi` flag values (`4`, `256`) set, never a
trimmed copy of a real county file. That's enough to exercise the
section-offset math, the 128×128 / 256×256 **column-major** decoding (file
order: `offset = (x*size + y) * 4`), and the two-`u16`-per-record layout
without shipping any original game data. The parser reads the file
column-major but stores both grids **row-major** (`[y*size + x]`), like
every other grid in the engine. Golden tests against the real `FAGARAS.MAP`
skip when `.cd/` is absent. The `BUILDING.MAP` parser, `src/lib/building-map`,
does the same with its own synthetic 983,040-byte fixture
(`src/test/building-map-fixture.ts`) and golden tests against the real file.

The parser treats a Section B subcell as blocked when `hi != 0`, so a
subcell carrying only `256` counts (see "`256` is not a third terrain
class" above). `collapseCollisionMaskPerTile` folds the 2×2 subcells down
to one value per tile, which is blocked only when **all four** of its
subcells are.
