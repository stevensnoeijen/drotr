import type { Shape } from '~/game/ecs/types';

/**
 * The kinds of unit in the game. A single-member union for now; it grows as
 * more units are introduced.
 */
export type UnitType = 'soldier';

/**
 * Static, per-type unit data. Deliberately minimal to start — just the type and
 * its rendered shape — and grows alongside the roadmap: combat/health stats in
 * T2.3, movement/speed in T3.1.
 */
export interface UnitDefinition {
  type: UnitType;
  shape: Shape;
}

/** All unit definitions, keyed by {@link UnitType}. */
export const units: Record<UnitType, UnitDefinition> = {
  soldier: {
    type: 'soldier',
    shape: 'circle',
  },
};
