import type { World } from 'miniplex';

import type { Entity, Team } from '~/game/ecs/types';
import { CELL_SIZE, toWorldPositionCellCenter } from '~/lib/grid';
import { Vector2 } from '~/lib/math/Vector2';
import type { Point } from '~/lib/math/types';
import { units, type UnitType } from './units';

/** Per-team fill colour for a unit's shape, used by the (view-only) renderer. */
const TEAM_COLOR: Record<Team, number> = {
  blue: 0x66ccff,
  red: 0xff6b6b,
};

/**
 * Rendered radius/half-extent of a unit shape, in world units — half of the
 * 40x40px footprint units are drawn at, centered within a
 * {@link file://../../lib/grid.ts#CELL_SIZE} (64px) grid cell.
 */
export const UNIT_SIZE = 20;

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
  };
  // Legacy inline units (currently just `knight`) carry neither `range` nor
  // `aggroRange`, so they get no `attackRange`/`aggroRange` component and
  // simply can't acquire or be scanned as an attacker by PerceptionSystem;
  // they can still be targeted by others via `queries.combatants`.
  if (definition.range !== undefined) {
    entity.attackRange = { value: definition.range };
  }
  if (definition.aggroRange !== undefined) {
    entity.aggroRange = { value: definition.aggroRange };
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

/** World-space position of the center of grid cell (`col`, `row`). */
export function cellPosition(col: number, row: number): Point {
  return { x: col * CELL_SIZE, y: row * CELL_SIZE };
}
