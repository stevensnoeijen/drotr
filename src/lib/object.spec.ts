import { describe, expect, it } from 'vitest';

import { isAnyPropertySet, omitUndefined } from './object';

describe('isAnyPropertySet', () => {
  it('should return false when empty object is given', () => {
    expect(isAnyPropertySet({})).toBe(false);
  });

  it('should return false when object with undefined value is given', () => {
    expect(
      isAnyPropertySet({
        test: undefined,
      })
    ).toBe(false);
  });

  it('should return true when object with defined value is given', () => {
    expect(
      isAnyPropertySet({
        test: 1,
      })
    ).toBe(true);
  });
});

describe('omitUndefined', () => {
  it('should remove undefined properties from object', () => {
    expect(
      omitUndefined({
        novalue: undefined,
      })
    ).toEqual({});
  });

  it('should not remove properties with value', () => {
    expect(
      omitUndefined({
        null: null,
        zero: 0,
        neg: -1,
        emptyString: '',
      })
    ).toEqual({
      null: null,
      zero: 0,
      neg: -1,
      emptyString: '',
    });
  });
});
