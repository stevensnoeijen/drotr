import type { Point } from '~/lib/math/types';

/**
 * A move order issued while the unit was mid-transition between two grid
 * cells, staged here instead of taking effect immediately.
 *
 * Movement is only ever an atomic step from one cell to an adjacent one in
 * one of the 8 allowed directions (see #178); redirecting a unit the moment
 * a new order arrives would let it change direction mid-cell, breaking that
 * guarantee. `~/game/systems/pending-move-order-system` applies this once
 * `MoveTarget` clears — i.e. once the in-flight transition actually
 * finishes — rather than the tick the order was issued.
 *
 * Deliberately holds just the `destination`, not a baked `MoveOrderResult`:
 * `entity.transform.position` at click time is still interpolating between
 * the cell the unit is leaving and the one it's mid-transition toward, so
 * planning a route from it right away can round to the *wrong* starting
 * cell — the one being left, not the one the unit will actually be
 * standing in once this order is applied. Routing is deferred to
 * `PendingMoveOrderSystem`, which plans from the unit's position *then*
 * (settled at the arrival cell, within `ARRIVAL_TOLERANCE`).
 */
export interface PendingMoveOrder {
  destination: Point;
}
