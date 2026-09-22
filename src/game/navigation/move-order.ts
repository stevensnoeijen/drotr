import { cancelAttackOrder } from '~/game/combat/attack-order';
import type { Entity } from '~/game/ecs/entity';
import type { MovePath } from '~/game/ecs/components/move-path';
import type { MoveTarget } from '~/game/ecs/components/move-target';
import { planMovePath } from '~/game/navigation/plan-move-path';
import type { GridLike } from '~/lib/navigation/astar';
import type { Point } from '~/lib/math/types';

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
 * Plans what a move order to `destination` resolves to for a unit standing
 * at `from`: a straight-line `'target'` with no `grid` to route through, or
 * otherwise a routed `'path'` (or `'stop'`, if `destination` is the cell
 * `from` is already in). Shared by `moveSelectedTo` (planning immediately,
 * from the unit's current position) and `PendingMoveOrderSystem` (planning
 * once a staged order's unit is free to receive it, from *that* position).
 * Deliberately takes `from` as a parameter rather than reading it
 * off an entity itself: planning always has to happen against whatever
 * position is current at plan time, and a caller that plans from a stale
 * position is exactly the bug (see `PendingMoveOrder`) this split guards
 * against.
 */
export function planMoveOrder(
  grid: GridLike | undefined,
  from: Point,
  destination: Point
): MoveOrderResult {
  if (!grid) {
    return {
      kind: 'target',
      moveTarget: { position: { x: destination.x, y: destination.y } },
    };
  }

  const { status, waypoints } = planMovePath(grid, from, destination);
  if (status !== 'found') {
    return { kind: 'none' };
  }

  return waypoints.length === 0
    ? { kind: 'stop' }
    : { kind: 'path', movePath: { waypoints, index: 0 } };
}

/**
 * Applies a planned {@link MoveOrderResult} to an entity: clears whatever
 * move state it already has and replaces it with the new order. Shared by
 * `moveSelectedTo` (applying an order immediately) and
 * `PendingMoveOrderSystem` (applying a staged order once its unit's
 * in-flight cell-to-cell transition finishes) so the two can never diverge
 * in how a `MoveOrderResult` is actually carried out.
 *
 * An order that can't be carried out (`'none'`) leaves the entity exactly as
 * it was, standing attack order included: nothing about a refused order
 * should change what the unit was already doing.
 *
 * Taking effect also gives up any standing *attack* order (see
 * {@link cancelAttackOrder}), which is what "the order only clears when the
 * targeted unit dies or the player issues a new order" means on this
 * side: going somewhere is a new order, so a sticky manual target stops
 * being sticky and any combat route toward it is dropped rather than left to
 * be resumed behind the player's back.
 */
export function applyMoveOrder(entity: Entity, result: MoveOrderResult): void {
  if (result.kind === 'none') {
    return;
  }

  cancelAttackOrder(entity);
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
