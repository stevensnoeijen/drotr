import { emptyScenario } from './empty';
import { skirmishScenario } from './skirmish';
import type { Scenario } from './types';

export type { Scenario, SystemName } from './types';
export { ALL_DEBUG_FLAGS, parseDebugFlags, serializeDebugFlags } from './debug-flags';
export type { DebugFlag } from './debug-flags';

/** Every registered scenario, in the order they're listed on `/`. */
export const scenarios: readonly Scenario[] = [emptyScenario, skirmishScenario];

const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

export interface ResolvedScenario {
  readonly error?: never;
  readonly scenario: Scenario;
  /** The map to load: `?map=` if given, else the scenario's own default. */
  readonly map: string;
}

export interface UnresolvedScenario {
  readonly error: true;
  /** The `?scenario=` value that failed to resolve; empty string if absent. */
  readonly requestedId: string;
  readonly validIds: readonly string[];
}

/**
 * Resolves `?scenario=` (and `?map=`) against the registry. Never throws: an
 * absent or unknown id comes back as a typed {@link UnresolvedScenario} so
 * callers can render a visible error listing the valid ids instead of a
 * blank canvas.
 */
export function resolveScenario(
  searchParams: URLSearchParams
): ResolvedScenario | UnresolvedScenario {
  const requestedId = searchParams.get('scenario') ?? '';
  const scenario = scenariosById.get(requestedId);

  if (!scenario) {
    return {
      error: true,
      requestedId,
      validIds: scenarios.map((s) => s.id),
    };
  }

  return {
    scenario,
    map: searchParams.get('map') ?? scenario.map,
  };
}
