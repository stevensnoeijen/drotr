import { spawnInitialUnits } from '~/game/data/spawn';
import type { Scenario } from './types';

/** A blue line facing a red line, exercising unit rendering and placement. */
export const skirmishScenario: Scenario = {
  id: 'skirmish',
  title: 'Skirmish',
  description: 'A small blue line facing a red line.',
  map: 'empty',
  setup: spawnInitialUnits,
};
