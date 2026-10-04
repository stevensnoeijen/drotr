import type { MapObject, ParsedMap } from './load-tiled-map';

/** A tile rectangle, in tiles. */
export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Property-name prefix of a construction level's footprint. */
export const FOOTPRINT_PROPERTY_PREFIX = 'footprint:';

export type ConstructionCategory = 'castle' | 'tower' | 'bridge';
export type BridgeOrientation = 'horizontal' | 'vertical';
export type BridgeBank = 'grass' | 'rock';

/**
 * A place on a county map where a building can stand, from the map's
 * `constructions` object layer. Each level the site allows has its own
 * footprint.
 */
export interface ConstructionSite {
  name: string;
  category: ConstructionCategory;
  /** The levels this site allows, in the map's order. */
  levels: string[];
  /** Bridges only. */
  orientation?: BridgeOrientation;
  /** The tiles each level occupies, by level. */
  footprints: Record<string, TileRect>;
}

/**
 * A building drawn in `buildings.tmj`, marked by one rectangle of its
 * `prefabs` object layer (converted from pixels to tiles).
 */
export interface BuildingPrefab {
  name: string;
  category: ConstructionCategory;
  level: string;
  /** Bridges only. */
  orientation?: BridgeOrientation;
  /** Bridges only: the kind of ground at the bridge's ends. */
  bank?: BridgeBank;
  rect: TileRect;
}

const CATEGORIES: readonly string[] = ['castle', 'tower', 'bridge'];

/**
 * Every `footprint:<level>` property of `properties`, parsed and keyed by
 * level. A value that isn't four comma-separated numbers is skipped.
 */
export function parseFootprints(
  properties: Readonly<Record<string, string | number | boolean>>
): Record<string, TileRect> {
  const out: Record<string, TileRect> = {};
  for (const [name, value] of Object.entries(properties)) {
    if (!name.startsWith(FOOTPRINT_PROPERTY_PREFIX) || typeof value !== 'string') {
      continue;
    }
    const parts = value.split(',').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
      continue;
    }
    const [x, y, width, height] = parts;
    out[name.slice(FOOTPRINT_PROPERTY_PREFIX.length)] = { x, y, width, height };
  }
  return out;
}

function stringProperty(object: MapObject, name: string): string | undefined {
  const value = object.properties[name];
  return typeof value === 'string' ? value : undefined;
}

function isCategory(value: string | undefined): value is ConstructionCategory {
  return value !== undefined && CATEGORIES.includes(value);
}

function orientationOf(object: MapObject): BridgeOrientation | undefined {
  const value = stringProperty(object, 'orientation');
  return value === 'horizontal' || value === 'vertical' ? value : undefined;
}

/**
 * The construction sites of `map`'s `constructions` layer. An object that
 * isn't a castle, tower or bridge is skipped; a map without the layer has
 * no sites.
 */
export function parseConstructionSites(map: Pick<ParsedMap, 'objectLayers'>): ConstructionSite[] {
  const layer = map.objectLayers.find((l) => l.name === 'constructions');
  const sites: ConstructionSite[] = [];
  for (const object of layer?.objects ?? []) {
    if (!isCategory(object.type)) {
      continue;
    }
    sites.push({
      name: object.name,
      category: object.type,
      levels: (stringProperty(object, 'levels') ?? '')
        .split(',')
        .map((level) => level.trim())
        .filter((level) => level !== ''),
      orientation: orientationOf(object),
      footprints: parseFootprints(object.properties),
    });
  }
  return sites;
}

/**
 * The building prefabs marked in `buildingsMap`'s `prefabs` layer (the
 * parsed `buildings.tmj`). A marker without a category or level is skipped.
 */
export function parseBuildingPrefabs(
  buildingsMap: Pick<ParsedMap, 'objectLayers' | 'tileSize'>
): BuildingPrefab[] {
  const layer = buildingsMap.objectLayers.find((l) => l.name === 'prefabs');
  const prefabs: BuildingPrefab[] = [];
  const { tileSize } = buildingsMap;
  for (const object of layer?.objects ?? []) {
    const category = stringProperty(object, 'category');
    const level = stringProperty(object, 'level');
    if (!isCategory(category) || level === undefined) {
      continue;
    }
    const bank = stringProperty(object, 'bank');
    prefabs.push({
      name: object.name,
      category,
      level,
      orientation: orientationOf(object),
      bank: bank === 'grass' || bank === 'rock' ? bank : undefined,
      rect: {
        x: object.x / tileSize,
        y: object.y / tileSize,
        width: object.width / tileSize,
        height: object.height / tileSize,
      },
    });
  }
  return prefabs;
}
