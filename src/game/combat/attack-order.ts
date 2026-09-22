import type { Entity } from '~/game/ecs/entity';

/**
 * Orders `entity` to attack one specific unit, as the player does by
 * right-clicking an enemy (see `attackSelectedTarget` in
 * `~/game/systems/input-system`).
 *
 * The order is recorded as a `manual` {@link Entity.target}, which makes it
 * *sticky*: `runPerceptionScan` will not retarget the unit to some other,
 * possibly closer enemy while it is en route or fighting, unlike an
 * auto-acquired target. It stays in force until the targeted unit dies (the
 * scan drops a dead target like any other) or the player issues a new order.
 *
 * Every move order the unit was carrying is dropped outright: a route, a leg
 * in flight, a staged order, and any `Pursuit` toward a previous target.
 * `SeekSystem` keeps its hands off a unit holding a player move order, so a
 * left-over route would otherwise both outrank the attack order just given
 * and go on carrying the unit somewhere it was no longer ordered to be.
 * Velocity is zeroed for the same reason — with nothing left to steer the
 * unit this tick, it would keep coasting on whatever the last order set —
 * and `SeekSystem` re-aims it, later in this very fixed step, at the target
 * just assigned.
 *
 * Dropping the current leg mid-cell is deliberate here, and not the
 * problem that `PendingMoveOrder` exists to avoid: that guards a *routed*
 * cell-to-cell walk, whereas seeking has always steered straight at a live
 * target from wherever the unit happens to stand — a retarget mid-approach
 * already turns a unit mid-cell today.
 */
export function issueAttackOrder(entity: Entity, targetId: number): void {
  entity.target = { entityId: targetId, manual: true };

  delete entity.pendingMoveOrder;
  delete entity.movePath;
  delete entity.moveTarget;
  delete entity.pursuit;

  if (entity.velocity) {
    entity.velocity.x = 0;
    entity.velocity.y = 0;
  }
}

/**
 * Gives up any standing attack order on `entity`, because the player has
 * ordered it to do something else instead (see `applyMoveOrder` and
 * `moveSelectedTo`).
 *
 * The target itself is kept, only demoted from manual to auto-acquired: the
 * unit is still next to whatever it was fighting, and dropping the reference
 * outright would leave it unable to defend itself until the next perception
 * scan came round. Demoted, it is simply re-evaluated from then on like any
 * other target — including being cleared, by that same scan, if the move
 * order takes the unit out of range of it.
 *
 * Any `Pursuit` goes, since a route toward that target is exactly what the
 * new order supersedes. The route itself (`MovePath`/`MoveTarget`) is *not*
 * touched here: the callers either replace it wholesale with the new order or
 * are deliberately letting the current leg finish first, and it is theirs to
 * decide which.
 */
export function cancelAttackOrder(entity: Entity): void {
  delete entity.pursuit;
  if (entity.target?.manual) {
    delete entity.target.manual;
  }
}
