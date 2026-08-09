import { spawnInitialUnits } from '~/game/data/spawn';
import type { TestCase } from '../types';

/** A blue line facing a red line, exercising unit rendering and placement. */
export const skirmishCase: TestCase = {
  id: 'skirmish',
  title: 'Skirmish',
  description: 'A small blue line facing a red line.',
  map: 'empty',
  setup: spawnInitialUnits,
};
