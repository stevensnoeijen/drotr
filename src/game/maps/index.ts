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
  {
    id: 'fagaras',
    title: 'Fagaras',
    description:
      'The Fagaras county map, converted from the original .MAP file.',
    mapSource: `${import.meta.env.BASE_URL}maps/fagaras.tmj`,
    allowedScenarioIds: ['knights'],
  },
  {
    id: 'sibiu',
    title: 'Sibiu',
    description: 'The Sibiu county map, converted from the original .MAP file.',
    mapSource: `${import.meta.env.BASE_URL}maps/sibiu.tmj`,
    // No spawn points yet, so only `empty` (allowed on every map) applies.
    allowedScenarioIds: [],
  },
  {
    id: 'brasov',
    title: 'Brasov',
    description:
      'The Brasov county map, converted from the original .MAP file.',
    mapSource: `${import.meta.env.BASE_URL}maps/brasov.tmj`,
    // No spawn points yet, so only `empty` (allowed on every map) applies.
    allowedScenarioIds: [],
  },
  {
    id: 'rasova',
    title: 'Rasova',
    description:
      'The Rasova county map, converted from the original .MAP file.',
    mapSource: `${import.meta.env.BASE_URL}maps/rasova.tmj`,
    // No spawn points yet, so only `empty` (allowed on every map) applies.
    allowedScenarioIds: [],
  },
  {
    id: 'pitesti',
    title: 'Pitesti',
    description:
      'The Pitesti county map, converted from the original .MAP file.',
    mapSource: `${import.meta.env.BASE_URL}maps/pitesti.tmj`,
    // No spawn points yet, so only `empty` (allowed on every map) applies.
    allowedScenarioIds: [],
  },
  {
    id: 'hirsova',
    title: 'Hirsova',
    description:
      'The Hirsova county map, converted from the original .MAP file.',
    mapSource: `${import.meta.env.BASE_URL}maps/hirsova.tmj`,
    // No spawn points yet, so only `empty` (allowed on every map) applies.
    allowedScenarioIds: [],
  },
  {
    id: 'buildings',
    title: 'Buildings',
    description:
      'Every building from BUILDING.MAP, as laid out in the file: twelve castle compounds and loose wall pieces, shown as their interiors (switch the intact and ruined layers on with the tile-layers debug option).',
    mapSource: `${import.meta.env.BASE_URL}maps/buildings.tmj`,
    // Units dropped by the unit-placing scenarios would land inside walls;
    // `empty`, allowed on every map, is still available.
    allowedScenarioIds: [],
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
