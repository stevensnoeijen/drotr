import { describe, expect, it } from 'vitest';

import { returnFalse, returnTrue } from '~/lib/test/utils';

import { not, toEqual } from './predicate';

describe('not', () => {
  it.each([
    [true, false],
    [false, true],
  ])("should reverse predicate's response %s to %s", (request, response) => {
    expect(not(() => request)(undefined)).toEqual(response);
  });
});

describe('toEqual', () => {
  it('should return false when item is not equal', () => {
    const object = {
      equals: returnTrue,
    };

    const predicate = toEqual(object);

    expect(predicate({ equals: returnFalse }, 0, [])).toEqual(false);
  });

  it('should return true when item is equal', () => {
    const object = {
      equals: returnFalse,
    };

    const predicate = toEqual(object);

    expect(predicate({ equals: returnTrue }, 0, [])).toEqual(true);
  });
});
