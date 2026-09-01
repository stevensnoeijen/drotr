import type { MapDefinition } from './types';

export type { MapDefinition } from './types';

/** Every registered map, in the order they're listed on `/`. */
export const maps: readonly MapDefinition[] = [
  {
    id: 'test',
    title: 'Test',
    description:
      'A Tiled test map with two spawn points and a walled maze block, for exercising pathfinding around obstacles.',
    mapSource: `${import.meta.env.BASE_URL}maps/test.tmj`,
  },
];

const mapsById = new Map(maps.map((map) => [map.id, map]));

export interface ResolvedMap {
  readonly error?: never;
  readonly map: MapDefinition;
}

export interface UnresolvedMap {
  readonly error: true;
  readonly requestedId: string;
  readonly validIds: readonly string[];
}

/**
 * Resolves `?map=` against the registry. Never throws: an absent or unknown
 * id comes back as a typed {@link UnresolvedMap} so callers can render a
 * visible error listing the valid ids instead of a blank canvas.
 */
export function resolveMap(
  searchParams: URLSearchParams
): ResolvedMap | UnresolvedMap {
  const requestedId = searchParams.get('map') ?? '';
  const map = mapsById.get(requestedId);

  if (!map) {
    return {
      error: true,
      requestedId,
      validIds: maps.map((m) => m.id),
    };
  }

  return { map };
}
