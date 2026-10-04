import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Team } from '~/game/ecs/components';
import { snapToFootprint } from '~/game/navigation/footprint';
import { CELLS_PER_TILE, tilesToCells } from '~/lib/grid';
import type { Point } from '~/lib/math/types';
import {
  footprintOf,
  isProjectileUnitType,
  units,
  type UnitDefinition,
  type UnitType,
} from './units';

/** Per-team fill colour for a unit's shape, used by the (view-only) renderer. */
const TEAM_COLOR: Record<Team, number> = {
  blue: 0x66ccff,
  red: 0xff6b6b,
};

/**
 * How much smaller, in world units, a unit shape's rendered radius/half-extent
 * is than half of its footprint's world size (see `footprintOf`), so
 * neighbouring units stay visually distinct: on a 40px-tile map an infantry
 * unit (a single 20px cell) is drawn 16px across, a knight (its 2x2 block,
 * 40px) 36px — close to the visible extent of their original sprites. Its
 * selection marks and health bar (see `render-system.ts`, `health-bar.ts`)
 * are laid out against the full footprint box (`renderable.extent`), not
 * this shape size — as are a sprite unit's frames, which are fitted to that
 * box. Hit-testing still uses this shape size for every unit.
 */
const UNIT_MARGIN = 2;

/**
 * Map tiles per second a fired projectile (the crossbow
 * soldier's bolt, the catapult's rock) travels. Fast enough to visibly cross the map as a
 * "shot" rather than a crawl, while still taking a handful of ticks to reach
 * `attackRange` so the travel actually reads on screen.
 */
const PROJECTILE_SPEED_TILES = 10;

/**
 * A unit type's attack range in unit-placement cells. Ranged attacks are
 * authored in map tiles and scale with the grid, so a crossbow soldier
 * shoots from the same world distance however finely tiles are subdivided.
 * Melee is the exception: its `range` means "adjacent movement cell", so it
 * stays as authored.
 */
export function attackRangeInCells(definition: UnitDefinition): number | undefined {
  if (definition.range === undefined) {
    return undefined;
  }
  return definition.projectile ? tilesToCells(definition.range) : definition.range;
}

/** Auto-incrementing counter for entity IDs (for debugging/identification). */
let nextEntityId = 1;

/** Resets the entity ID counter (for testing). */
export function resetEntityIdCounter(): void {
  nextEntityId = 1;
}

/**
 * Hands out the next entity id from the same counter {@link spawnUnit} uses,
 * for callers elsewhere in the ECS that create standalone entities of their
 * own (currently just `fireProjectile`) and need an id that can't collide
 * with a spawned unit's.
 */
export function allocateEntityId(): number {
  return nextEntityId++;
}

export interface SpawnUnitOptions {
  type: UnitType;
  team: Team;
  position: Point;
}

/**
 * Adds a single unit entity to the world and returns it. Combines the static
 * per-type data ({@link units}) with the caller's placement into the ECS
 * component contract the renderer and future systems read.
 *
 * `position` is snapped to the centre of the block of cells the unit
 * occupies there (see `snapToFootprint`) — a cell centre for a 1x1 unit, and
 * the shared corner of its 2x2 block for a knight — so every unit, however
 * its caller computed its placement, rests exactly on its footprint rather
 * than wherever it happened to land. A stationary multi-cell unit always
 * fills whole cells; it is never centred on one cell with the rest of its
 * block hanging off it.
 *
 * `cellSize` is the world size of that grid's cells — a fraction of the
 * loaded map's tile size (see `cellSizeOf`). Unit data is authored in map
 * tiles, and this is the one place it's converted: movement and projectile
 * speed to world units per second, attack/aggro range to cells (see
 * {@link attackRangeInCells}), and the unit's footprint (see `footprintOf`
 * in `./units`) to the drawn shape's size and the box its overlays are laid
 * out against — so the rendered box always matches the cells the unit
 * actually reserves (`CellOccupancySystem`), making multi-cell occupancy
 * visible and debuggable rather than a one-cell dot.
 *
 * @throws {Error} for a projectile type such as `'bolt'` or `'rock'` (see
 * `PROJECTILE_UNIT_TYPES`): a projectile is never a unit, it only ever
 * exists as what `fireProjectile` fires.
 */
export function spawnUnit(
  world: World<Entity>,
  { type, team, position }: SpawnUnitOptions,
  cellSize: number
): Entity {
  if (isProjectileUnitType(type)) {
    throw new Error(
      `Cannot spawn "${type}" as a unit: it is a projectile, which only exists once fired`
    );
  }
  const definition = units[type];
  const tileSize = cellSize * CELLS_PER_TILE;
  const footprint = footprintOf(definition);
  const extent = (Math.max(footprint.width, footprint.height) * cellSize) / 2;
  const cellCenter = snapToFootprint(position, footprint, cellSize);

  const entity: Entity = {
    id: nextEntityId++,
    transform: { position: { x: cellCenter.x, y: cellCenter.y }, rotation: 0 },
    renderable: {
      shape: definition.shape,
      color: TEAM_COLOR[team],
      size: extent - UNIT_MARGIN,
      extent,
    },
    team,
    unitType: type,
    health: { current: definition.health, max: definition.health },
    hoverable: true,
    velocity: { x: 0, y: 0 },
  };
  if (footprint.width > 1 || footprint.height > 1) {
    entity.footprint = footprint;
  }
  // A unit type whose definition carries no combat stats gets none of the
  // components below and simply can't acquire a target (PerceptionSystem),
  // or land an attack (CombatSystem, which needs all three of
  // `attackRange`, `damage` and `attackCooldown` to schedule one); it can
  // still be targeted and killed by others via `queries.combatants`.
  const attackRange = attackRangeInCells(definition);
  if (attackRange !== undefined) {
    entity.attackRange = { value: attackRange };
  }
  if (definition.aggroRange !== undefined) {
    entity.aggroRange = { value: tilesToCells(definition.aggroRange) };
  }
  if (definition.attackDamage !== undefined) {
    entity.damage = { value: definition.attackDamage };
  }
  if (definition.attackCooldown !== undefined) {
    entity.attackCooldown = { duration: definition.attackCooldown };
  }
  if (definition.movementSpeed !== undefined) {
    entity.moveSpeed = { value: definition.movementSpeed * tileSize };
  }
  // Marks this unit type's attacks as fired projectiles rather than instant
  // melee damage — read by `CombatSystem` to fire a travelling `Projectile`
  // (`fireProjectile`) instead of applying damage directly. The crossbow
  // soldier fires bolts and the catapult rocks.
  if (definition.projectile) {
    entity.ranged = {
      projectileSpeed: PROJECTILE_SPEED_TILES * tileSize,
      projectile: definition.projectile,
      releaseTime: definition.attackReleaseTime ?? 0,
    };
  }
  // Only the player's own (blue) units can be click-selected; red is the
  // opposing side and has no `selectable` component at all — a query for
  // it (as the click hit-test and RenderSystem's selection marks use) must
  // never match a red unit, which a `selectable: false` value would not
  // achieve, since miniplex's `world.with('selectable')` matches on the
  // component's presence, not its value.
  if (team === 'blue') {
    entity.selectable = true;
  }

  return world.add(entity);
}

/**
 * A world-space point inside grid cell (`col`, `row`) — its top-left corner,
 * which {@link spawnUnit} snaps to the cell's centre — on a grid of
 * `cellSize` world units per cell.
 */
export function cellPosition(col: number, row: number, cellSize: number): Point {
  return { x: col * cellSize, y: row * cellSize };
}
