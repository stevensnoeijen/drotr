# `.ART` file format (reverse-engineered)

Notes from decoding the original game's `ART/*.ART` files. The decoder
these describe lives in [`src/lib/art`](../src/lib/art), and
`#/game?case=atlas` renders the result in the browser for inspection.

## The container is a plain PCX

Despite the extension, `.ART` is **not a bespoke container**. Every `.ART`
file on the CD is a stock **ZSoft PCX version 5** image:

| offset | field | value in `BATTLE.ART` |
|---|---|---|
| 0 | manufacturer | `0x0A` (ZSoft) |
| 1 | version | `5` (3.0, palette at end of file) |
| 2 | encoding | `1` (run-length encoded) |
| 3 | bits per pixel | `8` |
| 4-11 | window `xMin,yMin,xMax,yMax` | `0,0,639,9366` |
| 12-15 | horizontal/vertical DPI | `300,300` |
| 16-63 | EGA palette | all zero (unused) |
| 65 | colour planes | `1` |
| 66-67 | bytes per scanline | `640` |
| 68-69 | palette info | `1` (colour) |
| 70-73 | screen size | `640x480` |

The window is **inclusive**, so the image is
`xMax - xMin + 1` by `yMax - yMin + 1` — 640x9367 for `BATTLE.ART`.

Pixel data starts at offset 128 and is RLE-encoded: a byte whose top two
bits are both set is a packet header whose low six bits are a repeat count,
followed by the value byte; any other byte is a single literal pixel. Runs
do not cross scanline boundaries in these files, and each scanline is
stored padded out to `bytesPerLine` (which equals the width here, so there
is no padding in practice).

The last 769 bytes of the file are a `0x0C` marker followed by **256 RGB
triples** at full 8-bit range (no 6-bit VGA scaling needed). Decoding
`BATTLE.ART`'s RLE stream consumes exactly the bytes between offset 128 and
that marker and yields exactly 9367 scanlines of 640 — no leftover, no
shortfall, which is what confirms the file is intact and complete as
shipped.

All six files share that shape, so one decoder covers them:

| file | size | bytes |
|---|---|---|
| `BATTLE.ART` | 640x9367 | 3,718,333 |
| `COUNCIL.ART` | 640x3594 | 1,625,423 |
| `MENU.ART` | 640x1909 | 1,252,667 |
| `LOADING.ART` | 640x480 | 282,489 |
| `CREDITS.ART` | 640x524 | 163,341 |
| `DEMO.ART` | 640x480 | 161,583 |

## Transparency: the teal colour key

PCX has no alpha channel. The art instead reserves one colour,
**`(0, 251, 192)`** teal, as a "draw nothing" key. In `BATTLE.ART` it
occupies **exactly one palette slot, index 37**, and no other entry shares
that value — so the key is unambiguous and no genuine art pixel can collide
with it. 2,679,365 of the sheet's 5,994,880 pixels (44.7%) are the key.

The decoder resolves it to real alpha, and zeroes the colour channels of
keyed pixels as well as their alpha, so that an interpolating or
premultiplying consumer can't bleed teal into sprite edges.

## `BATTLE.ART` — the tile atlas

The sheet is one flat, row-major grid of square tiles that a `.MAP` cell
indexes directly:

```
tile_index = row * 16 + column
row    = tile_index / 16
column = tile_index % 16
x0, y0 = column * 40, row * 40   (tile occupies [x0,y0]..[x0+40,y0+40))
```

- Tiles are **40x40 px**, **16 columns** wide (640 / 40 = 16).
- 9367 px of height is **234 whole rows** plus 7 leftover pixel rows, so
  the sheet holds **3744 complete tiles**, indices 0–3743.
- The county maps use indices 0–1471, comfortably inside that.

### How the tile size was established

Two independent measurements, neither of which assumes an answer:

1. **Edge-energy periodicity.** Summing per-pixel absolute luminance
   differences down every column (and across every row) of the opaque
   terrain region, then scoring each candidate period by how much of that
   energy lands on its boundaries, gives a clear fundamental at **40 px on
   both axes**. 80 appears only as its harmonic; **64 does not register at
   all**.

2. **Stride in the map data.** A multi-tile object placed in a county
   `.MAP` steps by **+1** between horizontally adjacent cells and **+16**
   between vertically adjacent ones. A +16 vertical stride *is* a
   16-column grid, and it agrees with 640 / 40 = 16.

Cross-checked visually: tiles 1437–1439, 1453–1455 and 1469–1471 form a
single coherent 3x3 rocky-shoreline object on this grid (three horizontal
runs of three, stacked), and rendering a whole county map with it produces
continuous, correct terrain.

### Composition

Measured per tile over the whole sheet:

