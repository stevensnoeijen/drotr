import type { ParsedMap } from '~/game/map/load-tiled-map';
import { cellSizeOf, upsampleCollision } from '~/lib/grid';
import type { CollisionGrid } from '~/lib/navigation/astar';
import { OccupancyGrid } from './occupancy-grid';

/** The parts of a loaded map that navigation reads. */
export type NavigableMap = CollisionGrid & Pick<ParsedMap, 'tileSize'>;

/** Everything the movement systems need to know about the loaded map's grid. */
export interface MapNavigation {
  /**
   * World size of one unit-placement cell: half the map's tile size (see
   * `cellSizeOf`), or the default with no map.
   */
  cellSize: number;
  /**
   * The collision grid A* routes over: the map's per-tile collision
   * upsampled onto the unit-placement grid, so each blocked tile blocks its
   * sub-cells. `undefined` with no map, where move orders fall back to
   * straight lines.
   */
  navigationGrid?: CollisionGrid;
  /**
   * Unit-to-unit collision layered straight over that same upsampled grid,
   * so a cell index means the same thing to terrain, pathfinding and
   * occupancy. `undefined` with no map: there is no grid to reserve cells in.
   */
  occupancyGrid?: OccupancyGrid;
}

/**
 * Sets up pathfinding and occupancy for the loaded map, whatever its tile
 * size. Units are placed, routed and collided on a grid finer than the
 * map's tiles (`cellSizeOf`), so the terrain's collision data is upsampled
 * once here and every movement system shares the result. A 40px county map
 * and a 32px hand-authored one are handled identically.
 */
export function createMapNavigation(map?: NavigableMap): MapNavigation {
  const cellSize = cellSizeOf(map);
  if (!map) {
    return { cellSize };
  }

  const navigationGrid = upsampleCollision(map);
  return {
    cellSize,
    navigationGrid,
    occupancyGrid: new OccupancyGrid(navigationGrid, cellSize),
  };
}
