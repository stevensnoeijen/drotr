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
 * The external tileset a map references, with everything needed to cut its
 * tiles out of its image. `firstgid` comes from the map's reference to it.
 */
export interface MapTileset extends TilesetGeometry {
  /** Absolute URL of the tileset's image, resolved against the `.tsx`. */
  imageUrl: string;
  /** Local ids of the tiles marked {@link BLOCKED_TILE_PROPERTY}. */
  blockedTileIds: ReadonlySet<number>;
}

/** One top-level tile layer of a map, as the renderer draws it. */
export interface MapTileLayer {
  /** The layer's name in Tiled, e.g. `terrain`. */
  name: string;
  /**
   * Whether the layer is shown by default: Tiled's `visible` flag (absent
   * counts as visible). A hidden layer is still kept, and rendered hidden, so
   * it can be switched on at runtime.
   */
  visible: boolean;
  /**
   * The layer's raw Tiled gids (flip flags included; `0` is an empty cell),
   * row-major and always the map's own size.
   */
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
  /** The map's one tileset, which every gid in {@link tileLayers} resolves through. */
  tileset: MapTileset;
  /**
   * Every top-level tile layer, back to front — what the renderer draws —
   * hidden ones included (flagged by {@link MapTileLayer.visible}). Group
   * layers aren't supported. Display only: collision comes from the
   * `terrain` layer alone, whatever is shown.
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
 * (gid 0); a flipped tile is as walkable as the unflipped one. A gid the
 * tileset doesn't cover is malformed data and rejected.
 */
function parseCollision(
  layer: TiledLayerTilelayer,
  map: TiledMap,
  tileset: MapTileset
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
      const localId = resolveGid(gid, tileset);
      if (localId === undefined) {
        throw new TiledMapError(`Unknown tile gid ${gid} in terrain layer at (${x}, ${y})`);
      }
      collision[index] = tileset.blockedTileIds.has(localId) ? 1 : 0;
    }
  }
  return collision;
}

/**
 * Collects every top-level tile layer, hidden ones included, in the order
 * Tiled draws them: back to front.
 */
function collectTileLayers(map: TiledMap): MapTileLayer[] {
  const out: MapTileLayer[] = [];
  for (const layer of map.layers) {
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
      out.push({ name: layer.name, visible: layer.visible !== false, data: layer.data });
    }
  }
  return out;
}

/**
 * Validates and converts a parsed Tiled map into the engine's map-source-
 * agnostic contract. Pure and synchronous so it's testable without mocking
 * `fetch` — {@link loadTiledMap} handles the actual I/O.
 */
export function parseTiledMap(map: TiledMap, tileset: MapTileset): ParsedMap {
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

  const collision = parseCollision(terrainLayer, map, tileset);
  const spawns = parseSpawns(spawnsLayer);
  const tileLayers = collectTileLayers(map);

  return {
    width: map.width,
    height: map.height,
    tileSize: map.tilewidth,
    collision,
    spawns,
    tileset,
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
 * Only tightly packed single-image tilesets are supported: an
 * image-collection tileset (one `<image>` per `<tile>`), or one with a
 * margin or spacing between tiles, is rejected.
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
  const imageSource = doc.querySelector('tileset > image')?.getAttribute('source');
  if (!imageSource) {
    throw new TiledMapError(
      `${context} has no single tileset image; image-collection tilesets are not supported`
    );
  }
  for (const attribute of ['margin', 'spacing']) {
    if (Number(tilesetEl.getAttribute(attribute) ?? 0) !== 0) {
      throw new TiledMapError(`${context} sets a ${attribute}; only tightly packed tilesets are supported`);
    }
  }

  return {
    firstgid,
    tileWidth: requiredNumberAttribute(tilesetEl, 'tilewidth', context),
    tileHeight: requiredNumberAttribute(tilesetEl, 'tileheight', context),
    tileCount: requiredNumberAttribute(tilesetEl, 'tilecount', context),
    columns: requiredNumberAttribute(tilesetEl, 'columns', context),
    imageUrl: new URL(imageSource, tilesetUrl).toString(),
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
 * Fetches a `.tmj` map and the one external `.tsx` tileset it references,
 * then parses and validates them into the engine's {@link ParsedMap}
 * contract. A map with no tileset, more than one, or an embedded one is
 * rejected.
 */
export async function loadTiledMap(mapUrl: string): Promise<ParsedMap> {
  const map = JSON.parse(await fetchText(mapUrl)) as TiledMap;

  if (map.tilesets.length !== 1) {
    throw new TiledMapError(
      `Map references ${map.tilesets.length} tilesets; exactly one external tileset is supported`
    );
  }
  const [reference] = map.tilesets;
  if (!reference.source) {
    throw new TiledMapError(
      `Map embeds tileset "${reference.name}"; only external tilesets are supported`
    );
  }

  const tilesetUrl = new URL(reference.source, new URL(mapUrl, window.location.href)).toString();
  const tileset = parseTilesetDescription(await fetchText(tilesetUrl), reference.firstgid, tilesetUrl);
  return parseTiledMap(map, tileset);
}
