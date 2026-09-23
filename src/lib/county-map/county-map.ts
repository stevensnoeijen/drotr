/**
 * Parser for the original game's county maps, `COUNTIES/<NAME>.MAP`.
 *
 * A county file is a fixed 327,680 bytes: two grids of 4-byte
 * little-endian records, each record two `u16` fields, `lo` then `hi`.
 * Both grids are stored **column-major** in the file (`offset = (x * size
 * + y) * 4`), and both are handed back **row-major** (`[y * size + x]`), the
 * layout every other grid in the engine uses. See `docs/MAP_FORMAT.md` for
 * how the layout was established.
 *
 * - Section A, a 128×128 grid at offset `0x00000`: `lo` is the tile's
 *   `BATTLE.ART` atlas index (index 0 is a real ground tile, not an empty
 *   cell). `hi` is always 0 in a county file.
 * - Section B, a 256×256 grid at offset `0x10000`, two subcells per tile
 *   per axis: `hi` is a collision bitmask (`0`, `4`, rarely `256` in county
 *   files), and `lo` is always 0.
 *
 * The parser keeps only those two meaningful fields and doesn't validate
 * the always-zero ones; that invariant is checked against the real files by
 * the golden tests instead.
 */

/** Exact size of every county `.MAP` file, in bytes. */
export const COUNTY_MAP_BYTES = 327680;

/** Byte offset of Section A, the tile grid. */
export const SECTION_A_OFFSET = 0x00000;
/** Cells per axis in Section A. */
export const SECTION_A_SIZE = 128;

/** Byte offset of Section B, the collision grid. */
export const SECTION_B_OFFSET = 0x10000;
/** Cells (subcells) per axis in Section B: two per tile. */
export const SECTION_B_SIZE = 256;

/** Size of one cell's record: a `u16 lo` and a `u16 hi`, both little-endian. */
export const RECORD_BYTES = 4;

/** Byte offset of the `hi` field within a record. */
const HI_FIELD_OFFSET = 2;

/** A decoded county map, both grids row-major. */
export interface CountyMap {
  /**
   * Section A `lo`: the atlas tile index of every cell, row-major
   * (`tiles[y * 128 + x]`), `128 * 128` long.
   */
  readonly tiles: Uint16Array;
  /**
   * Section B `hi`: the collision bitmask of every subcell, row-major
   * (`collisionMask[y * 256 + x]`), `256 * 256` long. Any non-zero value
   * means the subcell is blocked.
   */
  readonly collisionMask: Uint16Array;
}

/** Thrown for a buffer that isn't shaped like a county `.MAP` file. */
export class CountyMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CountyMapError';
  }
}

/**
 * Reads one field of every record in a square, column-major section into a
 * row-major grid.
 */
function readSection(
  view: DataView,
  sectionOffset: number,
  size: number,
  fieldOffset: number
): Uint16Array {
  const grid = new Uint16Array(size * size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const offset = sectionOffset + (x * size + y) * RECORD_BYTES;
      grid[y * size + x] = view.getUint16(offset + fieldOffset, true);
    }
  }
  return grid;
}

/**
 * Decodes a county `.MAP` file.
 *
 * @throws {CountyMapError} unless `bytes` is exactly
 * {@link COUNTY_MAP_BYTES} long.
 */
export function parseCountyMap(bytes: Uint8Array): CountyMap {
  if (bytes.length !== COUNTY_MAP_BYTES) {
    throw new CountyMapError(
      `County map must be exactly ${COUNTY_MAP_BYTES} bytes, got ${bytes.length}`
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    tiles: readSection(view, SECTION_A_OFFSET, SECTION_A_SIZE, 0),
    collisionMask: readSection(
      view,
      SECTION_B_OFFSET,
      SECTION_B_SIZE,
      HI_FIELD_OFFSET
    ),
  };
}

/** The atlas tile index at tile `(x, y)`. */
export function tileAt(map: CountyMap, x: number, y: number): number {
  return map.tiles[y * SECTION_A_SIZE + x];
}

/** The collision bitmask at subcell `(sx, sy)`. */
export function subcellAt(map: CountyMap, sx: number, sy: number): number {
  return map.collisionMask[sy * SECTION_B_SIZE + sx];
}

/**
 * Collapses Section B's 2×2 subcells down to one collision value per tile,
 * row-major (`[y * 128 + x]`), `128 * 128` long: `1` only when **all four**
 * of the tile's subcells are blocked (any non-zero bitmask, so a lone `256`
 * counts), `0` otherwise.
 */
export function collapseCollisionMaskPerTile(map: CountyMap): Uint8Array {
  const collapsed = new Uint8Array(SECTION_A_SIZE * SECTION_A_SIZE);
  for (let y = 0; y < SECTION_A_SIZE; y++) {
    for (let x = 0; x < SECTION_A_SIZE; x++) {
      const sx = x * 2;
      const sy = y * 2;
      const blocked =
        subcellAt(map, sx, sy) !== 0 &&
        subcellAt(map, sx + 1, sy) !== 0 &&
        subcellAt(map, sx, sy + 1) !== 0 &&
        subcellAt(map, sx + 1, sy + 1) !== 0;
      collapsed[y * SECTION_A_SIZE + x] = blocked ? 1 : 0;
    }
  }
  return collapsed;
}
