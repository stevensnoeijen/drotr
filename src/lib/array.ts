import { toEqual } from './predicate';
import type { ArrayMinLength, Comparator, HasEquals } from './types';

export const getRandomValue = <T>(array: ArrayMinLength<T, 1>): T => {
  return array[Math.ceil(Math.random() * array.length) - 1];
};

export const keepOrder: Comparator<unknown> = () => 0;

export const removeNullable = Boolean as <T>(t: T) => NonNullable<T>;

export const arrayIncludesByEquals = <T extends HasEquals>(
  array: T[],
  object: T
): boolean => {
  return array.find(toEqual(object)) != null;
};
