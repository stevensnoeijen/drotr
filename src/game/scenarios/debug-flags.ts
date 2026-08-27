/** Debug overlays a scenario can be loaded with, via `?debug=grid,health,unit-info`. */
export type DebugFlag = 'grid' | 'health' | 'unit-info' | 'targets';

/** Every known debug flag, in the order they're offered in the UI. */
export const ALL_DEBUG_FLAGS: readonly DebugFlag[] = [
  'grid',
  'health',
  'unit-info',
  'targets',
];

const VALID_DEBUG_FLAGS: ReadonlySet<string> = new Set(ALL_DEBUG_FLAGS);

function isDebugFlag(value: string): value is DebugFlag {
  return VALID_DEBUG_FLAGS.has(value);
}

/**
 * Parses the comma-separated `?debug=` query value into a set of known flags.
 * Unknown flags are silently ignored rather than throwing, so a typo never
 * breaks the page — it just fails to turn on the overlay it meant to.
 */
export function parseDebugFlags(raw: string | null): ReadonlySet<DebugFlag> {
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(',')
      .map((flag) => flag.trim())
      .filter(isDebugFlag)
  );
}

/**
 * Serializes a set of flags back into the `?debug=` query value, in
 * {@link ALL_DEBUG_FLAGS} order so the URL is stable regardless of the order
 * flags were toggled in. Empty input serializes to `''` — callers should
 * drop the `debug` param entirely in that case rather than keep `debug=`.
 */
export function serializeDebugFlags(flags: ReadonlySet<DebugFlag>): string {
  return ALL_DEBUG_FLAGS.filter((flag) => flags.has(flag)).join(',');
}
