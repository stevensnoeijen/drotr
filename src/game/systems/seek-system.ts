import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import { findEntityById } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { planMoveOrder } from '~/game/navigation/move-order';
import { CELL_SIZE } from '~/lib/grid';
import { quantizeAngle } from '~/lib/math/angle';
import {
  hasLineOfSight,
  toCollisionGrid,
  type CollisionGrid,
  type GridLike,
} from '~/lib/navigation/astar';

/**
 * Shortest interval, in seconds of simulated time, between two A* searches
 * for the same pursuit. A target being chased around a wall moves every tick,
 * and so does whatever is blocking the chaser, but a route is only ever as
 * good as the instant it was planned — so replanning is throttled rather than
 * run per tick, bounding the search cost of a pursuit regardless of how many
 * units are pursuing.
 *
 * A *target switch* deliberately ignores this throttle: continuing to walk a
 * route toward an enemy the unit is no longer fighting is wrong, not merely
 * stale, so it is replanned on the spot (see #195's "a target switch should
 * replan/cancel any in-flight route").
 */
export const PURSUIT_REPATH_INTERVAL = 0.5;

/**
 * How far, in world units, a pursued target may drift from the position its
 * route was planned toward before that route is worth replanning. One cell:
 * below that, the existing route still ends in the target's own cell, and a
 * fresh search would return essentially the same waypoints.
 */
export const PURSUIT_REPATH_DISTANCE = CELL_SIZE;

/**
 * Drops a routed pursuit and the route it was walking, leaving the caller to
 * decide the unit's velocity. `MoveTarget` goes too: `MovePathSystem` only
 * hands over a waypoint when there is no current one, so a leg left behind
 * here would keep steering the unit along the abandoned route.
 */
function clearPursuitRoute(entity: Entity): void {
  delete entity.pursuit;
  delete entity.movePath;
  delete entity.moveTarget;
}

/**
 * Whether a unit's movement is currently owned by a player-issued order
 * rather than by seeking: any move state present without a `Pursuit`
 * alongside it was put there by `moveSelectedTo`/`PendingMoveOrderSystem`,
 * and a staged `PendingMoveOrder` is a player order that has not landed yet.
 *
 * Seeking leaves such a unit entirely alone — it neither steers it nor routes
 * it — which is how a right-click keeps outranking auto-attack movement now
 * that both drive the same `MovePath`/`MoveTarget` pipeline.
 */
function hasPlayerMoveOrder(entity: Entity): boolean {
  return (
    !entity.pursuit &&
    (entity.pendingMoveOrder !== undefined ||
      entity.movePath !== undefined ||
      entity.moveTarget !== undefined)
  );
}

/**
 * Moves every entity with a `Target` toward it until it is within
 * `attackRange` (converted from grid cells to world units), by whichever of
 * two means can actually get it there:
 *
 * - **Straight line**, when the target is in sight: `Velocity` points right
 *   at the target's live position, scaled to `MoveSpeed`, and is zeroed once
 *   inside `attackRange` so the entity comes to rest at that range rather
 *   than sliding past it. The magnitude is clamped, on the final approaching
 *   step, to exactly close the remaining gap over `dt` — i.e. capped at
 *   `(distance - rangeWorld) / dt` instead of always `moveSpeed`. Without
 *   this, `MoveVelocitySystem` would integrate a full-speed step that could
 *   carry the entity past the range boundary before the next tick's seek call
 *   ever notices — the "no jitter or overshoot" requirement of #131 means the
 *   stop has to be exact, not just eventually corrected.
 * - **A routed pursuit**, when a wall stands between the two (#195): the
 *   entity gets a `MovePath` to the target's cell, planned with the very same
 *   {@link planMoveOrder} A* the player's own click-to-move orders use, and
 *   walks it leg by leg through `MovePathSystem`/`MoveTargetSystem`. It is
 *   not a route *to* attack range — the last legs are never reached: the
 *   moment the wall stops blocking the view, the two branches above take back
 *   over, the route is dropped, and the entity closes the final stretch in a
 *   straight line as before. Routing only has to solve getting *around* the
 *   obstruction; stopping at range is still decided by live distance.
 *
 * "In sight" is {@link hasLineOfSight} between the two units' cells — the
 * same strict, corner-respecting test A* path smoothing uses, so seeking
 * never commits to a straight line the pathfinder itself wouldn't walk. With
 * no `grid` (a map with no terrain at all) everything is in sight and this
 * behaves exactly as it did before routing existed.
 *
 * Range is checked *before* sight, so a target already within reach is fought
 * rather than routed to. For a melee unit that means it can trade blows
 * around a wall corner it has no line to; ranged line-of-sight rules are
 * #97/#161's job, not this system's.
 *
 * Which entities this system touches at all:
 *
 * - An entity with no `target`, or whose target no longer resolves to a live
 *   entity, is left alone — `SeekSystem` never touches its velocity, so
 *   anything another system set survives this pass untouched. The exception
 *   is an entity that was *pursuing* that target: seeking owns the velocity
 *   of a unit walking its own route, so abandoning the route stops the unit
 *   rather than leaving it coasting toward a corpse.
 * - An entity under a player move order is skipped outright; see
 *   {@link hasPlayerMoveOrder}.
 * - `moveSpeed` and `attackRange` are both required: an entity missing either
 *   can't be meaningfully sought toward (no known speed, or no known stopping
 *   distance), so it's skipped rather than guessing a default.
 *
 * Known limitation: a target walled off with no route at all leaves its
 * pursuer standing still, retrying the search every
 * {@link PURSUIT_REPATH_INTERVAL}, even when some other enemy is in range —
 * `runPerceptionScan` picks the nearest enemy by straight-line distance and
 * has no notion of reachability. Preferring a reachable target over an
 * unreachable one is a perception change, not a movement one, and is left to
 * a later ticket.
 */
