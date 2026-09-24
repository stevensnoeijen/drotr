import { describe, expect, it } from 'vitest';
import type { ParsedMap } from '~/game/map/load-tiled-map';
import type { MapDefinition } from '~/game/maps/types';
import {
  isScenarioCompatibleWithMap,
  pickCompatibleScenarioId,
  type MapLoadState,
} from './compatibility';
import { emptyScenario } from './empty';
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

  describe('allowedOnEveryMap', () => {
    const emptyAllowlistMap: MapDefinition = {
      id: 'empty-allowlist',
      title: 'Empty allowlist',
      description: '',
      allowedScenarioIds: [],
    };
    const everyMapScenario: Scenario = {
      ...unconstrainedScenario,
      id: 'every-map',
      allowedOnEveryMap: true,
    };

    it('accepts `empty` on a map whose allowlist excludes it', () => {
      expect(restrictedMap.allowedScenarioIds).not.toContain('empty');
      expect(isScenarioCompatibleWithMap(emptyScenario, restrictedMap, readyMap)).toBe(true);
      expect(isScenarioCompatibleWithMap(emptyScenario, emptyAllowlistMap, readyMap)).toBe(true);
    });

    it('still rejects a scenario without the flag from that map', () => {
      expect(isScenarioCompatibleWithMap(unconstrainedScenario, restrictedMap, readyMap)).toBe(
        false
      );
      expect(isScenarioCompatibleWithMap(unconstrainedScenario, emptyAllowlistMap, readyMap)).toBe(
        false
      );
    });

    it('accepts `empty` on an unrestricted map and the blank map', () => {
      expect(isScenarioCompatibleWithMap(emptyScenario, unrestrictedMap, readyMap)).toBe(true);
      expect(isScenarioCompatibleWithMap(emptyScenario, undefined, readyBlank)).toBe(true);
    });

    it('still defers to the map load state', () => {
      expect(isScenarioCompatibleWithMap(emptyScenario, restrictedMap, loading)).toBe(false);
      expect(isScenarioCompatibleWithMap(emptyScenario, restrictedMap, error)).toBe(false);
      expect(isScenarioCompatibleWithMap(emptyScenario, restrictedMap, undefined)).toBe(false);
    });

    it("still applies the scenario's own validateMap", () => {
      const picky: Scenario = { ...constrainedScenario, allowedOnEveryMap: true };
      expect(isScenarioCompatibleWithMap(picky, emptyAllowlistMap, readyMap)).toBe(true);
      expect(isScenarioCompatibleWithMap(picky, emptyAllowlistMap, readyBlank)).toBe(false);
    });

    it('lets pickCompatibleScenarioId fall back to it on a map that allows nothing else', () => {
      expect(
        pickCompatibleScenarioId(
          [unconstrainedScenario, everyMapScenario],
          'unconstrained',
          emptyAllowlistMap,
          readyMap
        )
      ).toBe('every-map');
      expect(
        pickCompatibleScenarioId(
          [constrainedScenario, emptyScenario],
          'constrained',
          emptyAllowlistMap,
          readyMap
        )
      ).toBe('empty');
    });
  });
});

describe('pickCompatibleScenarioId', () => {
  const scenarios = [unconstrainedScenario, constrainedScenario];

  it('keeps the current scenario when it is still compatible', () => {
    expect(
      pickCompatibleScenarioId(scenarios, 'unconstrained', unrestrictedMap, readyMap)
    ).toBe('unconstrained');
  });

  it('switches to the first compatible scenario when the current one no longer fits', () => {
    // `unconstrained` isn't in restrictedMap's allowlist, so it should fall
    // back to `constrained`, the first (and only) scenario that is.
    expect(pickCompatibleScenarioId(scenarios, 'unconstrained', restrictedMap, readyMap)).toBe(
      'constrained'
    );
  });

  it('picks scenarios in registry order, not alphabetically or by id', () => {
    // Both scenarios are compatible with an unrestricted, ready map, so the
    // first one in the list passed in should win regardless of current pick.
    expect(pickCompatibleScenarioId(scenarios, 'constrained', unrestrictedMap, readyBlank)).toBe(
      'unconstrained'
    );
  });

  it('falls back to the current selection when nothing in the list is compatible', () => {
    expect(pickCompatibleScenarioId(scenarios, 'unconstrained', restrictedMap, readyBlank)).toBe(
      'unconstrained'
    );
  });
});
