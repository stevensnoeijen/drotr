import type { TiledMap, TiledObject } from 'tiled-types';

import {
  BUILDING_GRID_SIZE,
  type BuildingMap,
} from '../../src/lib/building-map';

import type { BuildingPrefab } from '../dracula-exe';

import type { SpareBridge } from './spare-bridges';

import {
  atlasIndexGid,
  buildTerrainTiledMap,
  COUNTY_TILE_SIZE,
  objectLayer,
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
 * The output has six layers, back to front:
 *
 * - `terrain`: the interior grid, every cell set (`gid = atlas index + 1`,
 *   so index 0 is gid 1).
 * - `intact`: the intact exterior overlay, hidden. Empty (gid 0) where
 *   the grid is 0.
 * - `ruined`: the ruined overlay, hidden. Empty (gid 0) where the grid is 0.
 *
 * So by default only the interior view shows. The engine loads both
 * overlays but starts them hidden; to see a building intact or ruined, toggle
 * `intact` or `ruined` on, in the Tiled editor or through the engine's
 * `tile-layers` debug option.
 * - `collision`: hidden, and currently all open (every cell gid 0) — real
 *   building collision isn't derived yet. The source is unresolved: either
 *   the `intact` overlay's footprint or `BUILDING.MAP`'s unread flag grids
 *   3-14 (see `docs/MAP_FORMAT.md`). A follow-up will fill this in; until
 *   then a unit can walk straight through a building.
 * - `spawns`: an empty object layer (the loader requires one).
 * - `prefabs`: one rectangle per building prefab, marking where its art sits
 *   in this map (see {@link buildingPrefabObjects}).
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
export function buildBuildingsTiledMap(
  map: BuildingMap,
  prefabs: readonly BuildingPrefab[] = [],
  spareBridges: readonly SpareBridge[] = []
): TiledMap {
  const prefabObjects = buildingPrefabObjects(prefabs, spareBridges);
  return {
    ...buildTerrainTiledMap([
      tileLayer(1, 'terrain', interiorData(map)),
      tileLayer(2, 'intact', overlayData(map.intact), false),
      tileLayer(3, 'ruined', overlayData(map.ruined), false),
      tileLayer(4, 'collision', allOpenCollisionData(), false),
      spawnsLayer(5),
      objectLayer(6, PREFABS_LAYER_NAME, prefabObjects),
    ]),
    nextobjectid: prefabObjects.length + 1,
  };
}

/** Name of the object layer marking each building prefab. */
export const PREFABS_LAYER_NAME = 'prefabs';

/**
 * The `prefabs` objects, ids from 1: one rectangle per prefab, exactly its
 * source rectangle from `DRACULA.EXE` (tiles × 40, in pixels), with the
 * category as its Tiled class (`type`).
 *
 * `spareBridges` follow the prefabs: bridges drawn in the map that no
 * `DRACULA.EXE` slot covers.
 *
 * Names are `castle-<level>`, `tower-<level>` and
 * `bridge-<level>-<orientation>-<bank>-<slot>`; the slot keeps bridge names
 * unique, since two slots can share a shape. A spare bridge has no slot and
 * is `bridge-<level>-<orientation>-<bank>-spare-<length>` instead, unique
 * because no two spare bridges share a shape and length.
 *
 * String properties, in the alphabetical order Tiled writes them:
 * `bank` and `orientation` (bridges only), `category`, `level`, and `slot`
 * (an int; absent on a spare bridge).
 */
export function buildingPrefabObjects(
  prefabs: readonly BuildingPrefab[],
  spareBridges: readonly SpareBridge[] = []
): TiledObject[] {
  const entries: {
    category: BuildingPrefab['category'];
    level: string;
    slot?: number;
    spareLength?: number;
    rect: BuildingPrefab['rect'];
    orientation?: string;
    bank?: string;
  }[] = [
    ...prefabs,
    ...spareBridges.map((bridge) => ({
      category: 'bridge' as const,
      spareLength: bridge.length,
      ...bridge,
    })),
  ];
  return entries.map((prefab, i) => {
    const { category, level, slot, spareLength, rect, orientation, bank } =
      prefab;
    const name =
      category === 'bridge'
        ? `bridge-${level}-${orientation}-${bank}-${slot ?? `spare-${spareLength}`}`
        : `${category}-${level}`;
    const properties: TiledObject['properties'] = [
      ...(bank ? [{ name: 'bank', type: 'string' as const, value: bank }] : []),
      { name: 'category', type: 'string' as const, value: category },
      { name: 'level', type: 'string' as const, value: level },
      ...(orientation
        ? [{ name: 'orientation', type: 'string' as const, value: orientation }]
        : []),
      ...(slot !== undefined
        ? [{ name: 'slot', type: 'int' as const, value: slot }]
        : []),
    ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return {
      height: rect.height * COUNTY_TILE_SIZE,
      id: i + 1,
      name,
      properties,
      rotation: 0,
      type: category,
      visible: true,
      width: rect.width * COUNTY_TILE_SIZE,
      x: rect.x * COUNTY_TILE_SIZE,
      y: rect.y * COUNTY_TILE_SIZE,
    } as TiledObject;
  });
}

/**
 * An all-open collision grid (every cell gid 0): the loader requires a
 * `collision` layer, but real building collision isn't derived yet (see
 * this file's top comment).
 */
function allOpenCollisionData(): number[] {
  return new Array(BUILDING_GRID_SIZE * BUILDING_GRID_SIZE).fill(0);
}
