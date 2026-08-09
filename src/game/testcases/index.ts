import { emptyCase } from './cases/empty';
import { skirmishCase } from './cases/skirmish';
import type { TestCase } from './types';

export type { TestCase, SystemName } from './types';
export { parseDebugFlags } from './debug-flags';
export type { DebugFlag } from './debug-flags';

/** Every registered test case, in the order they're listed on `/`. */
export const testCases: readonly TestCase[] = [emptyCase, skirmishCase];

const testCasesById = new Map(testCases.map((tc) => [tc.id, tc]));

export interface ResolvedTestCase {
  readonly error?: never;
  readonly testCase: TestCase;
  /** The map to load: `?map=` if given, else the case's own default. */
  readonly map: string;
}

export interface UnresolvedTestCase {
  readonly error: true;
  /** The `?case=` value that failed to resolve; empty string if absent. */
  readonly requestedId: string;
  readonly validIds: readonly string[];
}

/**
 * Resolves `?case=` (and `?map=`) against the registry. Never throws: an
 * absent or unknown id comes back as a typed {@link UnresolvedTestCase} so
 * callers can render a visible error listing the valid ids instead of a
 * blank canvas.
 */
export function resolveTestCase(
  searchParams: URLSearchParams
): ResolvedTestCase | UnresolvedTestCase {
  const requestedId = searchParams.get('case') ?? '';
  const testCase = testCasesById.get(requestedId);

  if (!testCase) {
    return {
      error: true,
      requestedId,
      validIds: testCases.map((tc) => tc.id),
    };
  }

  return {
    testCase,
    map: searchParams.get('map') ?? testCase.map,
  };
}
