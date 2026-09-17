import {
  findPath,
  type FindPathOptions,
  type GridLike,
  type PathStatus,
} from '~/lib/navigation/astar';
import { toGridPosition, toWorldPosition } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import type { Point } from '~/lib/math/types';

export interface PlannedMovePath {
  status: PathStatus;
  /**
   * World-space waypoints to walk, in order, at cell centres. The unit's own
   * starting cell is never included — a unit standing on it has nothing to
   * walk to — so an order that resolves to the cell the unit is already in
   * comes back `'found'` with an empty list.
   */
  waypoints: Point[];
}

/**
 * Turns a world-space move order into the world-space waypoints a unit
 * should walk, by routing through the map's collision grid.
 *
 * The whole world<->cell conversion lives here rather than in
 * `~/lib/navigation/astar`, which stays a pure grid algorithm with no notion
 * of world units: the pathfinder reasons in cells, the ECS in world
 * positions, and this is the single seam between them.
 *
 * Waypoints are snapped to cell centres — the same placement every spawned
 * unit gets (see `spawnUnit`) — so a unit walking a path ends up centred in
 * its destination cell rather than wherever the click happened to land.
 *
 * Deliberately requests the *unsmoothed* cell-by-cell path (`smooth: false`),
 * even though `findPath` defaults to corner-reduced waypoints: `MovePath` is
 * consumed one waypoint per `MoveTarget` leg, and a reroute issued while a
 * unit is mid-transition only redirects once `MoveTarget` clears (see
 * `PendingMoveOrder`) — movement is only ever an atomic step to one adjacent
 * cell (#178). A smoothed, multi-cell leg would keep `MoveTarget` set across
 * several cells' worth of travel, delaying a staged reroute until that whole
 * run finished instead of just the next cell. Every intermediate cell in an
 * unsmoothed run is still 8-way aligned with its neighbours (the search never
 * generates anything else), so the unit's visible trajectory is unchanged —
 * only the leg granularity is.
 */
export function planMovePath(
  grid: GridLike,
  from: Point,
  to: Point,
  options?: FindPathOptions
): PlannedMovePath {
  const start = toGridPosition(new Vector2(from.x, from.y));
  const end = toGridPosition(new Vector2(to.x, to.y));

  const { status, cells } = findPath(grid, start, end, { ...options, smooth: false });
  if (status !== 'found') {
    return { status, waypoints: [] };
  }

  // `cells[0]` is the cell the unit already occupies.
  const waypoints = cells.slice(1).map((cell) => {
    const world = toWorldPosition(new Vector2(cell.x, cell.y));
    return { x: world.x, y: world.y };
  });

  return { status, waypoints };
}
