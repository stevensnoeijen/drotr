/**
 * Builds synthetic byte buffers shaped like the original game's
 * `COUNTIES/BUILDING.MAP`.
 *
 * Like the county `.MAP` files, the real file is original commercial game
 * content and is deliberately not committed to this repository (see
 * `docs/MAP_FORMAT.md`), so parser and converter tests exercise hand-built
 * buffers in this shape instead. Everything not explicitly set is zero.
 */

import {
  BUILDING_GRID_SIZE,
  BUILDING_MAP_BYTES,
  INTACT_GRID_OFFSET,
  INTERIOR_GRID_OFFSET,
  RUINED_GRID_OFFSET,
} from '~/lib/building-map';

import { recordOffset, type CountyMapFixtureCell } from './county-map-fixture';

/** One field value to write into a synthetic building file. */
export type BuildingMapFixtureCell = CountyMapFixtureCell;

export interface BuildingMapFixtureOptions {
  /** Grid 0 `lo` values (interior atlas indices) to set, by cell. */
  readonly interior?: readonly BuildingMapFixtureCell[];
  /** Grid 1 `lo` values (intact overlay atlas indices) to set, by cell. */
  readonly intact?: readonly BuildingMapFixtureCell[];
  /** Grid 2 `lo` values (ruined overlay atlas indices) to set, by cell. */
  readonly ruined?: readonly BuildingMapFixtureCell[];
  /**
   * Raw `u16` writes at arbitrary byte offsets, for the fields the parser
   * ignores (`hi` fields, the flag grids past grid 2).
   */
  readonly raw?: Readonly<Record<number, number>>;
}

/** Builds a {@link BUILDING_MAP_BYTES}-long building file, column-major like the real one. */
export function buildBuildingMapBytes(
  options: BuildingMapFixtureOptions = {}
): Uint8Array {
  const bytes = new Uint8Array(BUILDING_MAP_BYTES);
  const view = new DataView(bytes.buffer);
  const write = (
    cells: readonly BuildingMapFixtureCell[] | undefined,
    gridOffset: number
  ) => {
    for (const { x, y, value } of cells ?? []) {
      view.setUint16(
        recordOffset(gridOffset, BUILDING_GRID_SIZE, x, y),
        value,
        true
      );
    }
  };

  write(options.interior, INTERIOR_GRID_OFFSET);
  write(options.intact, INTACT_GRID_OFFSET);
  write(options.ruined, RUINED_GRID_OFFSET);
  for (const [offset, value] of Object.entries(options.raw ?? {})) {
    view.setUint16(Number(offset), value, true);
  }
  return bytes;
}
