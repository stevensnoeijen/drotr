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
