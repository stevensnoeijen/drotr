import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { applyMoveOrder, planMoveOrder } from '~/game/navigation/move-order';
import type { GridLike } from '~/lib/navigation/astar';
import { CELL_SIZE } from '~/lib/grid';

/**
 * Applies a `PendingMoveOrder` staged by `moveSelectedTo` once the unit it
 * belongs to is no longer mid-transition (`MoveTarget` absent — either it
 * just arrived at its current transition's destination cell, or it was
 * already idle).
 *
 * The order is planned here, not when it was staged: `moveSelectedTo` only
 * records the *destination*, because the unit's position at staging time is
 * still interpolating mid-cell and would round to the wrong starting cell
 * (see `PendingMoveOrder`). Planning now, from `self.transform.position` as
 * it stands once the in-flight step has actually finished, is what makes
 * the route start from the cell the unit really ends up in.
 *
 * Movement is only ever an atomic cell-to-cell step in one of the 8 allowed
 * directions: a new order arriving while `MoveTarget` is still set
 * must never redirect the unit mid-step, so `moveSelectedTo` stages it here
 * instead of applying it directly. Must run before `MovePathSystem` so a
 * staged multi-leg order's first waypoint is fed into `MoveTarget` within
 * the same tick it's applied, exactly like an ordinary leg-to-leg handoff.
 *
 * `grid` is the loaded map's collision data — the same one passed to
 * `createInputSystem` — used to route a staged order around terrain; omit
 * it for a map with no terrain, matching `moveSelectedTo`'s own fallback to
 * a straight line.
 */
export function createPendingMoveOrderSystem(
  queries: Queries,
  grid?: GridLike
): System {
  return () => {
    for (const self of queries.movable) {
      const pending = self.pendingMoveOrder;
      if (!pending || self.moveTarget) {
        continue;
      }

      delete self.pendingMoveOrder;
      applyMoveOrder(
        self,
        planMoveOrder(grid, self.transform.position, pending.destination, CELL_SIZE)
      );
    }
  };
}