- 1576 of 3744 tiles are **fully opaque** (no keyed pixel).
- The first tile containing any transparency is **index 205** (row 12), so
  roughly the first twelve rows are solid terrain.
- Opaque and keyed tiles are interleaved after that rather than split into
  two clean regions — terrain, sprite frames, a bitmap font and UI
  furniture all share the one index space.

## Correcting the earlier 64x64 reading

Earlier notes (in `docs/MAP_FORMAT.md` and `docs/ASSETS.md`) read this
sheet as **64x64 tiles, 10 columns**, and concluded that the art was
**truncated at tile index 1459** while the maps referenced up to 1471 —
that the last twelve tiles had been lost by a bad conversion step.

That conclusion was an artifact of the wrong grid, not a real defect:

- On a 64px/10-column reading, 9367 px is 146 whole rows plus a 23px
  remainder, capping the highest complete index at 1459. The shortfall was
  arithmetic from the wrong tile size.
- Nothing was actually lost. `.cd/ART/BATTLE.png` is 640x9367 — the same
  dimensions as the source `.ART` — so that conversion was faithful; only
  its interpretation was wrong.
- On the measured 40px/16-column grid the sheet holds 3744 tiles, and
  1460–1471 are ordinary, fully present tiles (part of the shoreline
  object above).

The remaining genuine complaints about `BATTLE.png` still stand: it is an
8-bit palettised PNG carrying the teal key rather than alpha, and it is a
local-only conversion of copyrighted data. The decoder supersedes it.

## Test fixture strategy

The `.ART` files are original commercial game assets and this repository is
public, so — like the `.MAP` files (see
[`MAP_FORMAT.md`](./MAP_FORMAT.md)) — they stay local-only under `.cd/` and
are never committed.

Accordingly the decoder's tests come in two layers:

- **Synthetic fixtures** (`src/test/pcx-fixture.ts`) build byte-accurate
  PCX buffers in memory and cover the format-level behaviour — header
  parsing, RLE expansion, scanline padding, palette handling, colour
  keying, tile geometry and every rejection path. These always run.
- **Golden tests** (`src/lib/art/battle-art.spec.ts`) pin the real
  `BATTLE.ART` decode to recorded SHA-256 hashes of its pixels. They record
  only hashes, never pixel data, so nothing reproduces the original
  artwork; they skip themselves wherever `.cd/` is absent, CI included.

`DROTR_CD_DIR` overrides where the CD data is looked up. In development the
Vite config serves it under `/cd/`, so the `?case=atlas` viewer can fetch
and decode the real files in the browser; a production build serves
nothing.

## Terrain tileset export

`src/lib/art/terrain-tileset.ts` builds a Tiled tileset named `terrain`
out of the decoded atlas: only the map-art tiles (terrain, walls,
buildings, the drawbridge and rubble) — no unit sprites, no UI. It's meant
to be referenced by a `.MAP` converter with tile indices unchanged, and to
open cleanly in the Tiled editor.

- **Included range.** Atlas tiles **0–1471** (rows 0–91) verbatim, `id =
  index` — these are all map art (see "Composition" above).
- **Extras.** Two small exceptions live further down the sheet, among the
  UI rows, and are appended after row 91 at their original columns so
  multi-tile pieces stay stampable as a block:
  - **Drawbridge** (24 tiles): atlas rows 98–101, columns 10–15 → indices
    1578–1583, 1594–1599, 1610–1615, 1626–1631.
  - **Rubble** (5 tiles, for damaged/destroyed walls later): atlas row
    102, columns 10–14 → indices 1642–1646.
  - Both map to a tileset id via one constant offset,
    `EXTRA_TILE_ID_OFFSET = 96` (e.g. atlas 1578 → id 1482).
- **Filler ids.** The tileset is 640×3880 px, 97 rows × 16 columns, 1552
  tile slots. Rows 92–96 hold the extras at their original columns and are
  otherwise unused padding — ids 1472–1481, 1488–1497, 1504–1513,
  1520–1529, 1536–1545 and 1551 are never referenced and stay fully
  transparent.
- **gid.** The `.tsx` is always referenced with `firstgid = 1`, so
  `gid = id + 1`. Index 0 is a real ground tile (see above), not a "no
  tile" sentinel, so it becomes gid 1 like every other tile — gid 0 is
  never emitted for a real cell.

To (re)generate the committed `public/maps/terrain.tsx` and `terrain.png`,
run `npm run export:terrain-tileset` with `.cd/` present. Generation is
deterministic: pngjs encodes with defaults that emit no timestamp chunk, so
re-running the script against the same `BATTLE.ART` on the pinned Node
version (`.nvmrc`) reproduces both files byte-for-byte.
