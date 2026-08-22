import { claimSpawn } from '~/game/systems/spawn-system';
import type { Scenario } from './types';

/**
 * Claims each of a map's spawn points for a team, spawning several units —
 * of mixed types — on a single point at once. Spawn points carry no team or
 * unit type of their own; a scenario decides who owns each one and what
 * appears there. Written against the `grass` map's two spawn points
 * ("spawn-1", "spawn-2") — pick a map that provides matching ids.
 *
 * Prefixed `test-`: it exists to test the engine (spawn claiming, multiple
 * units sharing one point), not to demonstrate a real gameplay setup.
 */
export const testClaimSpawnsScenario: Scenario = {
  id: 'test-claim-spawns',
  title: 'Test: Claim Spawns',
  description:
    'Claims a map’s spawns for blue and red, several mixed-type units per spawn.',
  setup: (world, map) => {
    if (!map) {
      return;
    }
    claimSpawn(world, map.spawns, 'spawn-1', {
      team: 'blue',
      units: ['swordsmen', 'swordsmen', 'crossbowsoldier'],
    });
    claimSpawn(world, map.spawns, 'spawn-2', {
      team: 'red',
      units: ['knight', 'crossbowsoldier'],
    });
  },
};
