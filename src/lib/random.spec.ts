import { describe, expect, it } from 'vitest';

import { createSeededRandom, pickDistinct } from './random';

describe('createSeededRandom', () => {
  it('yields the same sequence for the same seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const first = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(first);
    expect(new Set(first).size).toBe(5);
  });

  it('yields a different sequence for a different seed', () => {
    expect(createSeededRandom(1)()).not.toEqual(createSeededRandom(2)());
  });

  it('stays within [0, 1)', () => {
    const random = createSeededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('pickDistinct', () => {
  it('draws distinct elements, in draw order', () => {
    const draws = [0.5, 0.75];
    const random = () => draws.shift()!;
    // 0.5 of 3 picks index 1; then 0.75 of the remaining 2 picks the last.
    expect(pickDistinct(['a', 'b', 'c'], 2, random)).toEqual(['b', 'c']);
  });

  it('never picks the same position twice, whatever the source returns', () => {
    const items = ['a', 'b', 'c', 'd'];
    for (const value of [0, 0.25, 0.5, 0.999]) {
      const picked = pickDistinct(items, 4, () => value);
      expect([...picked].sort()).toEqual(items);
    }
  });

  it('leaves the input untouched', () => {
    const items = ['a', 'b', 'c'];
    pickDistinct(items, 2, () => 0.9);
    expect(items).toEqual(['a', 'b', 'c']);
  });

  it('throws when there are fewer items than requested', () => {
    expect(() => pickDistinct(['a'], 2)).toThrow(RangeError);
  });
});
