import { describe, expect, it } from 'vitest';

import { DEFAULT_CELL_SIZE } from '~/lib/grid';
import { createMapNavigation } from './map-navigation';

/** A 3x3 map with a blocked centre tile, at the given tile size. */
const mapWithTileSize = (tileSize: number) => ({
  width: 3,
  height: 3,
  tileSize,
  collision: new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0]),
});

describe('createMapNavigation', () => {
  it.each([32, 40])('routes and collides on a %ipx-tile map, in cells of that size', (tileSize) => {
    const map = mapWithTileSize(tileSize);

    const { cellSize, navigationGrid, occupancyGrid } = createMapNavigation(map);

    expect(cellSize).toBe(tileSize);
    expect(navigationGrid).toBe(map);
    expect(occupancyGrid?.cellSize).toBe(tileSize);
    expect(occupancyGrid?.width).toBe(3);
    // The map's terrain collision reaches the occupancy layer unchanged.
    expect(occupancyGrid?.isTerrainBlocked(occupancyGrid.indexOf(1, 1))).toBe(true);
    // And world positions resolve against the map's own tiles.
    expect(occupancyGrid?.indexAt({ x: tileSize * 1.5, y: tileSize * 1.5 })).toBe(
      occupancyGrid?.indexOf(1, 1)
    );
  });

  it('falls back to the default cell size, with no grids, when there is no map', () => {
    expect(createMapNavigation(undefined)).toEqual({ cellSize: DEFAULT_CELL_SIZE });
  });
});
