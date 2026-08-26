import { spawnInitialUnits } from '~/game/data/spawn';
import type { Scenario } from './types';

/**
 * Two blue-vs-red swordsmen pairs, exercising unit rendering, placement and
 * (once combat lands) attack-range behaviour independent of any map: one
 * pair placed next to each other so they're immediately within attack
 * range, the other placed four tiles apart so they're not. Prefixed
 * `test`: it exists to test the engine, not to demonstrate a real gameplay
 * setup.
 */
export const testScenario: Scenario = {
  id: 'test',
  title: 'Test',
  description:
    'Two swordsmen pairs: one within attack range fighting, one four tiles apart not fighting.',
  setup: (world) => spawnInitialUnits(world),
};
