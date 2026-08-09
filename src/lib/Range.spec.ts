import { describe, expect, it } from 'vitest';

import { Range } from './Range';

describe('Range', () => {
  describe('constructor', () => {
    it('should set properties', () => {
      const range = new Range(0, 100);

      expect(range.min).toBe(0);
      expect(range.max).toBe(100);
    });
  });

  describe('includes', () => {
    it('should return true when number is inside', () => {
      const range = new Range(0, 100);

      expect(range.includes(50)).toBe(true);
    });

    it('should return true when number is on outer values', () => {
      const range = new Range(0, 100);

      expect(range.includes(0)).toBe(true);
      expect(range.includes(100)).toBe(true);
    });

    it('should return false when number outside', () => {
      const range = new Range(0, 100);

      expect(range.includes(-1)).toBe(false);
      expect(range.includes(101)).toBe(false);
    });
  });
});
