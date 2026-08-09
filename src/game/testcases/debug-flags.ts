/** Debug overlays a test case can be loaded with, via `?debug=grid,paths`. */
export type DebugFlag = 'grid' | 'paths' | 'targets' | 'health';

const VALID_DEBUG_FLAGS: ReadonlySet<string> = new Set([
  'grid',
  'paths',
  'targets',
  'health',
]);

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
