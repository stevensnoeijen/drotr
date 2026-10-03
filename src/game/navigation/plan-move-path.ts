import type { Footprint } from '~/game/ecs/components';
import {
  findPath,
  type FindPathOptions,
  type GridLike,
  type PathStatus,
} from '~/lib/navigation/astar';
import { toGridPosition, toWorldPosition } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import type { Point } from '~/lib/math/types';
import { footprintShift } from './footprint';

/** Every call below defaults to a single cell, today's behaviour. */
const DEFAULT_FOOTPRINT: Footprint = { width: 1, height: 1 };

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
 * `cellSize` is the world size of one of `grid`'s cells — the half-tile
 * unit-placement cell (see `cellSizeOf`), since the collision grid is the
 * map's terrain upsampled onto that grid (see `createMapNavigation`).
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
 * cell. A smoothed, multi-cell leg would keep `MoveTarget` set across
 * several cells' worth of travel, delaying a staged reroute until that whole
 * run finished instead of just the next cell. Every intermediate cell in an
 * unsmoothed run is still 8-way aligned with its neighbours (the search never
 * generates anything else), so the unit's visible trajectory is unchanged —
 * only the leg granularity is.
 *
 * `footprint` is the unit's block size in cells (see `footprintOf`),
 * defaulting to a single cell. For anything larger, `grid` must be the
 * unit's **block grid** — a grid over *anchor* cells in which an anchor is
 * blocked whenever any cell of the block it anchors is (see
 * `blockAnchorGrid` in `./block-grid`; `planMoveOrder` builds the cached terrain one,
 * `OccupancyGrid.asBlockedGridExcluding` the one that also counts other
 * units). Every cell A* then expands is a placement where the whole block
 * fits, so a wide unit is only ever routed through gaps it can pass, and an
 * order with no such route comes back `'unreachable'` rather than as a path
 * the unit would stall on. A blocked destination relocates to the nearest
 * anchor whose whole block is free, for the same reason. The planner cannot
 * tell the two kinds of grid apart, so passing plain terrain together with a
 * multi-cell `footprint` silently reverts to single-cell routing.
 *
 * What this function itself accounts for is the *anchor convention*:
 * `from`/`to` are shifted by {@link footprintShift} before being floored to a
 * cell, and every resulting waypoint is shifted back by the same amount — so
 * a path for a 2x2 unit is planned by its block's anchor (top-left) cell but
 * its waypoints are still block centres (cell corners), never
 * `(cell + 0.5) * cellSize` cell centres. Reduces exactly to the original
 * cell-centre behaviour when `footprint` is 1x1, since its shift is zero on
 * both axes and its block grid is the input grid.
 */
export function planMovePath(
  grid: GridLike,
  from: Point,
  to: Point,
  cellSize: number,
  footprint: Footprint = DEFAULT_FOOTPRINT,
  options?: FindPathOptions
): PlannedMovePath {
  const shift = footprintShift(footprint, cellSize);
  const start = toGridPosition(new Vector2(from.x - shift.x, from.y - shift.y), cellSize);
  const end = toGridPosition(new Vector2(to.x - shift.x, to.y - shift.y), cellSize);

  const { status, cells } = findPath(grid, start, end, { ...options, smooth: false });
  if (status !== 'found') {
    return { status, waypoints: [] };
  }

  // `cells[0]` is the cell the unit already occupies.
  const waypoints = cells.slice(1).map((cell) => {
    const world = toWorldPosition(new Vector2(cell.x, cell.y), cellSize);
    return { x: world.x + shift.x, y: world.y + shift.y };
  });

  return { status, waypoints };
}
