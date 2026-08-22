import { spawnInitialUnits } from '~/game/data/spawn';
import type { Scenario } from './types';

/**
 * A blue line facing a red line, exercising unit rendering and placement
 * independent of any map. Prefixed `test-`: it exists to test the engine,
 * not to demonstrate a real gameplay setup.
 */
export const testSkirmishScenario: Scenario = {
  id: 'test-skirmish',
  title: 'Test: Skirmish',
  description: 'A small blue line facing a red line.',
  setup: (world) => spawnInitialUnits(world),
};
