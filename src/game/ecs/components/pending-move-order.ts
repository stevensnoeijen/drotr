import type { StagedMoveOrder } from '~/game/navigation/move-order';

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
 */
export type PendingMoveOrder = StagedMoveOrder;
