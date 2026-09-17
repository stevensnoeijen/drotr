import type { Point } from '~/lib/math/types';

/**
 * A player-issued move order that has been routed around terrain: the
 * world-space waypoints, in order, that a unit walks to reach its
 * destination. Produced by `~/game/navigation/plan-move-path` on right-click
 * (see `~/game/systems/input-system`), consumed one leg at a time by
 * `~/game/systems/move-path-system`, and drawn as a polyline by
 * `?debug=paths`.
 *
 * `waypoints` holds every cell along the route, not just corners: each leg is
 * an atomic single-cell step in one of the 8 allowed directions (#178), which
 * is what lets a reroute issued mid-transition (see `PendingMoveOrder`) take
 * effect after just the current cell rather than after a longer smoothed run.
 * The unit's visible trajectory is unaffected — every cell in an unsmoothed
 * run is still 8-way aligned with its neighbours, so consecutive legs sum to
 * the same straight or diagonal line a smoothed path would have drawn.
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
