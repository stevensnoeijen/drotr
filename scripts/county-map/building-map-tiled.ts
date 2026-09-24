import type { TiledMap } from 'tiled-types';

import {
  BUILDING_GRID_SIZE,
  type BuildingMap,
} from '../../src/lib/building-map';

import {
  atlasIndexGid,
  buildTerrainTiledMap,
  spawnsLayer,
  tileLayer,
} from './county-map-tiled';

/**
 * Converts a decoded `BUILDING.MAP` (see `src/lib/building-map`) as-is into
 * one Tiled map, `buildings`, drawn with the committed
 * `public/maps/terrain.tsx` tileset in the shape `parseTiledMap` in
 * `src/game/map/load-tiled-map.ts` accepts. Same size, tile size, tileset
 * reference and key order as a converted county (see `./county-map-tiled`).
 *
 * The output has four layers, back to front:
 *
 * - `terrain`: the interior grid, every cell set (`gid = atlas index + 1`,
 *   so index 0 is gid 1). The engine's collision grid comes from its tiles'
 *   `blocked` flags.
 * - `intact`: the intact exterior overlay, visible. Empty (gid 0) where
 *   the grid is 0.
 * - `ruined`: the ruined overlay, hidden. Empty (gid 0) where the grid is 0.
 *   The engine loads it but starts it hidden; to see it, toggle `intact`
 *   off and `ruined` on, in the Tiled editor or through the engine's
 *   `tile-layers` debug option.
 * - `spawns`: an empty object layer (the loader requires one).
 */

function interiorData(map: BuildingMap): number[] {
  return gridData(map.interior, (index, x, y) => atlasIndexGid(index, x, y));
}

/** An overlay grid's gids: `0` stays empty, anything else is a tile. */
function overlayData(grid: Uint16Array): number[] {
  return gridData(grid, (index, x, y) =>
    index === 0 ? 0 : atlasIndexGid(index, x, y)
  );
}

function gridData(
  grid: Uint16Array,
  toGid: (index: number, x: number, y: number) => number
): number[] {
  const data: number[] = new Array(BUILDING_GRID_SIZE * BUILDING_GRID_SIZE);
  for (let y = 0; y < BUILDING_GRID_SIZE; y++) {
    for (let x = 0; x < BUILDING_GRID_SIZE; x++) {
      const index = y * BUILDING_GRID_SIZE + x;
      data[index] = toGid(grid[index], x, y);
    }
  }
  return data;
}

/**
 * Builds the `buildings` Tiled map for a decoded `BUILDING.MAP`.
 * {@link serializeTiledMap} of the result is deterministic.
 *
 * @throws {RangeError} for a tile index above the verbatim atlas range, in
 * any of the three grids.
 */
export function buildBuildingsTiledMap(map: BuildingMap): TiledMap {
  return buildTerrainTiledMap([
    tileLayer(1, 'terrain', interiorData(map)),
    tileLayer(2, 'intact', overlayData(map.intact)),
    tileLayer(3, 'ruined', overlayData(map.ruined), false),
    spawnsLayer(4),
  ]);
}
