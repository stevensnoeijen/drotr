/**
 * Parser for the original game's building library, `COUNTIES/BUILDING.MAP`.
 *
 * The file is a fixed 983,040 bytes: fifteen back-to-back 128×128 grids of
 * the same 4-byte little-endian records a county's Section A uses (a `u16
 * lo`, then a `u16 hi`), each stored **column-major** (`offset = gridOffset
 * + (x * 128 + y) * 4`) and handed back **row-major** (`[y * 128 + x]`).
 * Grid `k` starts at byte `k * 65536`. See `docs/MAP_FORMAT.md` for how the
 * layout was established.
 *
 * Only the first three grids' `lo` fields hold tiles, all `BATTLE.ART`
 * atlas indices drawn on one shared 128×128 canvas:
 *
 * - grid 0: the **interior** view (floors and walls seen from above, on a
 *   grass fill). Every cell is a real tile; index 0 is the plain ground
 *   tile, not an empty cell.
 * - grid 1: the **intact** exterior (battlements and roofs), aligned
 *   cell-for-cell with grid 0. A non-zero tile replaces the interior tile
 *   under it; `0` means no overlay.
 * - grid 2: the **ruined** state (crumbled walls), with the same alignment
 *   and semantics as grid 1.
 *
 * The remaining grids carry only flag values in `hi`, whose meaning is
 * unresolved, so the parser doesn't read them.
 */

import { readSection, RECORD_BYTES, SECTION_A_SIZE } from '../county-map';

/** Cells per axis in every grid of the file (the same as a county's Section A). */
export const BUILDING_GRID_SIZE = SECTION_A_SIZE;

/** Size of one grid, in bytes: `128 * 128` records of {@link RECORD_BYTES}. */
export const BUILDING_GRID_BYTES =
  BUILDING_GRID_SIZE * BUILDING_GRID_SIZE * RECORD_BYTES;

/** Number of back-to-back grids in the file. */
export const BUILDING_GRID_COUNT = 15;

/** Exact size of `BUILDING.MAP`, in bytes. */
export const BUILDING_MAP_BYTES = BUILDING_GRID_COUNT * BUILDING_GRID_BYTES;

/** Byte offset of grid 0, the interior view. */
export const INTERIOR_GRID_OFFSET = 0 * BUILDING_GRID_BYTES;
/** Byte offset of grid 1, the intact exterior overlay. */
export const INTACT_GRID_OFFSET = 1 * BUILDING_GRID_BYTES;
/** Byte offset of grid 2, the ruined overlay. */
export const RUINED_GRID_OFFSET = 2 * BUILDING_GRID_BYTES;

/** The three tile grids of a decoded `BUILDING.MAP`, all row-major. */
export interface BuildingMap {
  /**
   * Grid 0 `lo`: the interior view's atlas tile index for every cell,
   * row-major (`interior[y * 128 + x]`), `128 * 128` long. Every cell is a
   * real tile, index 0 included.
   */
  readonly interior: Uint16Array;
  /**
   * Grid 1 `lo`: the intact exterior's atlas tile index, row-major, `128 *
   * 128` long. `0` means no overlay on that cell.
   */
  readonly intact: Uint16Array;
  /**
   * Grid 2 `lo`: the ruined state's atlas tile index, row-major, `128 *
   * 128` long. `0` means no overlay on that cell.
   */
  readonly ruined: Uint16Array;
}

/** Thrown for a buffer that isn't shaped like `BUILDING.MAP`. */
export class BuildingMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildingMapError';
  }
}

/**
 * Decodes `BUILDING.MAP`.
 *
 * @throws {BuildingMapError} unless `bytes` is exactly
 * {@link BUILDING_MAP_BYTES} long.
 */
export function parseBuildingMap(bytes: Uint8Array): BuildingMap {
  if (bytes.length !== BUILDING_MAP_BYTES) {
    throw new BuildingMapError(
      `Building map must be exactly ${BUILDING_MAP_BYTES} bytes, got ${bytes.length}`
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readLo = (gridOffset: number) =>
    readSection(view, gridOffset, BUILDING_GRID_SIZE, 0);
  return {
    interior: readLo(INTERIOR_GRID_OFFSET),
    intact: readLo(INTACT_GRID_OFFSET),
    ruined: readLo(RUINED_GRID_OFFSET),
  };
}
