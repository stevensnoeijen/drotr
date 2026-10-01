import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Team } from '~/game/ecs/components';
import { CELLS_PER_TILE, tilesToCells, toWorldPositionCellCenter } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import type { Point } from '~/lib/math/types';
import { unitSizeInTiles, units, type UnitDefinition, type UnitType } from './units';

/** Per-team fill colour for a unit's shape, used by the (view-only) renderer. */
const TEAM_COLOR: Record<Team, number> = {
  blue: 0x66ccff,
  red: 0xff6b6b,
};

/**
 * How much smaller, in world units, a unit shape's rendered radius/half-extent
 * is than half of its unit-type size (see `unitSizeInTiles`), so neighbouring
 * units stay visually distinct: on a 40px-tile map an infantry unit (half a
 * tile) is drawn 16px across, a knight (a full tile) 36px — close to the
 * visible extent of their original sprites. Its selection marks and health
 * bar (see `render-system.ts`, `health-bar.ts`) are laid out against the
 * full unit-type size (`renderable.extent`), not this shape size.
 */
const UNIT_MARGIN = 2;

/**
 * Map tiles per second a fired projectile (currently just the crossbow
 * soldier's bolt) travels. Fast enough to visibly cross the map as a
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
 * `position` is snapped to the center of whichever grid cell it falls in
 * (see {@link toWorldPositionCellCenter}), so every unit — however its
 * caller computed its placement — renders centered in a cell rather than
 * wherever it happened to land.
 *
 * `cellSize` is the world size of that grid's cells — a fraction of the
 * loaded map's tile size (see `cellSizeOf`). Unit data is authored in map
 * tiles, and this is the one place it's converted: movement and projectile
 * speed to world units per second, attack/aggro range to cells (see
 * {@link attackRangeInCells}), which the systems then read as-is, and the
 * unit-type size (see `unitSizeInTiles`) to the drawn shape's size and the
 * box its overlays are laid out against. However big it is drawn, the unit
 * occupies the single cell it is centred in.
 */
export function spawnUnit(
  world: World<Entity>,
  { type, team, position }: SpawnUnitOptions,
  cellSize: number
): Entity {
  const definition = units[type];
  const tileSize = cellSize * CELLS_PER_TILE;
  const sizeInTiles = unitSizeInTiles(definition);
  const extent = (Math.max(sizeInTiles.width, sizeInTiles.height) * tileSize) / 2;
  const cellCenter = toWorldPositionCellCenter(new Vector2(position.x, position.y), cellSize);

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
  // (`fireProjectile`) instead of applying damage directly.
  if (definition.projectile) {
    entity.ranged = { projectileSpeed: PROJECTILE_SPEED_TILES * tileSize };
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
