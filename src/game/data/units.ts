import type { Shape } from '~/game/ecs/types';

/**
 * The kinds of unit in the game. Names and starting HP match
 * `public/assets/entity-definitions.json` (the original game's unit roster),
 * so `unitType` stays stable once real sprites replace these primitives in
 * the asset-integration phase.
 */
export type UnitType = 'swordsmen' | 'knight' | 'crossbowsoldier';

/**
 * Static, per-type unit data. Deliberately minimal to start — type, shape and
 * starting health — and grows alongside the roadmap: combat stats in T2.3,
 * movement/speed in T3.1.
 */
export interface UnitDefinition {
  type: UnitType;
  shape: Shape;
  health: number;
}

/** All unit definitions, keyed by {@link UnitType}. */
export const units: Record<UnitType, UnitDefinition> = {
  swordsmen: {
    type: 'swordsmen',
    shape: 'square',
    health: 15,
  },
  knight: {
    type: 'knight',
    shape: 'circle',
    health: 12,
  },
  crossbowsoldier: {
    type: 'crossbowsoldier',
    shape: 'triangle',
    health: 10,
  },
};
