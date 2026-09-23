import { useEffect, useState } from 'react';

import type { MapDefinition } from '~/game/maps/types';
import type { MapLoadState } from '~/game/scenarios/compatibility';
import { loadTiledMap } from './load-tiled-map';

/**
 * Loads and parses every map's `.tmj` once (a map with no `mapSource` is a
 * blank map, resolved immediately as `{ status: 'ready', map: undefined }`
 * with no fetch), caching each by map id for the lifetime of the component.
 *
 * Only ever a handful of maps exist today, so this loads all of them
 * eagerly rather than lazily per-selection — simpler, and cheap at this
 * scale. Callers that need this to decide which map/scenario combinations
 * are usable (e.g. the picker) should revisit eager-loading if the map
 * count grows enough to make it wasteful.
 */
export function useParsedMaps(
  maps: readonly MapDefinition[]
): Record<string, MapLoadState> {
  const [states, setStates] = useState<Record<string, MapLoadState>>(() =>
    Object.fromEntries(
      maps.map((map) => [
        map.id,
        map.mapSource ? { status: 'loading' } : { status: 'ready', map: undefined },
      ])
    )
  );

  useEffect(() => {
    let cancelled = false;

    for (const map of maps) {
      if (!map.mapSource) {
        continue;
      }
      loadTiledMap(map.mapSource)
        .then((parsed) => {
          if (!cancelled) {
            setStates((prev) => ({ ...prev, [map.id]: { status: 'ready', map: parsed } }));
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setStates((prev) => ({
              ...prev,
              [map.id]: {
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
              },
            }));
          }
        });
    }

    return () => {
      cancelled = true;
    };
    // `maps` is the static registry import; identity is stable across
    // renders so this only ever runs once per mount.
  }, [maps]);

  return states;
}
