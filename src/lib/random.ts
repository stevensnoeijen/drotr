/**
 * A source of uniformly distributed numbers in `[0, 1)`, shaped like
 * `Math.random` so it can stand in for it. Code that makes a random choice
 * takes one of these (defaulting to `Math.random`) so tests can pass a
 * seeded one from {@link createSeededRandom} and get a repeatable result.
 */
export type RandomSource = () => number;

/**
 * A deterministic {@link RandomSource} (mulberry32): the same `seed`
 * always yields the same sequence. Not suitable for anything
 * security-sensitive.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` distinct elements of `items` (distinct by position, not value),
 * chosen uniformly at random with a partial Fisher–Yates shuffle, in the
 * order they were drawn. Draws `count` numbers from `random`; `items`
 * itself is not modified.
 *
 * @throws {RangeError} when `items` has fewer than `count` elements.
 */
export function pickDistinct<T>(
  items: readonly T[],
  count: number,
  random: RandomSource = Math.random
): T[] {
  if (count > items.length) {
    throw new RangeError(
      `Cannot pick ${count} distinct items from ${items.length}`
    );
  }
  const pool = [...items];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
