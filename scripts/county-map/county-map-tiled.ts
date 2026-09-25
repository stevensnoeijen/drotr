import type {
  TiledLayerObjectgroup,
  TiledLayerTilelayer,
  TiledMap,
  TiledObject,
  TiledTileset,
} from 'tiled-types';

import {
  collapseCollisionMaskPerTile,
  findSignposts,
  SECTION_A_SIZE,
  type CountyMap,
} from '../../src/lib/county-map';
import {
  atlasIndexToTileId,
  COLLISION_MARKER_TILE_ID,
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
 *   the whole ground layer (there is no separate decoration layer). Purely
 *   cosmetic: the engine's collision grid never reads it.
 * - `spawns`: one generated `edge-N` spawn point per map-edge signpost
 *   ({@link edgeSpawnObjects}). Hand-placed spawns are added afterwards
 *   and kept across reruns by `withPreviousSpawns`.
 * - `collision`: hidden by default, Section B collapsed to one value per
 *   tile ({@link collapseCollisionMaskPerTile}) — the collision-marker tile
 *   where blocked, empty where open. This is what the engine's collision
 *   grid actually reads (`parseTiledMap` in
 *   `src/game/map/load-tiled-map.ts`); it's hidden only so it doesn't
 *   normally show up drawn over the terrain, and can still be switched on
 *   in the Tiled editor or through the engine's `tile-layers` debug option.
 */

/** Tile size of the `terrain` tileset, in pixels. */
export const COUNTY_TILE_SIZE = 40;

/** File name the map references its tileset by, relative to the map. */
const TERRAIN_TILESET_SOURCE = 'terrain.tsx';

/**
 * Gid drawn in the `collision` layer for a blocked tile: the synthetic
 * collision-marker tile. An open tile is left empty (gid 0).
 */
const COLLISION_BLOCKED_GID = tileIdToGid(COLLISION_MARKER_TILE_ID);

/**
 * Converts one `.MAP` atlas index at cell `(x, y)` to its `terrain.tsx` gid.
 *
 * @throws {RangeError} for an index above {@link VERBATIM_ATLAS_INDEX_MAX}.
 */
export function atlasIndexGid(index: number, x: number, y: number): number {
  // atlasIndexToTileId also accepts the drawbridge/rubble extras past the
  // verbatim range, which no .MAP file uses, so an index there is bad data.
  if (index > VERBATIM_ATLAS_INDEX_MAX) {
    throw new RangeError(
      `Tile index ${index} at (${x}, ${y}) is above ${VERBATIM_ATLAS_INDEX_MAX}, the highest atlas index a .MAP file can use`
    );
  }
  return tileIdToGid(atlasIndexToTileId(index));
}

function terrainData(map: CountyMap): number[] {
  const data: number[] = new Array(SECTION_A_SIZE * SECTION_A_SIZE);
  for (let y = 0; y < SECTION_A_SIZE; y++) {
    for (let x = 0; x < SECTION_A_SIZE; x++) {
      const index = y * SECTION_A_SIZE + x;
      data[index] = atlasIndexGid(map.tiles[index], x, y);
    }
  }
  return data;
}

function collisionData(collapsed: Uint8Array): number[] {
  return Array.from(collapsed, (blocked) =>
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
  const blocked = collapseCollisionMaskPerTile(map);
  const spawns = edgeSpawnObjects(map, blocked);
  return {
    ...buildTerrainTiledMap([
      tileLayer(1, 'terrain', terrainData(map)),
      spawnsLayer(2, spawns),
      tileLayer(3, 'collision', collisionData(blocked), false),
    ]),
    nextobjectid: spawns.length + 1,
  };
}

/**
 * Name prefix reserved for spawn points generated from map-edge signposts.
 * A spawn named `edge-<anything>` is treated as generated: it's rebuilt
 * from the `.MAP` data on every conversion, so a hand-placed spawn must
 * not use it.
 */
export const EDGE_SPAWN_PREFIX = 'edge-';

/**
 * How many tiles inward from a signpost {@link edgeSpawnTiles} searches
 * for a walkable tile before giving up.
 */
export const EDGE_SPAWN_SEARCH_RADIUS = 3;

/**
 * The tile each map-edge signpost's spawn goes on, in signpost scan order
 * (row-major, see `findSignposts`).
 *
 * A signpost's own tile is blocked (its top half is solid), so the spawn
 * goes on the nearest walkable tile of the collapsed collision grid
 * (`blocked`, as {@link collapseCollisionMaskPerTile} returns it), stepping
 * inward, away from the border the signpost sits on: `+x` from the left
 * edge, `-x` from the right, `+y` from the top, `-y` from the bottom. A
 * corner signpost (on two borders) steps diagonally, along both axes at
 * once. The signpost's own tile counts as step 0, in case it is ever
 * walkable.
 *
 * @throws {Error} when no tile within {@link EDGE_SPAWN_SEARCH_RADIUS}
 * steps is walkable, rather than place a spawn in a blocked cell.
 */
export function edgeSpawnTiles(
  map: CountyMap,
  blocked: Uint8Array
): [number, number][] {
  const last = SECTION_A_SIZE - 1;
  const inward = (coordinate: number): number =>
    coordinate === 0 ? 1 : coordinate === last ? -1 : 0;

  return findSignposts(map).map(([x, y]) => {
    const dx = inward(x);
    const dy = inward(y);
    for (let step = 0; step <= EDGE_SPAWN_SEARCH_RADIUS; step++) {
      const tx = x + dx * step;
      const ty = y + dy * step;
      if (blocked[ty * SECTION_A_SIZE + tx] === 0) {
        return [tx, ty];
      }
    }
    throw new Error(
      `No walkable tile within ${EDGE_SPAWN_SEARCH_RADIUS} tiles inward of the signpost at (${x}, ${y})`
    );
  });
}

/**
 * The generated `spawns` objects: one point named `edge-1`, `edge-2`, …
 * per map-edge signpost, at the centre of its {@link edgeSpawnTiles} tile
 * in map pixels, with object ids 1..n. No team or colour: which side uses
 * a spawn is a scenario decision.
 */
export function edgeSpawnObjects(
  map: CountyMap,
  blocked: Uint8Array
): TiledObject[] {
  return edgeSpawnTiles(map, blocked).map(([x, y], i) =>
    spawnPoint(
      i + 1,
      `${EDGE_SPAWN_PREFIX}${i + 1}`,
      x * COUNTY_TILE_SIZE + COUNTY_TILE_SIZE / 2,
      y * COUNTY_TILE_SIZE + COUNTY_TILE_SIZE / 2
    )
  );
}

/**
 * A spawn point object, in the key order (alphabetical) and shape the
 * Tiled editor writes one in. Tiled omits an empty `properties`, so this
 * does too.
 */
function spawnPoint(id: number, name: string, x: number, y: number): TiledObject {
  return {
    height: 0,
    id,
    name,
    point: true,
    rotation: 0,
    type: '',
    visible: true,
    width: 0,
    x,
    y,
  } as Omit<TiledObject, 'properties'> as TiledObject;
}

/** A 128×128 tile layer, in the key order Tiled writes. */
export function tileLayer(
  id: number,
  name: string,
  data: number[],
  visible = true
): TiledLayerTilelayer {
  return {
    id,
    name,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: SECTION_A_SIZE,
    height: SECTION_A_SIZE,
    opacity: 1,
    visible,
    data,
  };
}

/**
 * The `spawns` object layer `parseTiledMap` requires, holding `objects`
 * (none by default).
 */
export function spawnsLayer(
  id: number,
  objects: TiledObject[] = []
): TiledLayerObjectgroup {
  return {
    id,
    name: 'spawns',
    type: 'objectgroup',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    opacity: 1,
    visible: true,
    draworder: 'topdown',
    objects,
  };
}

/**
 * Wraps `layers` (back to front, ids 1..n) in a 128×128, 40 px map that
 * references `terrain.tsx` as its one external tileset. Key order is fixed
 * (it mirrors `public/maps/test.tmj`), so {@link serializeTiledMap} of the
 * result is deterministic.
 */
export function buildTerrainTiledMap(
  layers: (TiledLayerTilelayer | TiledLayerObjectgroup)[]
): TiledMap {
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
    nextlayerid: Math.max(0, ...layers.map((layer) => layer.id ?? 0)) + 1,
    nextobjectid: 1,
    compressionlevel: -1,
    properties: [],
    tilesets: [tilesetReference],
    layers,
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
