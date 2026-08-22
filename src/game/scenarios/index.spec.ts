import { describe, expect, it } from 'vitest';

import { resolveScenario, scenarios } from './index';

describe('resolveScenario', () => {
  it('resolves a known id', () => {
    const result = resolveScenario(new URLSearchParams('scenario=test-empty'));

    expect(result.error).toBeUndefined();
    if (!result.error) {
      expect(result.scenario.id).toBe('test-empty');
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

  it('registers the test-empty, test-skirmish and test-health scenarios', () => {
    expect(scenarios.some((s) => s.id === 'test-empty')).toBe(true);
    expect(scenarios.some((s) => s.id === 'test-skirmish')).toBe(true);
    expect(scenarios.some((s) => s.id === 'test-health')).toBe(true);
  });
});
