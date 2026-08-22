import type { World } from 'miniplex';

import type { Entity, Team } from '~/game/ecs/types';
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

export interface SpawnUnitOptions {
  type: UnitType;
  team: Team;
  position: Point;
}

/**
 * Adds a single unit entity to the world and returns it. Combines the static
 * per-type data ({@link units}) with the caller's placement into the ECS
 * component contract the renderer and future systems read.
 */
export function spawnUnit(
  world: World<Entity>,
  { type, team, position }: SpawnUnitOptions
): Entity {
  const definition = units[type];

  return world.add({
    transform: { position: { ...position }, rotation: 0 },
    renderable: {
      shape: definition.shape,
      color: TEAM_COLOR[team],
      size: UNIT_SIZE,
    },
    selectable: true,
    team,
    unitType: type,
    health: { current: definition.health, max: definition.health },
  });
}

/**
 * Seeds the world with a small starting group of units so there is something to
 * see on screen: a blue line facing a red line. Temporary content for the
 * primitive-foundations phase, to be replaced once maps and spawn points land.
 */
export function spawnInitialUnits(world: World<Entity>): void {
  const spacing = 48;
  const count = 4;

  for (let i = 0; i < count; i++) {
    const y = 120 + i * spacing;
    spawnUnit(world, { type: 'swordsmen', team: 'blue', position: { x: 120, y } });
    spawnUnit(world, { type: 'swordsmen', team: 'red', position: { x: 360, y } });
  }
}
