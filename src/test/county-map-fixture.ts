/**
 * Builds synthetic byte buffers shaped like the original game's county
 * `COUNTIES/<NAME>.MAP` files.
 *
 * The real `.MAP` data is original commercial game content and is
 * deliberately not committed to this repository (see `docs/MAP_FORMAT.md`),
 * so parser and converter tests exercise hand-built buffers in this shape
 * instead. Everything not explicitly set is zero.
 */

import {
  COUNTY_MAP_BYTES,
  RECORD_BYTES,
  SECTION_A_OFFSET,
  SECTION_A_SIZE,
  SECTION_B_OFFSET,
  SECTION_B_SIZE,
} from '~/lib/county-map';

/** One field value to write into a synthetic county file. */
export interface CountyMapFixtureCell {
  readonly x: number;
  readonly y: number;
  readonly value: number;
}

export interface CountyMapFixtureOptions {
  /** Section A `lo` values (atlas tile indices) to set, by tile. */
  readonly tiles?: readonly CountyMapFixtureCell[];
  /** Section A `hi` values to set, by tile (always 0 in real county files). */
  readonly tileHi?: readonly CountyMapFixtureCell[];
  /** Section B `hi` values (collision bitmasks) to set, by subcell. */
  readonly collision?: readonly CountyMapFixtureCell[];
  /** Section B `lo` values to set, by subcell (always 0 in real county files). */
  readonly collisionLo?: readonly CountyMapFixtureCell[];
}

/** File offset of the record at `(x, y)` in a column-major section. */
export function recordOffset(
  sectionOffset: number,
  size: number,
  x: number,
  y: number
): number {
  return sectionOffset + (x * size + y) * RECORD_BYTES;
}

/** Builds a {@link COUNTY_MAP_BYTES}-long county file, column-major like the real ones. */
export function buildCountyMapBytes(
  options: CountyMapFixtureOptions = {}
): Uint8Array {
  const bytes = new Uint8Array(COUNTY_MAP_BYTES);
  const view = new DataView(bytes.buffer);
  const write = (
    cells: readonly CountyMapFixtureCell[] | undefined,
    sectionOffset: number,
    size: number,
    fieldOffset: number
  ) => {
    for (const { x, y, value } of cells ?? []) {
      const offset = recordOffset(sectionOffset, size, x, y) + fieldOffset;
      view.setUint16(offset, value, true);
    }
  };

  write(options.tiles, SECTION_A_OFFSET, SECTION_A_SIZE, 0);
  write(options.tileHi, SECTION_A_OFFSET, SECTION_A_SIZE, 2);
  write(options.collisionLo, SECTION_B_OFFSET, SECTION_B_SIZE, 0);
  write(options.collision, SECTION_B_OFFSET, SECTION_B_SIZE, 2);
  return bytes;
}

/** The four subcells of tile `(x, y)`, each set to the matching entry of `values`. */
export function tileSubcells(
  x: number,
  y: number,
  values: readonly [number, number, number, number]
): CountyMapFixtureCell[] {
  const [topLeft, topRight, bottomLeft, bottomRight] = values;
  return [
    { x: x * 2, y: y * 2, value: topLeft },
    { x: x * 2 + 1, y: y * 2, value: topRight },
    { x: x * 2, y: y * 2 + 1, value: bottomLeft },
    { x: x * 2 + 1, y: y * 2 + 1, value: bottomRight },
  ];
}
