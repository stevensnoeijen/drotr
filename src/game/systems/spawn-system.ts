import type { World } from 'miniplex';

import { spawnUnit } from '~/game/data/spawn';
import { footprintOf, units as unitDefinitions, type UnitType } from '~/game/data/units';
import type { Entity } from '~/game/ecs/entity';
import type { Team } from '~/game/ecs/components';
import type { SpawnPoint } from '~/game/map/load-tiled-map';

export interface ClaimSpawnOptions {
  team: Team;
  /** One entry per unit to place at this spawn point; a spawn has no unit
   * type of its own, so the caller decides the composition, including
   * spawning several units — of any mix of types — on a single point. */
  units: readonly UnitType[];
}

/**
 * X-offsets, centred on 0, for a row of units whose footprints are `widths`
 * cells wide. Each unit is centred on its own stretch of the row — `widths`
 * cells end to end, in order — so neighbours' blocks sit side by side
 * instead of landing in (or straddling) each other's cells: every unit a
 * single cell wide comes out exactly one cell apart from the next (the
 * previous, uniform behaviour), and a wider footprint such as the knight's
 * 2x2 block claims two cells' worth of the row instead of being packed as
 * tightly as its 1x1 neighbours.
 */
function layoutOffsets(widths: readonly number[], cellSize: number): number[] {
  const total = widths.reduce((sum, width) => sum + width, 0);
  let start = -total / 2;
  return widths.map((width) => {
    const offset = (start + width / 2) * cellSize;
    start += width;
    return offset;
  });
}

/**
 * Claims a named spawn point for a team, spawning one unit per entry in
 * `units`. A spawn point is just a location — claiming it decides who owns
 * it and what appears there; multiple units claiming the same point are laid
 * out in a row around it so they don't overlap.
 *
 * `cellSize` is the world size of the map's grid cells (see `cellSizeOf`).
 */
export function claimSpawn(
  world: World<Entity>,
  spawns: readonly SpawnPoint[],
  spawnId: string,
  { team, units }: ClaimSpawnOptions,
  cellSize: number
): Entity[] {
  const spawn = spawns.find((candidate) => candidate.id === spawnId);
  if (!spawn) {
    throw new Error(`No spawn point named "${spawnId}"`);
  }

  const offsets = layoutOffsets(
    units.map((type) => footprintOf(unitDefinitions[type]).width),
    cellSize
  );
  return units.map((unitType, i) =>
    spawnUnit(
      world,
      {
        type: unitType,
        team,
        position: { x: spawn.position.x + offsets[i], y: spawn.position.y },
      },
      cellSize
    )
  );
}