export function createSeekSystem(queries: Queries, grid?: GridLike): System {
  // Normalised once: terrain is static for a map's lifetime, and the nested
  // array form test fixtures use would otherwise be rebuilt every tick.
  const collisionGrid: CollisionGrid | undefined = grid ? toCollisionGrid(grid) : undefined;
  // Reused across entities and ticks rather than allocated per sight test:
  // this runs for every targeting unit, every tick.
  const selfCell = { x: 0, y: 0 };
  const targetCell = { x: 0, y: 0 };

  const isInSight = (from: Entity['transform'], to: Entity['transform']): boolean => {
    if (!collisionGrid || !from || !to) {
      return true;
    }
    selfCell.x = Math.floor(from.position.x / CELL_SIZE);
    selfCell.y = Math.floor(from.position.y / CELL_SIZE);
    targetCell.x = Math.floor(to.position.x / CELL_SIZE);
    targetCell.y = Math.floor(to.position.y / CELL_SIZE);

    return hasLineOfSight(collisionGrid, selfCell, targetCell);
  };

  return (world: World<Entity>, dt: number) => {
    for (const self of queries.movable) {
      const { target, attackRange, pursuit } = self;

      if (pursuit) {
        pursuit.sinceReplan += dt;
      }

      if (!target || !attackRange) {
        if (pursuit) {
          clearPursuitRoute(self);
          self.velocity.x = 0;
          self.velocity.y = 0;
        }
        continue;
      }

      const other = findEntityById(world.entities, target.entityId);
      // A target that has died but not yet been removed from the world is
      // treated as gone: `runPerceptionScan` only re-scans every
      // `PERCEPTION_INTERVAL`, and routing across a map toward a corpse in
      // the meantime is worse than simply stopping.
      if (!other?.transform || (other.health && other.health.current <= 0)) {
        if (pursuit) {
          clearPursuitRoute(self);
          self.velocity.x = 0;
          self.velocity.y = 0;
        }
        continue;
      }

      if (hasPlayerMoveOrder(self)) {
        continue;
      }

      const dx = other.transform.position.x - self.transform.position.x;
      const dy = other.transform.position.y - self.transform.position.y;
      const distance = Math.hypot(dx, dy);
      const rangeWorld = attackRange.value * CELL_SIZE;
      const remaining = distance - rangeWorld;

      if (remaining <= 0) {
        if (pursuit) {
          clearPursuitRoute(self);
        }
        self.velocity.x = 0;
        self.velocity.y = 0;
        // Stopped at range: MoveVelocitySystem only turns to face non-zero
        // velocity, so keep facing the target explicitly while engaged with
        // it — otherwise the unit would stay frozen looking the way it
        // approached from instead of at what it's fighting. Quantized to
        // the same 8 compass directions as MoveVelocitySystem — see #178.
        self.transform.rotation = quantizeAngle(Math.atan2(dx, -dy));
        continue;
      }

      if (isInSight(self.transform, other.transform)) {
        if (pursuit) {
          clearPursuitRoute(self);
        }
        // Cap the step so it can't cross the range boundary: on approach's
        // last tick, `remaining / dt` is smaller than `moveSpeed`, and the
        // resulting step lands the entity exactly at `rangeWorld`.
        const speed =
          dt > 0 ? Math.min(self.moveSpeed.value, remaining / dt) : self.moveSpeed.value;
        self.velocity.x = (dx / distance) * speed;
        self.velocity.y = (dy / distance) * speed;
        continue;
      }

      // Out of sight: walk a route around whatever is in the way.
      const switchedTarget = pursuit?.entityId !== target.entityId;
      const drifted =
        !pursuit ||
        Math.hypot(
          other.transform.position.x - pursuit.plannedPosition.x,
          other.transform.position.y - pursuit.plannedPosition.y
        ) > PURSUIT_REPATH_DISTANCE;
      const throttled = pursuit !== undefined && pursuit.sinceReplan < PURSUIT_REPATH_INTERVAL;

      if (switchedTarget || ((!self.movePath || drifted) && !throttled)) {
        // Planned straight at the target's own cell, not at some cell within
        // attack range of it: the final approach is the straight-line branch
        // above, which takes over as soon as the route has cleared the
        // obstruction, so the tail of this path is only ever a fallback for a
        // target that stays out of sight all the way in.
        const planned = planMoveOrder(
          collisionGrid,
          self.transform.position,
          other.transform.position
        );

        delete self.movePath;
        delete self.moveTarget;
        self.pursuit = {
          entityId: target.entityId,
          plannedPosition: { ...other.transform.position },
          sinceReplan: 0,
        };
        if (planned.kind === 'path') {
          self.movePath = planned.movePath;
        }
      }

      if (!self.movePath && !self.moveTarget) {
        // Nothing to walk: the target is walled off outright, or every route
        // to it failed. Hold position — another search follows once the
        // replan throttle allows it.
        self.velocity.x = 0;
        self.velocity.y = 0;
      }
      // Otherwise the route drives the unit: MovePathSystem hands over the
      // next leg and MoveTargetSystem steers toward it, both later in this
      // same fixed step, so a freshly planned pursuit starts moving
      // immediately rather than idling a tick per leg.
    }
  };
}
