import type { Shape } from '~/game/ecs/components';
import swordsmenData from './units/swordsmen.json';
import crossbowsoldierData from './units/crossbowsoldier.json';
import knightData from './units/knight.json';

/**
 * The kinds of unit in the game. Names and starting HP match
 * `public/assets/entity-definitions.json` (the original game's unit roster),
 * so `unitType` stays stable once real sprites replace these primitives in
 * the asset-integration phase.
 */
export type UnitType = 'swordsmen' | 'knight' | 'crossbowsoldier';

/**
 * Static, per-type unit data. Core fields (type, shape, health) are present
 * on all units. Combat stats (attackDamage, attackCooldown, accuracy, defence,
 * stamina, speed, range, aggroRange) are present on every JSON-defined unit
 * (swordsmen, crossbowsoldier, knight); a future unit type may still omit
 * them the way knight once did, which is why they stay optional here.
 */
export interface UnitDefinition {
  type: UnitType;
  shape: Shape;
  health: number;
  attackDamage?: number;
  /**
   * Seconds between two consecutive attacks — the gate `CombatSystem` runs
   * every attack through, so a unit's sustained damage output is
   * `attackDamage / attackCooldown` per second rather than `attackDamage` per
   * tick. See {@link file://../ecs/components/attack-cooldown.ts#AttackCooldown}.
   */
  attackCooldown?: number;
  accuracy?: number;
  defence?: number;
  stamina?: number;
  speed?: number;
  /** Movement speed in grid cells per second — see {@link file://../ecs/types.ts#MoveSpeed}. */
  movementSpeed?: number;
  range?: number;
  /** Detection/aggro range in grid cells — see {@link file://../ecs/types.ts#AggroRange}. */
  aggroRange?: number;
  /**
   * Whether this unit type fights with a fired projectile rather than
   * instant melee damage — read by `CombatSystem` to fire a travelling
   * `Projectile` via `fireProjectile` once a swing lands. `crossbowsoldier`
   * is the only unit that sets this so far.
   */
  projectile?: boolean;
  assets?: unknown;
}

/** All unit definitions, keyed by {@link UnitType}. */
export const units: Record<UnitType, UnitDefinition> = {
  swordsmen: swordsmenData as UnitDefinition,
  // Mounted, so faster than the infantry (swordsmen and crossbowsoldier both
  // move at 2 cells/sec) and hits harder, but has less health — an elite
  // cavalry unit that closes distance fast and trades blows decisively
  // rather than grinding.
  knight: knightData as UnitDefinition,
  crossbowsoldier: crossbowsoldierData as UnitDefinition,
};
