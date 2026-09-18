import type {
  TiledLayer,
  TiledLayerObjectgroup,
  TiledLayerTilelayer,
  TiledMap,
} from 'tiled-types';

import type { Point } from '~/lib/math/types';

/** The only terrain kinds a `terrain` layer's tiles may resolve to. */
export type TerrainType = 'grass' | 'wall' | 'water';

/** Terrain that blocks movement — no naval/flying units exist yet. */
const BLOCKING_TERRAIN: ReadonlySet<TerrainType> = new Set(['wall', 'water']);

const TERRAIN_TYPES: ReadonlySet<string> = new Set<TerrainType>([
  'grass',
  'wall',
  'water',
]);

function isTerrainType(value: string): value is TerrainType {
  return TERRAIN_TYPES.has(value);
}

/**
 * A named location a scenario can spawn a unit at. Spawns carry no team or
 * unit-type of their own — a map just marks where things *can* appear;
 * deciding what appears where, and for which team, is a scenario's job (see
 * `claimSpawn` in `~/game/systems/spawn-system`).
 */
export interface SpawnPoint {
  id: string;
  position: Point;
}

export interface ParsedMap {
  width: number;
  height: number;
  tileSize: number;
  terrain: TerrainType[][];
  collision: Uint8Array;
  spawns: SpawnPoint[];
}

/** Thrown for any map that fails validation, with a human-readable reason. */
export class TiledMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TiledMapError';
  }
}

function findLayer<T extends TiledLayer['type']>(
  layers: TiledLayer[],
  name: string,
  type: T
): Extract<TiledLayer, { type: T }> | undefined {
  return layers.find(
    (layer): layer is Extract<TiledLayer, { type: T }> =>
      layer.name === name && layer.type === type
  );
}

function parseSpawns(layer: TiledLayerObjectgroup): SpawnPoint[] {
  return layer.objects.map((object) => {
    if (!object.name) {
      throw new TiledMapError(
        `Spawn object ${object.id} is missing a name to use as its spawn id`
      );
    }

    return {
      id: object.name,
      position: { x: object.x, y: object.y },
    };
  });
}

function parseTerrain(
  layer: TiledLayerTilelayer,
  map: TiledMap,
  terrainByGid: ReadonlyMap<number, TerrainType>
): { terrain: TerrainType[][]; collision: Uint8Array } {
  if (layer.width !== map.width || layer.height !== map.height) {
    throw new TiledMapError(
      `Terrain layer size (${layer.width}x${layer.height}) does not match map size (${map.width}x${map.height})`
    );
  }
  if (!Array.isArray(layer.data)) {
    throw new TiledMapError(
      `Terrain layer "${layer.name}" uses an unsupported encoding; expected an uncompressed tile array`
    );
  }

  const terrain: TerrainType[][] = [];
  const collision = new Uint8Array(map.width * map.height);

  for (let y = 0; y < map.height; y++) {
    const row: TerrainType[] = [];
    for (let x = 0; x < map.width; x++) {
      const index = y * map.width + x;
      const gid = layer.data[index];
      const type = terrainByGid.get(gid);
      if (!type) {
        throw new TiledMapError(
          `Unknown tile gid ${gid} in terrain layer at (${x}, ${y})`
        );
      }
      row.push(type);
      collision[index] = BLOCKING_TERRAIN.has(type) ? 1 : 0;
    }
    terrain.push(row);
  }

  return { terrain, collision };
}

/**
 * Validates and converts a parsed Tiled map into the engine's map-source-
 * agnostic contract. Pure and synchronous so it's testable without mocking
 * `fetch` — {@link loadTiledMap} handles the actual I/O.
 */
export function parseTiledMap(
  map: TiledMap,
  terrainByGid: ReadonlyMap<number, TerrainType>
): ParsedMap {
  if (map.orientation !== 'orthogonal') {
    throw new TiledMapError(
      `Unsupported map orientation "${map.orientation}"; only orthogonal maps are supported`
    );
  }

  const terrainLayer = findLayer(map.layers, 'terrain', 'tilelayer');
  if (!terrainLayer) {
    throw new TiledMapError('Map is missing a "terrain" tile layer');
  }

  const spawnsLayer = findLayer(map.layers, 'spawns', 'objectgroup');
  if (!spawnsLayer) {
    throw new TiledMapError('Map is missing a "spawns" object layer');
  }

  const { terrain, collision } = parseTerrain(terrainLayer, map, terrainByGid);
  const spawns = parseSpawns(spawnsLayer);

  return {
    width: map.width,
    height: map.height,
    tileSize: map.tilewidth,
    terrain,
    collision,
    spawns,
  };
}

/**
 * Reads the `terrain` custom property off each `<tile>` in an external
 * `.tsx` tileset, keyed by the tileset-local tile id (not gid — the caller
 * offsets by the tileset's `firstgid`).
 */
export function parseTiledTileset(xml: string): Map<number, TerrainType> {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new TiledMapError('Tileset XML failed to parse');
  }

  const terrainByLocalId = new Map<number, TerrainType>();
  for (const tileEl of doc.querySelectorAll('tileset > tile')) {
    const idAttr = tileEl.getAttribute('id');
    const id = idAttr === null ? NaN : Number(idAttr);
    const terrainValue = tileEl.querySelector(
      'properties > property[name="terrain"]'
    )?.getAttribute('value');

    if (Number.isNaN(id) || !terrainValue || !isTerrainType(terrainValue)) {
      continue;
    }
    terrainByLocalId.set(id, terrainValue);
  }

  return terrainByLocalId;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new TiledMapError(`Failed to fetch "${url}": ${response.status}`);
  }
  return response.text();
}

/**
 * Fetches a `.tmj` map and its referenced external `.tsx` tileset, then
 * parses and validates them into the engine's {@link ParsedMap} contract.
 */
export async function loadTiledMap(mapUrl: string): Promise<ParsedMap> {
  const map = JSON.parse(await fetchText(mapUrl)) as TiledMap;

  const [tileset] = map.tilesets;
  if (!tileset || !tileset.source) {
    throw new TiledMapError('Map does not reference an external tileset');
  }

  const tilesetUrl = new URL(tileset.source, new URL(mapUrl, window.location.href)).toString();
  const terrainByLocalId = parseTiledTileset(await fetchText(tilesetUrl));

  const terrainByGid = new Map<number, TerrainType>();
  for (const [localId, type] of terrainByLocalId) {
    terrainByGid.set(tileset.firstgid + localId, type);
  }

  return parseTiledMap(map, terrainByGid);
}
