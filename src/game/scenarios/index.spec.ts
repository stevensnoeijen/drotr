import { describe, expect, it } from 'vitest';

import { resolveScenario, scenarios } from './index';

describe('resolveScenario', () => {
  it('resolves a known id', () => {
    const result = resolveScenario(new URLSearchParams('scenario=empty'));

    expect(result.error).toBeUndefined();
    if (!result.error) {
      expect(result.scenario.id).toBe('empty');
      expect(result.map).toBe(result.scenario.map);
    }
  });

  it('returns a typed error for an unknown id, not a throw', () => {
    const result = resolveScenario(new URLSearchParams('scenario=bogus'));

    expect(result.error).toBe(true);
    if (result.error) {
      expect(result.requestedId).toBe('bogus');
      expect(result.validIds).toEqual(scenarios.map((s) => s.id));
    }
  });

  it('returns a typed error when scenario is absent', () => {
    const result = resolveScenario(new URLSearchParams());

    expect(result.error).toBe(true);
    if (result.error) {
      expect(result.requestedId).toBe('');
    }
  });

  it('overrides the map via ?map=', () => {
    const result = resolveScenario(
      new URLSearchParams('scenario=empty&map=custom')
    );

    expect(result.error).toBeUndefined();
    if (!result.error) {
      expect(result.map).toBe('custom');
    }
  });

  it('registers a first empty scenario', () => {
    expect(scenarios.some((s) => s.id === 'empty')).toBe(true);
  });
});
