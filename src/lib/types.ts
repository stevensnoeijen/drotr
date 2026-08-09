export type Predicate<T> = (value: T, index?: number, array?: T[]) => unknown;

type BuildArrayMinLength<
  T,
  N extends number,
  Current extends T[]
> = Current['length'] extends N
  ? [...Current, ...T[]]
  : BuildArrayMinLength<T, N, [...Current, T]>;

export type ArrayMinLength<T, N extends number> = BuildArrayMinLength<T, N, []>;

export type Comparator<T> = (a: T, b: T) => number;

export type HasEquals = { equals: (other: unknown) => boolean };
