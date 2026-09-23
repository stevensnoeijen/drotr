import type {
  TiledLayer,
  TiledLayerObjectgroup,
  TiledLayerTilelayer,
  TiledMap,
} from 'tiled-types';

import type { Point } from '~/lib/math/types';
import { decodeGid, resolveGid, type TilesetGeometry } from './tile-gid';
import { BLOCKED_TILE_PROPERTY } from './tile-properties';

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
  /** Local ids of the tiles marked {@link BLOCKED_TILE_PROPERTY}. */
  blockedTileIds: ReadonlySet<number>;
}

/**
 * A visible tile layer to draw, in the map's back-to-front order. `data`
 * holds the raw Tiled gids, flip flags included; `0` is an empty cell.
 */
export interface MapTileLayer {
  name: string;
  /** Row-major, `width * height` long — always the map's own size. */
  data: readonly number[];
}

export interface ParsedMap {
  width: number;
  height: number;
  tileSize: number;
  /**
   * Row-major, one byte per cell: `1` where the `terrain` layer's tile is
   * blocked (or the cell is empty), `0` where a unit may stand.
   */
  collision: Uint8Array;
  spawns: SpawnPoint[];
  /** Every tileset the map references, for resolving {@link tileLayers}' gids. */
  tilesets: MapTileset[];
  /**
   * Every visible top-level tile layer, back to front — what the renderer
   * draws. Hidden layers are left out, and group layers aren't supported.
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

/**
 * Derives the collision grid from the `terrain` layer: a cell blocks when
 * its tile carries the {@link BLOCKED_TILE_PROPERTY} or the cell is empty
 * (gid 0); a flipped tile is as walkable as the unflipped one. A gid no tileset
 * covers is malformed data and rejected.
 */
function parseCollision(
  layer: TiledLayerTilelayer,
  map: TiledMap,
  tilesets: readonly MapTileset[]
): Uint8Array {
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

  const collision = new Uint8Array(map.width * map.height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const index = y * map.width + x;
      const gid = decodeGid(layer.data[index]);
      if (gid === 0) {
        collision[index] = 1;
        continue;
      }
      const tile = resolveGid(gid, tilesets);
      if (!tile) {
        throw new TiledMapError(`Unknown tile gid ${gid} in terrain layer at (${x}, ${y})`);
      }
      collision[index] = tile.tileset.blockedTileIds.has(tile.localId) ? 1 : 0;
    }
  }
  return collision;
}

/**
 * Collects every visible top-level tile layer, in the order Tiled draws
 * them: back to front.
 */
function collectVisibleTileLayers(map: TiledMap): MapTileLayer[] {
  const out: MapTileLayer[] = [];
  for (const layer of map.layers) {
    if (layer.visible === false) {
      continue;
    }
    if (layer.type === 'tilelayer') {
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
      out.push({ name: layer.name, data: layer.data });
    }
  }
  return out;
}

/**
 * Validates and converts a parsed Tiled map into the engine's map-source-
 * agnostic contract. Pure and synchronous so it's testable without mocking
 * `fetch` — {@link loadTiledMap} handles the actual I/O.
 */
export function parseTiledMap(map: TiledMap, tilesets: MapTileset[]): ParsedMap {
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

  const collision = parseCollision(terrainLayer, map, tilesets);
  const spawns = parseSpawns(spawnsLayer);
  const tileLayers = collectVisibleTileLayers(map);

  return {
    width: map.width,
    height: map.height,
    tileSize: map.tilewidth,
    collision,
    spawns,
    tilesets,
    tileLayers,
  };
}

/** Local ids of the `<tile>`s whose {@link BLOCKED_TILE_PROPERTY} is `true`. */
function parseBlockedTileIds(doc: Document): Set<number> {
  const blocked = new Set<number>();
  for (const tileEl of doc.querySelectorAll('tileset > tile')) {
    const id = Number(tileEl.getAttribute('id') ?? NaN);
    const property = [...tileEl.querySelectorAll('properties > property')].find(
      (el) => el.getAttribute('name') === BLOCKED_TILE_PROPERTY
    );
    if (Number.isInteger(id) && property?.getAttribute('value') === 'true') {
      blocked.add(id);
    }
  }
  return blocked;
}

function requiredNumberAttribute(element: Element, name: string, context: string): number {
  const value = Number(element.getAttribute(name));
  if (element.getAttribute(name) === null || !Number.isFinite(value)) {
    throw new TiledMapError(`${context} is missing a numeric "${name}" attribute`);
  }
  return value;
}

/**
 * Reads an external `.tsx` tileset: its image, grid layout and which tiles
 * are {@link BLOCKED_TILE_PROPERTY}. `firstgid` isn't part of the tileset
 * file (it's the map's to assign), so it's passed in, and the image path is
 * resolved against `tilesetUrl`.
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
    blockedTileIds: parseBlockedTileIds(doc),
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
 * contract.
 */
export async function loadTiledMap(mapUrl: string): Promise<ParsedMap> {
  const map = JSON.parse(await fetchText(mapUrl)) as TiledMap;

  if (map.tilesets.length === 0) {
    throw new TiledMapError('Map does not reference an external tileset');
  }
  const absoluteMapUrl = new URL(mapUrl, window.location.href);

  const tilesets = await Promise.all(
    map.tilesets.map(async (reference) => {
      if (!reference.source) {
        throw new TiledMapError(
          `Map embeds tileset "${reference.name}"; only external tilesets are supported`
        );
      }
      const tilesetUrl = new URL(reference.source, absoluteMapUrl).toString();
      return parseTilesetDescription(await fetchText(tilesetUrl), reference.firstgid, tilesetUrl);
    })
  );

  return parseTiledMap(map, tilesets);
}
