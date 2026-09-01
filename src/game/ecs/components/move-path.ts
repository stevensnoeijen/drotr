import type { Point } from '~/lib/math/types';

/**
 * A player-issued move order that has been routed around terrain: the
 * world-space waypoints, in order, that a unit walks to reach its
 * destination. Produced by `~/game/navigation/plan-move-path` on right-click
 * (see `~/game/systems/input-system`), consumed one leg at a time by
 * `~/game/systems/move-path-system`, and drawn as a polyline by
 * `?debug=paths`.
 *
 * `waypoints` is already reduced to corner waypoints by the pathfinder's
 * smoothing pass, so it holds direction changes rather than every cell along
 * the route — a unit crossing open ground gets a single waypoint instead of
 * stair-stepping one cell at a time.
 *
 * Consumed by index rather than by shifting the array, so the full route
 * stays available for debug rendering and (later) re-planning after the
 * order is issued.
 */
export interface MovePath {
  waypoints: Point[];
  /** Index of the next waypoint to walk to; `waypoints.length` when done. */
  index: number;
}
