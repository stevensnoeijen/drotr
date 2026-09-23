import { describe, expect, it } from 'vitest';
import type { ParsedMap } from '~/game/map/load-tiled-map';
import type { MapDefinition } from '~/game/maps/types';
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

const unrestrictedMap: MapDefinition = {
  id: 'unrestricted',
  title: 'Unrestricted',
  description: '',
};

const restrictedMap: MapDefinition = {
  id: 'restricted',
  title: 'Restricted',
  description: '',
  allowedScenarioIds: ['constrained'],
};

describe('isScenarioCompatibleWithMap', () => {
  it('is compatible with any ready map when the scenario has no validateMap', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, undefined, readyMap)).toBe(true);
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, undefined, readyBlank)).toBe(true);
  });

  it('defers to validateMap once the map has loaded', () => {
    expect(isScenarioCompatibleWithMap(constrainedScenario, undefined, readyMap)).toBe(true);
    expect(isScenarioCompatibleWithMap(constrainedScenario, undefined, readyBlank)).toBe(false);
  });

  it('is not compatible while the map is still loading, even for an unconstrained scenario', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, undefined, loading)).toBe(false);
  });

  it('is not compatible when the map failed to load', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, undefined, error)).toBe(false);
  });

  it('is not compatible when no map state is known yet', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, undefined, undefined)).toBe(false);
  });

  it('has no restriction when the map defines no allowedScenarioIds', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, unrestrictedMap, readyMap)).toBe(
      true
    );
    expect(isScenarioCompatibleWithMap(constrainedScenario, unrestrictedMap, readyMap)).toBe(
      true
    );
  });

  it('rejects a scenario not in the map allowedScenarioIds allowlist', () => {
    expect(isScenarioCompatibleWithMap(unconstrainedScenario, restrictedMap, readyMap)).toBe(
      false
    );
  });

  it('accepts a scenario in the map allowedScenarioIds allowlist', () => {
    expect(isScenarioCompatibleWithMap(constrainedScenario, restrictedMap, readyMap)).toBe(true);
  });
});
