import type { ParsedMap } from '~/game/map/load-tiled-map';
import { claimSpawn } from '~/game/systems/spawn-system';
import { cellSizeOf } from '~/lib/grid';
import { pickDistinct, type RandomSource } from '~/lib/random';
import type { Scenario } from './types';

/** How many spawn points the scenario needs: one per knight. */
const REQUIRED_SPAWN_COUNT = 2;

/**
 * Builds the `knights` scenario, drawing its spawn choice from `random`
 * (`Math.random` by default; tests pass a seeded or scripted source so
 * the choice is repeatable).
 */
export function createKnightsScenario(
  random: RandomSource = Math.random
): Scenario {
  return {
    id: 'knights',
    title: 'Knights',
    description:
      'One red knight and one blue knight, each spawned at a different, randomly chosen spawn point of the map.',
    validateMap: (map?: ParsedMap) => {
      if (!map) {
        return `The "knights" scenario needs a map with at least ${REQUIRED_SPAWN_COUNT} spawn points, but no map is selected.`;
      }

      if (map.spawns.length < REQUIRED_SPAWN_COUNT) {
        return `The "knights" scenario needs the selected map to have at least ${REQUIRED_SPAWN_COUNT} spawn points, but it has ${map.spawns.length}.`;
      }

      return undefined;
    },
    setup: (world, map) => {
      // Guarded defensively even though `validateMap` above is meant to keep
      // this from ever being called with a map that lacks enough spawns — a
      // caller that skips validation (e.g. a test) should still get "spawn
      // nothing" rather than a throw.
      if (!map || map.spawns.length < REQUIRED_SPAWN_COUNT) {
        return;
      }

      const [red, blue] = pickDistinct(
        map.spawns,
        REQUIRED_SPAWN_COUNT,
        random
      );
      const cellSize = cellSizeOf(map);
      // A single-spawn list, so a map that (wrongly) repeats a spawn name
      // still gets each knight at the exact point picked for it.
      claimSpawn(
        world,
        [red],
        red.id,
        { team: 'red', units: ['knight'] },
        cellSize
      );
      claimSpawn(
        world,
        [blue],
        blue.id,
        { team: 'blue', units: ['knight'] },
        cellSize
      );
    },
  };
}

/**
 * One red knight and one blue knight, each on a different spawn point of
 * the selected map, chosen at random. The minimal scenario for verifying a
 * real, converted county map loads and renders correctly in the engine: no
 * roster, just two units placed where the map says they can go.
 */
export const knightsScenario: Scenario = createKnightsScenario();
