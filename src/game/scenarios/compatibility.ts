import type { ParsedMap } from '~/game/map/load-tiled-map';
import type { MapDefinition } from '~/game/maps/types';
import type { Scenario } from './types';

/**
 * The state of trying to resolve a map's `.tmj` into a {@link ParsedMap}
 * (or a blank map with no `mapSource`, resolved as `map: undefined`),
 * mirroring the discriminated-union loading pattern used elsewhere (see
 * `useArtFile` in `~/views/atlas`).
 */
export type MapLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; map?: ParsedMap };

/**
 * Whether `scenario` can be used with `map` — checking both directions of
 * restriction: the scenario's own `validateMap` (needs the parsed map,
 * behind `mapState`), and the map's `allowedScenarioIds` allowlist (static,
 * needs only the map definition). A map still `loading` (or one that failed
 * to load) is treated as not-yet-usable rather than valid, so the picker
 * doesn't let a combination through before it actually knows the answer.
 */
export function isScenarioCompatibleWithMap(
  scenario: Scenario,
  map: MapDefinition | undefined,
  mapState: MapLoadState | undefined
): boolean {
  if (map?.allowedScenarioIds && !map.allowedScenarioIds.includes(scenario.id)) {
    return false;
  }
  if (!mapState || mapState.status !== 'ready') {
    return false;
  }
  return scenario.validateMap?.(mapState.map) === undefined;
}
