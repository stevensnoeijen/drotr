import type { ParsedMap } from '~/game/map/load-tiled-map';
import { cellSizeOf } from '~/lib/grid';
import type { CollisionGrid } from '~/lib/navigation/astar';
import { OccupancyGrid } from './occupancy-grid';

/** The parts of a loaded map that navigation reads. */
export type NavigableMap = CollisionGrid & Pick<ParsedMap, 'tileSize'>;

/** Everything the movement systems need to know about the loaded map's grid. */
export interface MapNavigation {
  /**
   * World size of one unit-placement cell: the map's own tile size (see
   * `cellSizeOf`), or the default with no map.
   */
  cellSize: number;
  /**
   * The collision grid A* routes over — the map itself, which carries the
   * same `width`, `height` and row-major `collision` buffer. `undefined`
   * with no map, where move orders fall back to straight lines.
   */
  navigationGrid?: NavigableMap;
  /**
   * Unit-to-unit collision layered straight over that same grid, so a cell
   * index means the same thing to terrain, pathfinding and occupancy.
   * `undefined` with no map: there is no grid to reserve cells in.
   */
  occupancyGrid?: OccupancyGrid;
}

/**
 * Sets up pathfinding and occupancy for the loaded map, whatever its tile
 * size. The unit grid *is* the map's tile grid — units are placed, routed
 * and collided in cells of `map.tileSize` — so the terrain's collision data
 * applies to it as-is, with no resampling between two grids at different
 * resolutions. A 40px county map and a 32px hand-authored one are handled
 * identically.
 */
export function createMapNavigation(map?: NavigableMap): MapNavigation {
  const cellSize = cellSizeOf(map);
  if (!map) {
    return { cellSize };
  }

  return {
    cellSize,
    navigationGrid: map,
    occupancyGrid: new OccupancyGrid(map, cellSize),
  };
}
