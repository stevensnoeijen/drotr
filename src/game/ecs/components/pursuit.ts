import type { Point } from '~/lib/math/types';

/**
 * Marks the `MovePath`/`MoveTarget` a unit is currently walking as a
 * *pursuit*: movement issued by `~/game/systems/seek-system` to get the unit
 * into a cell it can attack its target from, rather than a player-issued
 * move order.
 *
 * It covers both shapes that takes — a straight-line `MoveTarget` at the
 * chosen cell's centre, and an A*-planned `MovePath` around an obstruction —
 * because both are the same thing as far as ownership goes.
 *
 * It exists because seeking and player orders share one pipeline — A* plans a
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
   *
   * A pursuit that is *not* routed (a straight-line approach, which needs no
   * search) parks this at `PURSUIT_REPATH_INTERVAL`, so the first tick that
   * does need a route gets one immediately rather than waiting out a throttle
   * it never used.
   */
  sinceReplan: number;
}
