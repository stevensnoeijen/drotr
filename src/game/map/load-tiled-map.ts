import type {
  TiledLayer,
  TiledLayerObjectgroup,
  TiledLayerTilelayer,
  TiledMap,
} from 'tiled-types';

import type { Point } from '~/lib/math/types';
import type { TilesetGeometry } from './tile-gid';

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

/**
 * An external tileset a map references, with everything needed to cut its
 * tiles out of its image. `firstgid` comes from the map's reference to it.
 */
export interface MapTileset extends TilesetGeometry {
  name: string;
  /** Absolute URL of the tileset's image, resolved against the `.tsx`. */
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
}

/**
 * A visible tile layer to draw, in the map's back-to-front order. `data`
 * holds the raw Tiled gids, flip flags included; `0` is an empty cell.
 */
export interface MapTileLayer {
  name: string;
  /** Row-major, `width * height` long — always the map's own size. */
  data: readonly number[];
  opacity: number;
}

export interface ParsedMap {
  width: number;
  height: number;
  tileSize: number;
  terrain: TerrainType[][];
  collision: Uint8Array;
  spawns: SpawnPoint[];
  /** Every tileset the map references, for resolving {@link tileLayers}' gids. */
  tilesets: MapTileset[];
  /**
   * Every visible tile layer, flattened out of any groups, back to front —
   * what the art renderer draws. Hidden layers (e.g. a `terrain` layer kept
   * only for its gameplay semantics) are left out.
   */
  tileLayers: MapTileLayer[];
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
 * Collects every visible tile layer, descending into groups (a hidden group
 * hides everything in it), in the order Tiled draws them: back to front.
 */
function collectVisibleTileLayers(
  layers: TiledLayer[],
  map: TiledMap,
  parentOpacity = 1
): MapTileLayer[] {
  const out: MapTileLayer[] = [];
  for (const layer of layers) {
    if (layer.visible === false) {
      continue;
    }
    const opacity = parentOpacity * (layer.opacity ?? 1);
    if (layer.type === 'group') {
      out.push(...collectVisibleTileLayers(layer.layers, map, opacity));
    } else if (layer.type === 'tilelayer') {
      if (layer.width !== map.width || layer.height !== map.height) {
        throw new TiledMapError(
          `Tile layer "${layer.name}" size (${layer.width}x${layer.height}) does not match map size (${map.width}x${map.height})`
        );
      }
      if (!Array.isArray(layer.data)) {
        throw new TiledMapError(
          `Tile layer "${layer.name}" uses an unsupported encoding; expected an uncompressed tile array`
        );
      }
      out.push({ name: layer.name, data: layer.data, opacity });
    }
  }
  return out;
}

/**
 * Validates and converts a parsed Tiled map into the engine's map-source-
 * agnostic contract. Pure and synchronous so it's testable without mocking
 * `fetch` — {@link loadTiledMap} handles the actual I/O.
 */
export function parseTiledMap(
  map: TiledMap,
  terrainByGid: ReadonlyMap<number, TerrainType>,
  tilesets: MapTileset[] = []
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
  const tileLayers = collectVisibleTileLayers(map.layers, map);

  return {
    width: map.width,
    height: map.height,
    tileSize: map.tilewidth,
    terrain,
    collision,
    spawns,
    tilesets,
    tileLayers,
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

function requiredNumberAttribute(element: Element, name: string, context: string): number {
  const value = Number(element.getAttribute(name));
  if (element.getAttribute(name) === null || !Number.isFinite(value)) {
    throw new TiledMapError(`${context} is missing a numeric "${name}" attribute`);
  }
  return value;
}

/**
 * Reads the image and grid layout out of an external `.tsx` tileset: the
 * part of a tileset {@link parseTiledTileset} ignores. `firstgid` isn't part
 * of the tileset file (it's the map's to assign), so it's passed in, and the
 * image path is resolved against `tilesetUrl`.
 *
 * Only single-image tilesets are supported; an image-collection tileset
 * (one `<image>` per `<tile>`) is rejected.
 */
export function parseTilesetDescription(
  xml: string,
  firstgid: number,
  tilesetUrl: string
): MapTileset {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const tilesetEl = doc.querySelector('tileset');
  if (doc.querySelector('parsererror') || !tilesetEl) {
    throw new TiledMapError('Tileset XML failed to parse');
  }

  const name = tilesetEl.getAttribute('name') ?? '';
  const context = `Tileset "${name}"`;
  const imageEl = doc.querySelector('tileset > image');
  const imageSource = imageEl?.getAttribute('source');
  if (!imageEl || !imageSource) {
    throw new TiledMapError(
      `${context} has no single tileset image; image-collection tilesets are not supported`
    );
  }

  return {
    name,
    firstgid,
    tileWidth: requiredNumberAttribute(tilesetEl, 'tilewidth', context),
    tileHeight: requiredNumberAttribute(tilesetEl, 'tileheight', context),
    tileCount: requiredNumberAttribute(tilesetEl, 'tilecount', context),
    columns: requiredNumberAttribute(tilesetEl, 'columns', context),
    margin: Number(tilesetEl.getAttribute('margin') ?? 0) || 0,
    spacing: Number(tilesetEl.getAttribute('spacing') ?? 0) || 0,
    imageUrl: new URL(imageSource, tilesetUrl).toString(),
    imageWidth: requiredNumberAttribute(imageEl, 'width', `${context} image`),
    imageHeight: requiredNumberAttribute(imageEl, 'height', `${context} image`),
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new TiledMapError(`Failed to fetch "${url}": ${response.status}`);
  }
  return response.text();
}

/**
 * Fetches a `.tmj` map and every external `.tsx` tileset it references,
 * then parses and validates them into the engine's {@link ParsedMap}
 * contract. Terrain-type properties are merged across all tilesets, each
 * offset by its own `firstgid`.
 */
export async function loadTiledMap(mapUrl: string): Promise<ParsedMap> {
  const map = JSON.parse(await fetchText(mapUrl)) as TiledMap;

  if (map.tilesets.length === 0) {
    throw new TiledMapError('Map does not reference an external tileset');
  }
  const absoluteMapUrl = new URL(mapUrl, window.location.href);

  const terrainByGid = new Map<number, TerrainType>();
  const tilesets = await Promise.all(
    map.tilesets.map(async (reference) => {
      if (!reference.source) {
        throw new TiledMapError(
          `Map embeds tileset "${reference.name}"; only external tilesets are supported`
        );
      }
      const tilesetUrl = new URL(reference.source, absoluteMapUrl).toString();
      const xml = await fetchText(tilesetUrl);

      for (const [localId, type] of parseTiledTileset(xml)) {
        terrainByGid.set(reference.firstgid + localId, type);
      }
      return parseTilesetDescription(xml, reference.firstgid, tilesetUrl);
    })
  );

  return parseTiledMap(map, terrainByGid, tilesets);
}
