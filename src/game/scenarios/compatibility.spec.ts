import { describe, expect, it } from 'vitest';
import type { ParsedMap } from '~/game/map/load-tiled-map';
import { isScenarioCompatibleWithMap, type MapLoadState } from './compatibility';
import type { Scenario } from './types';

const unconstrainedScenario: Scenario = {
  id: 'unconstrained',
  title: 'Unconstrained',
  description: '',
  setup: () => {},
};

const constrainedScenario: Scenario = {
  id: 'constrained',
  title: 'Constrained',
  description: '',
  setup: () => {},
  validateMap: (map?: ParsedMap) =>
    map ? undefined : 'needs a map',
};

const readyMap: MapLoadState = { status: 'ready', map: {} as ParsedMap };
const readyBlank: MapLoadState = { status: 'ready', map: undefined };
const loading: MapLoadState = { status: 'loading' };
const error: MapLoadState = { status: 'error', message: 'boom' };

describe('isScenarioCompatibleWithMap', () => {
  it('is compatible with any ready map when the scenario has no validateMap', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, readyMap)).toBe(true);
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, readyBlank)).toBe(true);
  });

  it('defers to validateMap once the map has loaded', () => {
    expect(isScenarioCompatibleWithMap(constrainedScenario, readyMap)).toBe(true);
    expect(isScenarioCompatibleWithMap(constrainedScenario, readyBlank)).toBe(false);
  });

  it('is not compatible while the map is still loading, even for an unconstrained scenario', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, loading)).toBe(false);
  });

  it('is not compatible when the map failed to load', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, error)).toBe(false);
  });

  it('is not compatible when no map state is known yet', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, undefined)).toBe(false);
  });
});
