import type { Scenario } from './types';

/**
 * The baseline scenario: an empty world with no units. Exercises the harness
 * itself (routing, resolution, debug overlays) independent of any spawn or
 * map content. Prefixed `test-`: it exists to test the engine, not to
 * demonstrate a real gameplay setup.
 */
export const testEmptyScenario: Scenario = {
  id: 'test-empty',
  title: 'Test: Empty',
  description: 'An empty world with no units. Loads no systems or entities.',
  setup: () => {},
};
