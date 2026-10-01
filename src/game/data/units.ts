import type { Shape } from '~/game/ecs/components';
import { CELLS_PER_TILE } from '~/lib/grid';
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
/** A width and height, in map tiles. */
export interface TileSize {
  width: number;
  height: number;
}

export interface UnitDefinition {
  type: UnitType;
  /**
   * How big the unit is drawn, in map tiles — taken from the typical visible
   * extent of the original sprite's idle and move frames, and rounded up to
   * whole half-tiles by {@link unitSizeInTiles}. Authored in tiles rather
   * than pixels so it scales with the map's tile size. It only sizes the
   * drawn unit: every unit still occupies a single movement cell.
   */
  size: TileSize;
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
  /** Movement speed in map tiles per second, converted to world units by `spawnUnit`. */
  movementSpeed?: number;
  /**
   * Attack reach. In map tiles for a projectile unit; for melee, `1` means
   * "an adjacent movement cell". Converted by `attackRangeInCells`.
   */
  range?: number;
  /** Detection/aggro range in map tiles, converted to cells by `spawnUnit`. */
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
  // move at 2 tiles/sec) and hits harder, but has less health — an elite
  // cavalry unit that closes distance fast and trades blows decisively
  // rather than grinding.
  knight: knightData as UnitDefinition,
  crossbowsoldier: crossbowsoldierData as UnitDefinition,
};

/**
 * Rounds a tile length up to a whole number of half-tiles (one movement cell
 * each), and never below one: a unit is always at least a cell in size.
 */
export function roundUpToHalfTiles(tiles: number): number {
  // Snapped first so float noise in an already-whole value (0.5000000001)
  // doesn't round a whole half-tile up to the next one.
  const cells = Math.ceil(Number((tiles * CELLS_PER_TILE).toFixed(6)));
  return Math.max(1, cells) / CELLS_PER_TILE;
}

/** A unit type's drawn size in tiles, rounded up to whole half-tiles. */
export function unitSizeInTiles(definition: Pick<UnitDefinition, 'size'>): TileSize {
  return {
    width: roundUpToHalfTiles(definition.size.width),
    height: roundUpToHalfTiles(definition.size.height),
  };
}
