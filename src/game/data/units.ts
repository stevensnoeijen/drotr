import type { Shape } from '~/game/ecs/types';
import swordsmenData from './units/swordsmen.json';
import crossbowsoldierData from './units/crossbowsoldier.json';

/**
 * The kinds of unit in the game. Names and starting HP match
 * `public/assets/entity-definitions.json` (the original game's unit roster),
 * so `unitType` stays stable once real sprites replace these primitives in
 * the asset-integration phase.
 */
export type UnitType = 'swordsmen' | 'knight' | 'crossbowsoldier';

/**
 * Static, per-type unit data. Core fields (type, shape, health) are present
 * on all units. Combat stats (attackDamage, accuracy, defence, stamina, speed,
 * range, aggroRange) are present on JSON-defined units; legacy inline units
 * lack them.
 */
export interface UnitDefinition {
  type: UnitType;
  shape: Shape;
  health: number;
  attackDamage?: number;
  accuracy?: number;
  defence?: number;
  stamina?: number;
  speed?: number;
  range?: number;
  /** Detection/aggro range in grid cells — see {@link file://../ecs/types.ts#AggroRange}. */
  aggroRange?: number;
  assets?: unknown;
}

/** All unit definitions, keyed by {@link UnitType}. */
export const units: Record<UnitType, UnitDefinition> = {
  swordsmen: swordsmenData as UnitDefinition,
  knight: {
    type: 'knight',
    shape: 'circle',
    health: 12,
  },
  crossbowsoldier: crossbowsoldierData as UnitDefinition,
};
