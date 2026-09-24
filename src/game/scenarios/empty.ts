import type { Scenario } from './types';

/**
 * Spawns nothing, for inspecting a map on its own: its terrain, collision
 * and layers with no units in the way. It needs nothing from the map (so no
 * `validateMap`, and it works with the blank map too) and can't disturb one,
 * so it's allowed on every map, bypassing any map's `allowedScenarioIds`.
 *
 * Deliberately named `empty` rather than `test-empty`: it's a general map
 * viewer, not an engine test.
 */
export const emptyScenario: Scenario = {
  id: 'empty',
  title: 'Empty',
  description: 'Spawns nothing — for inspecting a map.',
  allowedOnEveryMap: true,
  setup: () => {},
};
