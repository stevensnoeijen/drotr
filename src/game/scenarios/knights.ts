import type { ParsedMap } from '~/game/map/load-tiled-map';
import { claimSpawn } from '~/game/systems/spawn-system';
import { cellSizeOf } from '~/lib/grid';
import type { Scenario } from './types';

/** Named spawn points this scenario requires the map to provide. */
const REQUIRED_SPAWN_IDS = ['red', 'blue'] as const;

/**
 * One blue knight and one red knight, spawned at the map's `red` and `blue`
 * spawn points. The minimal scenario for verifying a real, converted county
 * map loads and renders correctly in the engine: no roster, no
 * randomization, just two units placed where the map says they can go.
 */
export const knightsScenario: Scenario = {
  id: 'knights',
  title: 'Knights',
  description:
    "One blue knight and one red knight, spawned at the map's red and blue spawn points.",
  validateMap: (map?: ParsedMap) => {
    if (!map) {
      return 'The "knights" scenario needs a map with "red" and "blue" spawn points, but no map is selected.';
    }

    const spawnIds = new Set(map.spawns.map((spawn) => spawn.id));
    const missing = REQUIRED_SPAWN_IDS.filter((id) => !spawnIds.has(id));
    if (missing.length > 0) {
      return `The "knights" scenario needs the selected map to have ${missing
        .map((id) => `"${id}"`)
        .join(' and ')} spawn point${missing.length > 1 ? 's' : ''}, which it does not.`;
    }

    return undefined;
  },
  setup: (world, map) => {
    // Guarded defensively even though `validateMap` above is meant to keep
    // this from ever being called with a map that lacks the spawns it
    // needs — a caller that skips validation (e.g. a test) should still get
    // "spawn nothing" rather than an uncaught throw from `claimSpawn`.
    if (!map) {
      return;
    }

    const spawnIds = new Set(map.spawns.map((spawn) => spawn.id));
    if (!REQUIRED_SPAWN_IDS.every((id) => spawnIds.has(id))) {
      return;
    }

    const cellSize = cellSizeOf(map);
    claimSpawn(world, map.spawns, 'red', { team: 'red', units: ['knight'] }, cellSize);
    claimSpawn(world, map.spawns, 'blue', { team: 'blue', units: ['knight'] }, cellSize);
  },
};
