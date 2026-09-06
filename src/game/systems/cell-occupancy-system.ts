import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { NO_CELL, type OccupancyGrid } from '~/game/navigation/occupancy-grid';

/**
 * How long, in seconds, a unit will stand and wait for the cell ahead of it
 * to clear before abandoning its order.
 *
 * Waiting is the right first response — a unit held up by a neighbour
 * walking the same corridor gets going again as soon as that neighbour moves
 * on, and resetting `blockedFor` on every successful step means only
 * *sustained* blockage counts toward this. But a unit ordered into a cell
 * that a stationary unit is standing in would otherwise shuffle against it
 * forever, so the wait is bounded: give up, stop where you are, and leave
 * the player to issue a better order.
 */
export const BLOCKED_GIVE_UP_SECONDS = 2;

/**
 * Unit-to-unit collision, enforced as cell occupancy over the map's terrain
 * collision grid (see {@link OccupancyGrid}).
 *
 * Runs **after** every system that writes `Velocity` (`SeekSystem`,
 * `MoveTargetSystem`) and **before** `MoveVelocitySystem` integrates it.
 * That single seam is what makes this the one place unit collision is
 * decided: whatever aimed a unit somewhere, the step that would carry it
 * into an occupied cell is vetoed here, before it ever happens — units never
 * overlap and then get pushed apart.
 *
 * Per unit, per tick:
 *
 * 1. Reconcile the claim with where the unit actually stands. Arriving in
 *    the cell it reserved releases the origin cell it was straddling; being
 *    somewhere else entirely (a fresh unit, or a position set by something
 *    other than movement) re-claims from scratch.
 * 2. A unit at rest holds exactly one cell, so a stale reservation ahead of
 *    a stopped unit is released rather than left pinned.
 * 3. A unit under way looks one integration step ahead. Staying inside a
 *    cell it already holds needs no permission. Crossing into a new one
 *    reserves it first — and if that cell is held by another unit, blocked
 *    by terrain, or off the map, the step is refused: velocity is zeroed for
 *    the tick, so `MoveVelocitySystem` integrates nothing and the unit holds
 *    position instead of clipping through.
 *
 * Order of operations matters and is deliberate: release-on-arrival happens
 * before any new reservation, so a unit never briefly holds three cells; and
 * the reservation is taken *before* the move rather than validated after it,
 * so two units stepping toward the same cell on the same tick resolve
 * deterministically — the first one the iteration reaches gets the cell, the
 * second sees it taken and waits. No tick ever ends with two units in one
 * cell.
 *
 * Dead units vacate their cells: a corpse is not an obstacle, and releasing
 * here means no cell can be left permanently claimed by something that will
 * never move again.
 */
export function createCellOccupancySystem(queries: Queries, grid: OccupancyGrid): System {
  return (_world: World<Entity>, dt: number) => {
    for (const self of queries.moving) {
      const { transform, velocity } = self;

      if (self.health && self.health.current <= 0) {
        const dead = self.cellOccupancy;
        if (dead) {
          grid.release(dead.cell, dead.occupantId);
          grid.release(dead.reserved, dead.occupantId);
          delete self.cellOccupancy;
        }
        continue;
      }

      const current = grid.indexAt(transform.position);

      let occupancy = self.cellOccupancy;
      if (!occupancy) {
        occupancy = {
          occupantId: grid.claimOccupantId(),
          cell: NO_CELL,
          reserved: NO_CELL,
          blockedFor: 0,
        };
        self.cellOccupancy = occupancy;
      }

      if (occupancy.cell !== current) {
        if (current === occupancy.reserved) {
          // Arrived: the destination was already reserved on the way in, so
          // all that's left is to stop straddling the origin cell.
          grid.release(occupancy.cell, occupancy.occupantId);
          occupancy.cell = current;
          occupancy.reserved = NO_CELL;
        } else {
          // Somewhere unexpected — a unit seen for the first time, or one
          // repositioned by something other than integration. Drop whatever
          // it held and claim where it actually is. The claim can be refused
          // (two units spawned into one cell); the unit is still tracked, it
          // just doesn't own the cell it shares, and `release` will never let
          // it evict the unit that does.
          grid.release(occupancy.cell, occupancy.occupantId);
          grid.release(occupancy.reserved, occupancy.occupantId);
          occupancy.reserved = NO_CELL;
          occupancy.cell = current;
          grid.reserve(current, occupancy.occupantId);
        }
      }

      const moving = velocity.x !== 0 || velocity.y !== 0;

      // Where this tick's step would put the unit — its own cell when it
      // isn't going anywhere. Asked by coordinate rather than by point so the
      // lookahead costs no allocation per unit per tick.
      const next = moving
        ? grid.indexAtWorld(
            transform.position.x + velocity.x * dt,
            transform.position.y + velocity.y * dt
          )
        : occupancy.cell;

      // A unit standing in `cell` occupies exactly that one cell; the second
      // claim is only legitimate while it is actually committed to crossing.
      // So a unit that stopped, turned back, or was redirected hands its
      // reservation straight back rather than pinning a cell it will never
      // enter.
      if (next !== occupancy.reserved && occupancy.reserved !== NO_CELL) {
        grid.release(occupancy.reserved, occupancy.occupantId);
        occupancy.reserved = NO_CELL;
      }

      if (!moving) {
        occupancy.blockedFor = 0;
        continue;
      }

      // `NO_CELL` is checked explicitly rather than left to the comparisons
      // below: it doubles as `reserved`'s "nothing reserved" sentinel, so a
      // step off the edge of the map would otherwise compare equal to it and
      // read as ground the unit already holds.
      const entersNewCell =
        next === NO_CELL || (next !== occupancy.cell && next !== occupancy.reserved);

      if (!entersNewCell) {
        // Still inside ground this unit already holds.
        occupancy.blockedFor = 0;
        continue;
      }

      if (grid.isAvailableFor(next, occupancy.occupantId)) {
        grid.reserve(next, occupancy.occupantId);
        occupancy.reserved = next;
        occupancy.blockedFor = 0;
        continue;
      }

      // Blocked. Hold position for this tick; whatever set the velocity will
      // set it again next tick, and the unit gets going the moment the cell
      // clears.
      velocity.x = 0;
      velocity.y = 0;
      occupancy.blockedFor += dt;

      if (occupancy.blockedFor >= BLOCKED_GIVE_UP_SECONDS) {
        delete self.moveTarget;
        delete self.movePath;
        occupancy.blockedFor = 0;
      }
    }
  };
}
