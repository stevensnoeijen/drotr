import {
  parseBuildingPrefabs,
  parseConstructionSites,
  type BridgeBank,
  type BuildingPrefab,
  type ConstructionSite,
  type TileRect,
} from './construction-sites';
import type { ParsedMap } from './load-tiled-map';

/** A request to put one building, at one level, on one construction site. */
export interface BuildingPlacement {
  /** The site's name on the county map, e.g. `castle-1`. */
  site: string;
  /** One of the site's `levels`, e.g. `4` or `stone`. */
  level: string;
  /** Bridges only: the ground at the bridge's ends. Defaults to {@link DEFAULT_BRIDGE_BANK}. */
  bank?: BridgeBank;
}

export const DEFAULT_BRIDGE_BANK: BridgeBank = 'grass';

/** A placement that fits: the site, the tiles it fills at this level, and the prefab to draw there. */
export interface ResolvedPlacement {
  error?: never;
  site: ConstructionSite;
  footprint: TileRect;
  /** Absent only when resolved without prefab data (see {@link resolvePlacement}). */
  prefab?: BuildingPrefab;
}

export interface UnresolvedPlacement {
  error: string;
  site?: never;
  footprint?: never;
  prefab?: never;
}

/**
 * Checks `placement` against the construction `sites` of a county map: the
 * site exists, allows the level and has a footprint for it. With `prefabs`
 * (the buildings map's), it also finds the prefab to draw: same category and
 * level as the site, the site's orientation and the placement's bank for a
 * bridge, and exactly the footprint's size. Without `prefabs` only the site
 * checks run, which is all that can be said before `buildings.tmj` has
 * loaded.
 *
 * Returns the resolved placement or a human-readable reason it can't be
 * used. Pure.
 */
export function resolvePlacement(
  sites: readonly ConstructionSite[],
  prefabs: readonly BuildingPrefab[] | undefined,
  placement: BuildingPlacement
): ResolvedPlacement | UnresolvedPlacement {
  const { site: siteName, level } = placement;
  const site = sites.find((s) => s.name === siteName);
  if (!site) {
    return { error: `The map has no construction site "${siteName}"` };
  }
  if (!site.levels.includes(level)) {
    return {
      error: `Construction site "${siteName}" (${site.category}) does not allow level "${level}"; it allows ${site.levels.join(', ')}`,
    };
  }
  const footprint = site.footprints[level];
  if (!footprint) {
    return { error: `Construction site "${siteName}" has no footprint for level "${level}"` };
  }
  if (!prefabs) {
    return { site, footprint };
  }

  const bank = site.category === 'bridge' ? (placement.bank ?? DEFAULT_BRIDGE_BANK) : undefined;
  const prefab = prefabs.find(
    (p) =>
      p.category === site.category &&
      p.level === level &&
      p.orientation === site.orientation &&
      p.bank === bank &&
      p.rect.width === footprint.width &&
      p.rect.height === footprint.height
  );
  if (!prefab) {
    const detail = [site.orientation, bank && `${bank} bank`].filter(Boolean).join(', ');
    return {
      error: `No ${site.category} prefab for level "${level}"${detail ? ` (${detail})` : ''} fits site "${siteName}" (${footprint.width}x${footprint.height} tiles)`,
    };
  }
  return { site, footprint, prefab };
}

/**
 * The first reason any of `placements` can't be used on `map`, or
 * `undefined` when they all can. `buildingsMap`, the parsed `buildings.tmj`,
 * enables the prefab check; see {@link resolvePlacement}.
 */
export function validatePlacements(
  map: Pick<ParsedMap, 'objectLayers'> | undefined,
  placements: readonly BuildingPlacement[],
  buildingsMap?: Pick<ParsedMap, 'objectLayers' | 'tileSize'>
): string | undefined {
  if (placements.length === 0) {
    return undefined;
  }
  if (!map) {
    return 'This scenario places buildings on construction sites, but the map has none';
  }
  const sites = parseConstructionSites(map);
  const prefabs = buildingsMap && parseBuildingPrefabs(buildingsMap);
  for (const placement of placements) {
    const result = resolvePlacement(sites, prefabs, placement);
    if (result.error) {
      return result.error;
    }
  }
  return undefined;
}

function requireTileLayer(map: Pick<ParsedMap, 'tileLayers'>, name: string): number {
  const index = map.tileLayers.findIndex((layer) => layer.name === name);
  if (index < 0) {
    throw new Error(`Map has no "${name}" tile layer`);
  }
  return index;
}

/**
 * A copy of `map` with each placement's prefab drawn onto its construction
 * site: across the site's footprint, the county's `terrain` gids are
 * replaced by the prefab's own `terrain` gids from `buildingsMap` (the
 * parsed `buildings.tmj`): the undamaged building. Its `damaged` and
 * `ruined` overlays are for a partly and fully destroyed building and are
 * not placed. A prefab cell that is empty keeps the county's terrain, and
 * nothing outside a footprint changes. Both maps
 * share one tileset, so gids copy as they are, flip flags included. Neither
 * input is mutated, and collision is left alone.
 *
 * Throws when a placement can't be resolved (see {@link resolvePlacement}),
 * which a scenario's `validateMap` should have caught first.
 */
export function stampBuildings(
  map: ParsedMap,
  buildingsMap: ParsedMap,
  placements: readonly BuildingPlacement[]
): ParsedMap {
  if (placements.length === 0) {
    return map;
  }

  const sites = parseConstructionSites(map);
  const prefabs = parseBuildingPrefabs(buildingsMap);
  const terrainIndex = requireTileLayer(map, 'terrain');
  const prefabTerrain =
    buildingsMap.tileLayers[requireTileLayer(buildingsMap, 'terrain')].data;
  const terrain = [...map.tileLayers[terrainIndex].data];

  for (const placement of placements) {
    const resolved = resolvePlacement(sites, prefabs, placement);
    if (resolved.error) {
      throw new Error(resolved.error);
    }
    const { footprint, prefab } = resolved;
    if (!prefab) {
      throw new Error(`No prefab resolved for site "${placement.site}"`);
    }
    if (
      footprint.x < 0 ||
      footprint.y < 0 ||
      footprint.x + footprint.width > map.width ||
      footprint.y + footprint.height > map.height
    ) {
      throw new Error(`Construction site "${placement.site}" lies outside the map`);
    }
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        const source = (prefab.rect.y + dy) * buildingsMap.width + prefab.rect.x + dx;
        const gid = prefabTerrain[source];
        if (gid !== 0) {
          terrain[(footprint.y + dy) * map.width + footprint.x + dx] = gid;
        }
      }
    }
  }

  return {
    ...map,
    tileLayers: map.tileLayers.map((layer, index) =>
      index === terrainIndex ? { ...layer, data: terrain } : layer
    ),
  };
}

/**
 * The placements a scenario declares for `map`: its `buildings` list, or the
 * result of calling it with the map. Empty when it declares none.
 */
export function placementsFor(
  scenario: { buildings?: BuildingPlacement[] | ((map: ParsedMap) => BuildingPlacement[]) },
  map: ParsedMap
): BuildingPlacement[] {
  const { buildings } = scenario;
  return typeof buildings === 'function' ? buildings(map) : (buildings ?? []);
}
