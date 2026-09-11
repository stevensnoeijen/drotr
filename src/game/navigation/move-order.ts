import type { Entity } from '~/game/ecs/entity';
import type { MovePath } from '~/game/ecs/components/move-path';
import type { MoveTarget } from '~/game/ecs/components/move-target';

/**
 * The outcome of planning a single unit's move order (see
 * `moveSelectedTo` in `~/game/systems/input-system`), independent of
 * *when* it gets applied to the entity:
 *
 * - `'none'` — the order couldn't be planned for this unit (no free cell,
 *   unreachable destination) and must be dropped rather than applied.
 * - `'stop'` — the order resolved to the cell the unit is already standing
 *   in: come to rest rather than carry on with whatever it was doing.
 * - `'target'` — walk straight at a point (no collision grid to route
 *   through).
 * - `'path'` — walk a routed multi-leg path.
 */
export type MoveOrderResult =
  | { kind: 'none' }
  | { kind: 'stop' }
  | { kind: 'target'; moveTarget: MoveTarget }
  | { kind: 'path'; movePath: MovePath };

/**
 * A planned order staged on `Entity.pendingMoveOrder` while its unit is
 * mid-transition between two cells, and applied once that transition
 * completes (see `~/game/systems/pending-move-order-system`). `'none'` is
 * deliberately excluded — a refused order is simply never staged, so it
 * can't later clobber whatever the unit ends up doing.
 */
export type StagedMoveOrder = Exclude<MoveOrderResult, { kind: 'none' }>;

/**
 * Applies a planned {@link MoveOrderResult} to an entity: clears whatever
 * move state it already has and replaces it with the new order. Shared by
 * `moveSelectedTo` (applying an order immediately) and
 * `PendingMoveOrderSystem` (applying a staged order once its unit's
 * in-flight cell-to-cell transition finishes) so the two can never diverge
 * in how a `MoveOrderResult` is actually carried out — see #178.
 */
export function applyMoveOrder(entity: Entity, result: MoveOrderResult): void {
  if (result.kind === 'none') {
    return;
  }

  delete entity.movePath;
  delete entity.moveTarget;

  switch (result.kind) {
    case 'stop':
      // Nothing else set `Velocity` will zero on its own, so it has to be
      // done explicitly here — see the equivalent comment this replaced in
      // `moveSelectedTo`.
      if (entity.velocity) {
        entity.velocity.x = 0;
        entity.velocity.y = 0;
      }
      break;
    case 'target':
      entity.moveTarget = result.moveTarget;
      break;
    case 'path':
      entity.movePath = result.movePath;
      break;
  }
}
