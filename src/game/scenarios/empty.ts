import type { Scenario } from './types';

/**
 * The baseline scenario: an empty world with no units. Exercises the harness
 * itself (routing, resolution, debug overlays) independent of any spawn or
 * map content.
 */
export const emptyScenario: Scenario = {
  id: 'empty',
  title: 'Empty',
  description: 'An empty world with no units. Loads no systems or entities.',
  map: 'empty',
  setup: () => {},
};
