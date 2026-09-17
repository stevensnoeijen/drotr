import type { Point } from '~/lib/math/types';

/**
 * Marks the `MovePath`/`MoveTarget` a unit is currently walking as a *routed
 * pursuit*: a path planned by `~/game/systems/seek-system` to get within
 * attack range of a target it has no straight line to (a wall in the way),
 * rather than a player-issued move order.
 *
 * It exists because both kinds of movement share one pipeline — A* plans a
 * `MovePath`, `MovePathSystem` feeds it to `MoveTargetSystem` a leg at a
 * time — and nothing else in that pipeline could otherwise tell whose route
 * it is walking. That distinction decides two things:
 *
 * - `SeekSystem` only ever replans, redirects or abandons a route it owns.
 *   Move state with no `Pursuit` beside it belongs to the player, and seeking
 *   keeps its hands off it entirely (a right-click still outranks
 *   auto-attack movement, as it did before any of this was routed).
 * - A player order, conversely, drops the `Pursuit` as it takes over (see
 *   `cancelAttackOrder` in `~/game/combat/attack-order`), so a route the
 *   player has superseded can never be resumed or replanned behind their
 *   back.
 *
 * Deliberately *not* folded into `MovePath` as a flag: a pursuit outlives any
 * one path — the route is dropped and replanned as the target moves, and
 * `CellOccupancySystem` may give up on a blocked path entirely — and the
 * pursuit has to survive those gaps to know it should plan another.
 */
export interface Pursuit {
  /** The `Target.entityId` the current route was planned to reach. */
  entityId: number;
  /**
   * Where that target stood when the route was planned. A target that has
   * since walked far enough from it (see `PURSUIT_REPATH_DISTANCE`) is worth
   * a fresh search; one that has barely moved is not.
   */
  plannedPosition: Point;
  /**
   * Seconds of simulated time since the last A* search for this pursuit,
   * accumulated by `SeekSystem`. Throttles replanning (see
   * `PURSUIT_REPATH_INTERVAL`) so chasing a moving target — or waiting on a
   * target that currently has no route at all — costs a bounded number of
   * searches per second instead of one per tick.
   */
  sinceReplan: number;
}
