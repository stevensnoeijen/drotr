import type { World } from 'miniplex';

import { spawnUnit } from '~/game/data/spawn';
import type { UnitType } from '~/game/data/units';
import type { Entity, Team } from '~/game/ecs/entity';
import { CELL_SIZE } from '~/lib/grid';
import type { SpawnPoint } from '~/game/map/loadTiledMap';

/**
 * Gap, in world units, between adjacent units claiming the same spawn point —
 * one grid cell, so each unit's placement snaps to a distinct cell instead
 * of landing in (or straddling) the same one as its neighbour.
 */
const SPACING = CELL_SIZE;

export interface ClaimSpawnOptions {
  team: Team;
  /** One entry per unit to place at this spawn point; a spawn has no unit
   * type of its own, so the caller decides the composition, including
   * spawning several units — of any mix of types — on a single point. */
  units: readonly UnitType[];
}

/** Evenly spaced x-offsets, centered on 0, for `count` units in a row. */
function layoutOffsets(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * SPACING);
}

/**
 * Claims a named spawn point for a team, spawning one unit per entry in
 * `units`. A spawn point is just a location — claiming it decides who owns
 * it and what appears there; multiple units claiming the same point are laid
 * out in a row around it so they don't overlap.
 */
export function claimSpawn(
  world: World<Entity>,
  spawns: readonly SpawnPoint[],
  spawnId: string,
  { team, units }: ClaimSpawnOptions
): Entity[] {
  const spawn = spawns.find((candidate) => candidate.id === spawnId);
  if (!spawn) {
    throw new Error(`No spawn point named "${spawnId}"`);
  }

  const offsets = layoutOffsets(units.length);
  return units.map((unitType, i) =>
    spawnUnit(world, {
      type: unitType,
      team,
      position: { x: spawn.position.x + offsets[i], y: spawn.position.y },
    })
  );
}
