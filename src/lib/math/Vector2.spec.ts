import { describe, expect, test } from 'vitest';

import { Vector2 } from './Vector2';

describe('Vector2', () => {
  describe('ZERO', () => {
    test('values', () => {
      expect(Vector2.ZERO.x).toEqual(0);
      expect(Vector2.ZERO.y).toEqual(0);
    });
  });
  describe('constructor', () => {
    test('set values', () => {
      const vector = new Vector2(100, 200);

      expect(vector.x).toEqual(100);
      expect(vector.y).toEqual(200);
    });
  });
  describe('magnitude', () => {
    test('simple', () => {
      const vector = new Vector2(100, 0);
      expect(vector.magnitude()).toEqual(100);
    });
    test('simple2', () => {
      const vector = new Vector2(100, 100);
      expect(vector.magnitude()).toBeCloseTo(141.42);
    });
  });
  describe('normalized', () => {
    test('simple', () => {
      const vector = new Vector2(3, 4);
      const normalizedVector = vector.normalized();
      expect(normalizedVector.x).toBeCloseTo(0.6);
      expect(normalizedVector.y).toBeCloseTo(0.8);
    });
  });
  describe('distance', () => {
    test('simple', () => {
      const a = new Vector2(1, 1);
      const b = new Vector2(2, 2);

      expect(Vector2.distance(a, b)).toBeCloseTo(1.41);
    });
  });
  describe('lerp', () => {
    test('simple', () => {
      const a = new Vector2(0, 0);
      const b = new Vector2(1, 0);

      expect(Vector2.lerp(a, b, 0.5)).toEqual({ x: 0.5, y: 0 });
    });
  });
  describe('angle', () => {
    test('same location', () => {
      expect(Vector2.angle(new Vector2(0, 0), new Vector2(0, 0))).toEqual(0);
    });
    test('above', () => {
      expect(Vector2.angle(new Vector2(0, 0), new Vector2(0, -1))).toEqual(-90);
    });
    test('above-right', () => {
      expect(Vector2.angle(new Vector2(0, 0), new Vector2(1, -1))).toEqual(-45);
    });
    test('right', () => {
      expect(Vector2.angle(new Vector2(0, 0), new Vector2(1, 0))).toEqual(0);
    });
    test('right-below', () => {
      expect(Vector2.angle(new Vector2(0, 0), new Vector2(1, 1))).toEqual(45);
    });
    test('below', () => {
      expect(Vector2.angle(new Vector2(0, 0), new Vector2(0, 1))).toEqual(90);
    });
    test('below-left', () => {
      expect(Vector2.angle(new Vector2(0, 0), new Vector2(-1, 1))).toEqual(135);
    });
    test('left', () => {
      expect(Vector2.angle(new Vector2(0, 0), new Vector2(-1, 0))).toEqual(180);
    });
    test('left-above', () => {
      expect(Vector2.angle(new Vector2(0, 0), new Vector2(-1, -1))).toEqual(
        -135
      );
    });
  });
  describe('scale', () => {
    test('simple', () => {
      expect(Vector2.scale(new Vector2(2, 2), new Vector2(2, 2))).toEqual({
        x: 4,
        y: 4,
      });
    });
  });
  describe('min', () => {
    test('simple', () => {
      expect(Vector2.min(new Vector2(1, 2), new Vector2(2, 1))).toEqual({
        x: 1,
        y: 1,
      });
    });
  });
  describe('max', () => {
    test('simple', () => {
      expect(Vector2.max(new Vector2(1, 2), new Vector2(2, 1))).toEqual({
        x: 2,
        y: 2,
      });
    });
  });
  describe('subtracts', () => {
    test('simple', () => {
      expect(Vector2.subtracts(new Vector2(1, 1), new Vector2(1, 1))).toEqual({
        x: 0,
        y: 0,
      });
    });
  });
  describe('multiplies', () => {
    test('simple', () => {
      expect(Vector2.multiplies(new Vector2(1, 1), 2)).toEqual({ x: 2, y: 2 });
    });
  });
  describe('divides', () => {
    test('simple', () => {
      expect(Vector2.divides(new Vector2(2, 2), 2)).toEqual({ x: 1, y: 1 });
    });
  });
  describe('adds', () => {
    test('simple', () => {
      expect(Vector2.subtracts(new Vector2(1, 1), new Vector2(1, 1))).toEqual({
        x: 0,
        y: 0,
      });
    });
  });
  describe('equals', () => {
    test('false', () => {
      expect(new Vector2(1, 1).equals(new Vector2(2, 2))).toBe(false);
    });
    test('true', () => {
      expect(new Vector2(1, 1).equals(new Vector2(1, 1))).toBe(true);
    });
  });
});
