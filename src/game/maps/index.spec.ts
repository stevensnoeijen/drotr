import { describe, expect, it } from 'vitest';

import { maps, resolveMap } from './index';

describe('resolveMap', () => {
  it('resolves a known id', () => {
    const result = resolveMap(new URLSearchParams('map=empty'));

    expect(result.error).toBeUndefined();
    if (!result.error) {
      expect(result.map.id).toBe('empty');
    }
  });

  it('returns a typed error for an unknown id, not a throw', () => {
    const result = resolveMap(new URLSearchParams('map=bogus'));

    expect(result.error).toBe(true);
    if (result.error) {
      expect(result.requestedId).toBe('bogus');
      expect(result.validIds).toEqual(maps.map((m) => m.id));
    }
  });

  it('returns a typed error when map is absent', () => {
    const result = resolveMap(new URLSearchParams());

    expect(result.error).toBe(true);
    if (result.error) {
      expect(result.requestedId).toBe('');
    }
  });

  it('registers the empty and grass maps', () => {
    expect(maps.some((m) => m.id === 'empty')).toBe(true);
    expect(maps.some((m) => m.id === 'grass')).toBe(true);
  });
});
