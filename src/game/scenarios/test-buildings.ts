import type { BuildingPlacement } from '~/game/map/building-placement';
import { validatePlacements } from '~/game/map/building-placement';
import type { Scenario } from './types';

/** One castle, one tower and one bridge on Braila's construction sites. */
export const TEST_BUILDINGS_PLACEMENTS: BuildingPlacement[] = [
  { site: 'castle-1', level: '4' },
  { site: 'tower-1', level: 'grass' },
  { site: 'bridge-2', level: 'stone' },
];

/**
 * Draws a castle, a tower and a bridge onto the map's construction sites and
 * spawns nothing, to exercise placing buildings. It needs a map with those
 * sites (Braila), which `validateMap` checks. Prefixed `test-`: it exists to
 * exercise the engine, not to demonstrate a real gameplay setup.
 */
export const testBuildingsScenario: Scenario = {
  id: 'test-buildings',
  title: 'Test: Buildings',
  description:
    'A castle (level 4), a tower and a stone bridge drawn onto the map construction sites.',
  buildings: TEST_BUILDINGS_PLACEMENTS,
  validateMap: (map) => validatePlacements(map, TEST_BUILDINGS_PLACEMENTS),
  setup: () => {},
};
