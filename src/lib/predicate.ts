import type { HasEquals, Predicate } from './types';

export const not = <T>(predicate: Predicate<T>): Predicate<T> => {
  return (obj) => !predicate(obj);
};

export const falsePredicate: Predicate<unknown> = () => false;

export const toEqual = <T extends HasEquals>(other: T): Predicate<T> => {
  return (item: T) => item.equals(other);
};
