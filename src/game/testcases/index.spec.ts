import { describe, expect, it } from 'vitest';

import { resolveTestCase, testCases } from './index';

describe('resolveTestCase', () => {
  it('resolves a known id', () => {
    const result = resolveTestCase(new URLSearchParams('case=empty'));

    expect(result.error).toBeUndefined();
    if (!result.error) {
      expect(result.testCase.id).toBe('empty');
      expect(result.map).toBe(result.testCase.map);
    }
  });

  it('returns a typed error for an unknown id, not a throw', () => {
    const result = resolveTestCase(new URLSearchParams('case=bogus'));

    expect(result.error).toBe(true);
    if (result.error) {
      expect(result.requestedId).toBe('bogus');
      expect(result.validIds).toEqual(testCases.map((tc) => tc.id));
    }
  });

  it('returns a typed error when case is absent', () => {
    const result = resolveTestCase(new URLSearchParams());

    expect(result.error).toBe(true);
    if (result.error) {
      expect(result.requestedId).toBe('');
    }
  });

  it('overrides the map via ?map=', () => {
    const result = resolveTestCase(new URLSearchParams('case=empty&map=custom'));

    expect(result.error).toBeUndefined();
    if (!result.error) {
      expect(result.map).toBe('custom');
    }
  });

  it('registers a first empty case', () => {
    expect(testCases.some((tc) => tc.id === 'empty')).toBe(true);
  });
});
