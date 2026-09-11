import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { applyMoveOrder } from '~/game/navigation/move-order';

/**
 * Applies a `PendingMoveOrder` staged by `moveSelectedTo` once the unit it
 * belongs to is no longer mid-transition (`MoveTarget` absent — either it
 * just arrived at its current transition's destination cell, or it was
 * already idle).
 *
 * Movement is only ever an atomic cell-to-cell step in one of the 8 allowed
 * directions (#178): a new order arriving while `MoveTarget` is still set
 * must never redirect the unit mid-step, so `moveSelectedTo` stages it here
 * instead of applying it directly. Must run before `MovePathSystem` so a
 * staged multi-leg order's first waypoint is fed into `MoveTarget` within
 * the same tick it's applied, exactly like an ordinary leg-to-leg handoff.
 */
export function createPendingMoveOrderSystem(queries: Queries): System {
  return () => {
    for (const self of queries.movable) {
      const pending = self.pendingMoveOrder;
      if (!pending || self.moveTarget) {
        continue;
      }

      delete self.pendingMoveOrder;
      applyMoveOrder(self, pending);
    }
  };
}
