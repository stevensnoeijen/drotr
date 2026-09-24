import type {
  TiledLayerObjectgroup,
  TiledLayerTilelayer,
  TiledMap,
  TiledTileset,
} from 'tiled-types';

import {
  collapseCollisionMaskPerTile,
  SECTION_A_SIZE,
  type CountyMap,
} from '../../src/lib/county-map';
import {
  atlasIndexToTileId,
  TERRAIN_TILESET_FIRSTGID,
  tileIdToGid,
  VERBATIM_ATLAS_INDEX_MAX,
} from '../terrain-tileset/terrain-tileset';

/**
 * Converts a decoded county `.MAP` (see `src/lib/county-map`) into a Tiled
 * map drawn with the committed `public/maps/terrain.tsx` tileset, in the
 * shape `parseTiledMap` in `src/game/map/load-tiled-map.ts` accepts.
 *
 * The output has three layers:
 *
 * - `terrain`: Section A, one tile per cell, `gid = atlas index + 1`. It's
 *   the whole ground layer (there is no separate decoration layer), and the
 *   engine's collision grid comes from its tiles' `blocked` flags.
 * - `spawns`: an empty object layer, for spawn points to be placed by hand.
 * - `collision`: hidden by default, Section B collapsed to one value per
 *   tile ({@link collapseCollisionMaskPerTile}) — the plain ground tile
 *   where blocked, empty where open. It exists only to inspect the original
 *   collision data in the Tiled editor; the engine never reads it.
 */

/** Tile size of the `terrain` tileset, in pixels. */
export const COUNTY_TILE_SIZE = 40;

/** File name the map references its tileset by, relative to the map. */
const TERRAIN_TILESET_SOURCE = 'terrain.tsx';

/**
 * Gid drawn in the `collision` layer for a blocked tile: atlas index 0,
 * the plain ground tile. An open tile is left empty (gid 0).
 */
const COLLISION_BLOCKED_GID = tileIdToGid(atlasIndexToTileId(0));

/** Converts one Section A atlas index to its `terrain` gid. */
function tileGid(index: number, x: number, y: number): number {
  // atlasIndexToTileId also accepts the drawbridge/rubble extras past the
  // verbatim range, which no county uses, so an index there is bad data.
  if (index > VERBATIM_ATLAS_INDEX_MAX) {
    throw new RangeError(
      `Tile index ${index} at (${x}, ${y}) is above ${VERBATIM_ATLAS_INDEX_MAX}, the highest atlas index a county map can use`
    );
  }
  return tileIdToGid(atlasIndexToTileId(index));
}

function terrainData(map: CountyMap): number[] {
  const data: number[] = new Array(SECTION_A_SIZE * SECTION_A_SIZE);
  for (let y = 0; y < SECTION_A_SIZE; y++) {
    for (let x = 0; x < SECTION_A_SIZE; x++) {
      const index = y * SECTION_A_SIZE + x;
      data[index] = tileGid(map.tiles[index], x, y);
    }
  }
  return data;
}

function collisionData(map: CountyMap): number[] {
  return Array.from(collapseCollisionMaskPerTile(map), (blocked) =>
    blocked ? COLLISION_BLOCKED_GID : 0
  );
}

/**
 * Builds the Tiled map for a decoded county. Key order is fixed (it
 * mirrors `public/maps/test.tmj`), so {@link serializeTiledMap} of the
 * result is deterministic.
 *
 * @throws {RangeError} for a tile index above
 * {@link VERBATIM_ATLAS_INDEX_MAX}.
 */
export function buildCountyTiledMap(map: CountyMap): TiledMap {
  const terrain: TiledLayerTilelayer = {
    id: 1,
    name: 'terrain',
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: SECTION_A_SIZE,
    height: SECTION_A_SIZE,
    opacity: 1,
    visible: true,
    data: terrainData(map),
  };
  const spawns: TiledLayerObjectgroup = {
    id: 2,
    name: 'spawns',
    type: 'objectgroup',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    opacity: 1,
    visible: true,
    draworder: 'topdown',
    objects: [],
  };
  const collision: TiledLayerTilelayer = {
    id: 3,
    name: 'collision',
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: SECTION_A_SIZE,
    height: SECTION_A_SIZE,
    opacity: 1,
    visible: false,
    data: collisionData(map),
  };

  // tiled-types only models an embedded tileset; an external reference is
  // just its firstgid and source, which is all a map file stores for one.
  const tilesetReference = {
    firstgid: TERRAIN_TILESET_FIRSTGID,
    source: TERRAIN_TILESET_SOURCE,
  } as TiledTileset;

  return {
    type: 'map',
    version: 1.1,
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: SECTION_A_SIZE,
    height: SECTION_A_SIZE,
    tilewidth: COUNTY_TILE_SIZE,
    tileheight: COUNTY_TILE_SIZE,
    infinite: false,
    nextlayerid: 4,
    nextobjectid: 1,
    compressionlevel: -1,
    properties: [],
    tilesets: [tilesetReference],
    layers: [terrain, spawns, collision],
  };
}

/**
 * Serializes a Tiled map the way Tiled itself writes `.tmj` files: one
 * space of indentation, plus a trailing newline. No timestamps, so the same
 * map always yields the same bytes.
 */
export function serializeTiledMap(map: TiledMap): string {
  return `${JSON.stringify(map, null, 1)}\n`;
}
