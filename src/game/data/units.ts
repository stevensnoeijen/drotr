import type { Footprint, Shape } from '~/game/ecs/components';
import { CELLS_PER_TILE } from '~/lib/grid';
import swordsmenData from './units/swordsmen.json';
import crossbowsoldierData from './units/crossbowsoldier.json';
import knightData from './units/knight.json';
import juggernautData from './units/juggernaut.json';
import catapultData from './units/catapult.json';
import cannonData from './units/cannon.json';
import boltData from './units/bolt.json';
import rockData from './units/rock.json';

/**
 * The kinds of unit in the game. Names and starting HP match
 * `public/assets/entity-definitions.json` (the original game's unit roster),
 * so `unitType` stays stable as real sprites replace these primitives in
 * the asset-integration phase (see `SPRITE_UNIT_TYPES` for which units
 * already have).
 *
 * The roster also holds the projectiles (see {@link PROJECTILE_UNIT_TYPES}),
 * which are not units: they are listed here only so their sprites go through
 * the unit sprite pipeline (frame map, shared atlas, manifest) like any
 * unit's. They are never spawned as units.
 */
export const UNIT_TYPES = ['swordsmen', 'knight', 'crossbowsoldier', 'juggernaut', 'catapult', 'cannon', 'bolt', 'rock'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/**
 * The {@link UNIT_TYPES} that are fired projectiles rather than units: a
 * crossbow's bolt or a catapult's rock. One only ever exists as a fired `Projectile` entity (see
 * `fireProjectile`), which has no `unitType`; `spawnUnit` refuses them.
 */
export const PROJECTILE_UNIT_TYPES = ['bolt', 'rock'] as const satisfies readonly UnitType[];
export type ProjectileUnitType = (typeof PROJECTILE_UNIT_TYPES)[number];

/** Whether `type` is a projectile (see {@link PROJECTILE_UNIT_TYPES}), not a unit. */
export function isProjectileUnitType(type: UnitType): type is ProjectileUnitType {
  return (PROJECTILE_UNIT_TYPES as readonly UnitType[]).includes(type);
}

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
   * The unit's visible extent in map tiles, as measured from the typical
   * extent of the original sprite's idle and move frames, and rounded up to
   * whole half-tiles by {@link unitSizeInTiles}. Authored in tiles rather
   * than pixels so it scales with the map's tile size. Descriptive only —
   * `spawnUnit` sizes the drawn shape and overlays from {@link footprint}
   * instead (cells convert to world units more directly than tiles do), so
   * keeping this consistent with `footprint` (the knight's `size` of one
   * tile matches its 2x2 cells exactly) is an authoring convention, not
   * something this capability enforces for itself.
   */
  size: TileSize;
  /**
   * How many unit-placement cells this unit occupies, as a `width` x
   * `height` rectangle — axis-aligned and fixed, not rotated with facing.
   * Optional, defaulting to one cell (`footprintOf`'s default) so every
   * unit JSON that doesn't set it stays valid and unchanged. The knight is
   * the only unit type that sets it so far: a 2x2 block of half-tile cells,
   * matching its full-tile `size`. This is what `spawnUnit` reserves on the
   * occupancy grid *and* sizes the drawn shape from, so the rendered box
   * always matches the cells the unit actually holds.
   */
  footprint?: Footprint;
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
   * The projectile this unit type fights with, rather than instant melee
   * damage — `spawnUnit` copies it to `Ranged.projectile`, and
   * `CombatSystem` fires a travelling `Projectile` of this type via
   * `fireProjectile` once a swing lands. `crossbowsoldier` fires bolts and
   * `catapult` rocks; omitted for melee units.
   */
  projectile?: ProjectileUnitType;
  /**
   * Seconds into the attack swing at which a projectile unit looses its
   * shot, matching the attack animation's release frame (`hitFrame / fps`
   * in its sprite manifest). Absent or 0 fires as the swing starts.
   */
  attackReleaseTime?: number;
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
  // A battering ram with its crew. Only the minimum for now (type, size,
  // shape, health) so `#/unit-preview` can list its atlas sprites: combat
  // stats, a footprint and in-game sprites land in #182.
  juggernaut: juggernautData as UnitDefinition,
  // A siege catapult. Only the minimum for now (type, size, shape, health) so
  // `#/unit-preview` can list its atlas sprites: combat stats, in-game
  // sprites and scenarios land in #183.
  catapult: catapultData as UnitDefinition,
  // A field cannon, a static emplacement. Only the minimum for now (type,
  // size, shape, health) so `#/unit-preview` can list its atlas sprites:
  // combat stats, in-game sprites and scenarios land in #184.
  cannon: cannonData as UnitDefinition,
  // A crossbow bolt: a projectile, not a unit (see `PROJECTILE_UNIT_TYPES`).
  // Only the minimum the type requires: one cell in size, no combat stats,
  // and a placeholder health, since a bolt is never spawned as a unit.
  bolt: boltData as UnitDefinition,
  // A catapult's rock: a projectile like the bolt, with the same minimal data.
  rock: rockData as UnitDefinition,
};

/** Every unit not given an explicit `footprint` occupies exactly one cell. */
const DEFAULT_FOOTPRINT: Footprint = { width: 1, height: 1 };

/**
 * A unit type's footprint, in unit-placement cells: {@link DEFAULT_FOOTPRINT}
 * unless its definition says otherwise. The single accessor every call site
 * reads a definition's footprint through, so none of them repeats the
 * `?? { width: 1, height: 1 }` default itself.
 */
export function footprintOf(definition: Pick<UnitDefinition, 'footprint'>): Footprint {
  return definition.footprint ?? DEFAULT_FOOTPRINT;
}

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

/**
 * A unit type's visible size in tiles, rounded up to whole half-tiles —
 * descriptive (see {@link UnitDefinition.size}), not read by `spawnUnit` for
 * the drawn shape itself, which sizes from {@link footprintOf} instead.
 */
export function unitSizeInTiles(
  definition: Pick<UnitDefinition, 'size'>
): TileSize {
  return {
    width: roundUpToHalfTiles(definition.size.width),
    height: roundUpToHalfTiles(definition.size.height),
  };
}
