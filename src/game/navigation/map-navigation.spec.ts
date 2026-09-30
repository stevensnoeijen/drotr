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
  it.each([32, 40])('routes and collides on a %ipx-tile map, in half-tile cells', (tileSize) => {
    const map = mapWithTileSize(tileSize);
    const cell = tileSize / 2;

    const { cellSize, navigationGrid, occupancyGrid } = createMapNavigation(map);

    expect(cellSize).toBe(cell);
    expect(navigationGrid).toMatchObject({ width: 6, height: 6 });
    expect(occupancyGrid?.cellSize).toBe(cell);
    expect(occupancyGrid?.width).toBe(6);
    // The blocked centre tile blocks each of its 2x2 sub-cells...
    for (const [col, row] of [[2, 2], [3, 2], [2, 3], [3, 3]]) {
      expect(occupancyGrid?.isTerrainBlocked(occupancyGrid.indexOf(col, row))).toBe(true);
    }
    // ...and none of the cells around it.
    expect(occupancyGrid?.isTerrainBlocked(occupancyGrid.indexOf(1, 2))).toBe(false);
    expect(occupancyGrid?.isTerrainBlocked(occupancyGrid.indexOf(4, 3))).toBe(false);
    // World positions resolve against half-tile cells.
    expect(occupancyGrid?.indexAt({ x: tileSize * 1.75, y: tileSize * 1.25 })).toBe(
      occupancyGrid?.indexOf(3, 2)
    );
  });

  it('leaves the loaded map\'s own collision untouched', () => {
    const map = mapWithTileSize(40);
    createMapNavigation(map);
    expect(map.collision).toHaveLength(9);
  });

  it('falls back to the default cell size, with no grids, when there is no map', () => {
    expect(createMapNavigation(undefined)).toEqual({ cellSize: DEFAULT_CELL_SIZE });
  });
});
