import { spawnInitialUnits } from '~/game/data/spawn';
import type { Scenario } from './types';

/**
 * A blue line facing a red line (reusing {@link spawnInitialUnits}, as
 * `test-skirmish` does), purely to have units on screen with health bars to
 * verify against. Load with `?scenario=test-health&map=empty` and press `H`
 * (see `damageAllUnits` in `~/components/game-canvas`) to watch the bars
 * shrink and shift green -> yellow -> red.
 *
 * Prefixed `test-`: it exists to test the engine's health-bar rendering, not
 * to demonstrate a real gameplay setup.
 */
export const testHealthScenario: Scenario = {
  id: 'test-health',
  title: 'Test: Health',
  description:
    'A blue line facing a red line, for exercising overhead health bars. Press H to damage all units.',
  setup: (world) => spawnInitialUnits(world),
};
