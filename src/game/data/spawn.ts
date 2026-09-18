import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Team } from '~/game/ecs/components';
import { CELL_SIZE, toWorldPositionCellCenter } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import type { Point } from '~/lib/math/types';
import { units, type UnitType } from './units';

/** Per-team fill colour for a unit's shape, used by the (view-only) renderer. */
const TEAM_COLOR: Record<Team, number> = {
  blue: 0x66ccff,
  red: 0xff6b6b,
};

/**
 * Rendered radius/half-extent of a unit shape, in world units — 3px
 * smaller than half of the {@link file://../../lib/grid.ts#CELL_SIZE}
 * (32px) grid cell it's centered in, so the shape fits inside the cell
 * with a small margin on every side. Its selection marks and health bar
 * (see `render-system.ts`, `health-bar.ts`) are positioned against the
 * cell's own edges rather than this shape size, so they stay pinned to
 * the cell regardless of how big the shape is. This is
 * placeholder-primitive sizing (one size for every type); real unit
 * sprites vary (32x32 to 64x64) and per-type sizing is asset-integration
 * work (phase 6), not this constant.
 */
const UNIT_SIZE = 13;

/**
 * Colour of a crossbow unit's dropped projectile visual (#161) — purple,
 * independent of team, since it's a piece of equipment, not a combatant.
 */
const PROJECTILE_COLOR = 0x9b59b6;

/**
 * Half-length, in world units, of a dropped projectile stripe — smaller
 * than {@link UNIT_SIZE} so it reads as a shaft lying on the ground rather
 * than another unit-sized shape.
 */
const PROJECTILE_SIZE = 8;

/** Auto-incrementing counter for entity IDs (for debugging/identification). */
let nextEntityId = 1;

/** Resets the entity ID counter (for testing). */
export function resetEntityIdCounter(): void {
  nextEntityId = 1;
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
 */
export function spawnUnit(
  world: World<Entity>,
  { type, team, position }: SpawnUnitOptions
): Entity {
  const definition = units[type];
  const cellCenter = toWorldPositionCellCenter(new Vector2(position.x, position.y));

  const entity: Entity = {
    id: nextEntityId++,
    transform: { position: { x: cellCenter.x, y: cellCenter.y }, rotation: 0 },
    renderable: {
      shape: definition.shape,
      color: TEAM_COLOR[team],
      size: UNIT_SIZE,
    },
    team,
    unitType: type,
    health: { current: definition.health, max: definition.health },
    hoverable: true,
    velocity: { x: 0, y: 0 },
  };
  // Placeholder units without a finished combat kit (currently just
  // `knight`) carry no combat stats at all, so they get none of the
  // components below and simply can't acquire a
  // target (PerceptionSystem), or land an attack (CombatSystem, which needs
  // all three of `attackRange`, `damage` and `attackCooldown` to schedule
  // one); they can still be targeted and killed by others via
  // `queries.combatants`.
  if (definition.range !== undefined) {
    entity.attackRange = { value: definition.range };
  }
  if (definition.aggroRange !== undefined) {
    entity.aggroRange = { value: definition.aggroRange };
  }
  if (definition.attackDamage !== undefined) {
    entity.damage = { value: definition.attackDamage };
  }
  if (definition.attackCooldown !== undefined) {
    entity.attackCooldown = { duration: definition.attackCooldown };
  }
  if (definition.movementSpeed !== undefined) {
    entity.moveSpeed = { value: definition.movementSpeed * CELL_SIZE };
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

  const spawned = world.add(entity);

  // Static visual prep for #97's real projectile entity (#161): a purple
  // stripe dropped on the map at the unit's own spawn location — a standalone
  // entity, not attached to or following the unit, so moving the unit
  // afterwards leaves the projectile behind. No velocity, targeting or
  // damage — it never fires or travels on its own.
  if (definition.projectile) {
    world.add({
      id: nextEntityId++,
      transform: { position: { x: cellCenter.x, y: cellCenter.y }, rotation: 0 },
      renderable: {
        shape: 'stripe',
        color: PROJECTILE_COLOR,
        size: PROJECTILE_SIZE,
      },
    });
  }

  return spawned;
}

/** World-space position of the center of grid cell (`col`, `row`). */
export function cellPosition(col: number, row: number): Point {
  return { x: col * CELL_SIZE, y: row * CELL_SIZE };
}
