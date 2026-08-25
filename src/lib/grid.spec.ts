import { describe, expect, it } from 'vitest';

import { Vector2 } from './math/Vector2';
import * as aStar from './navigation/astar';

import {
  toWorldPositionCellCenter,
  toWorldPosition,
  toGridPosition,
  convertPathfindingPathToPositions,
  screenToWorld,
  worldToGrid,
  screenToGrid,
  CELL_SIZE,
  type ViewportTransform,
} from './grid';

describe('toWorldPositionCellCenter', () => {
  it('should center to grid position', () => {
    const position = toWorldPositionCellCenter(new Vector2(101, 60));

    expect(position.x).toEqual(96);
    expect(position.y).toEqual(32);
  });

  it('centers a negative position in its (negative) cell, not the origin cell', () => {
    // A truncating `%` puts -54 in the same cell as 10 (both "remainder
    // -54"/"remainder 10" round to the [0, 64) cell); floor division must
    // place it in the [-64, 0) cell instead, centered on -32.
    const position = toWorldPositionCellCenter(new Vector2(-54, -1));

    expect(position.x).toEqual(-32);
    expect(position.y).toEqual(-32);
  });
});

describe('toWorldPosition', () => {
  it('should center to grid position', () => {
    const position = toWorldPosition(new Vector2(10, 2));

    expect(position.x).toEqual(672);
    expect(position.y).toEqual(160);
  });
});

describe('toGridPosition', () => {
  it('should 0,0 when position is 8,8', () => {
    expect(toGridPosition(new Vector2(8, 8))).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it('should round down', () => {
    expect(toGridPosition(new Vector2(130, 130))).toMatchObject({
      x: 2,
      y: 2,
    });
  });
});

describe('screenToWorld -> worldToGrid round trip', () => {
  const identity: ViewportTransform = { x: 0, y: 0, scale: 1 };
  const zoomedIn: ViewportTransform = { x: 0, y: 0, scale: 2 };
  const zoomedOut: ViewportTransform = { x: 0, y: 0, scale: 0.5 };
  const panned: ViewportTransform = { x: -128, y: 64, scale: 1 };
  const pannedAndZoomed: ViewportTransform = { x: -200, y: 50, scale: 1.5 };

  it.each([
    ['zoom 1', identity],
    ['zoomed in', zoomedIn],
    ['zoomed out', zoomedOut],
    ['panned', panned],
    ['panned and zoomed', pannedAndZoomed],
  ])('recovers the correct cell under %s', (_label, viewport) => {
    // Pick a screen point that maps to a known world position/cell under
    // this transform: world = viewport.x + cell*CELL_SIZE*scale (offset to
    // land inside the cell rather than exactly on its edge).
    const cellX = 3;
    const cellY = 5;
    const worldX = cellX * CELL_SIZE + 10;
    const worldY = cellY * CELL_SIZE + 10;
    const screen = {
      x: worldX * viewport.scale + viewport.x,
      y: worldY * viewport.scale + viewport.y,
    };

    const world = screenToWorld(screen, viewport);
    expect(world.x).toBeCloseTo(worldX);
    expect(world.y).toBeCloseTo(worldY);

    const cell = worldToGrid(world);
    expect(cell).toMatchObject({ x: cellX, y: cellY });

    expect(screenToGrid(screen, viewport)).toMatchObject({ x: cellX, y: cellY });
  });
});

describe('worldToGrid out-of-bounds handling', () => {
  it('returns undefined for a negative cell rather than a negative index', () => {
    const cell = worldToGrid(new Vector2(-10, -10));
    expect(cell).toBeUndefined();
  });

  it('returns undefined when the cell falls outside the given bounds', () => {
    const bounds = { width: 4, height: 4 };
    expect(worldToGrid(new Vector2(4 * CELL_SIZE, 0), bounds)).toBeUndefined();
    expect(worldToGrid(new Vector2(0, 4 * CELL_SIZE), bounds)).toBeUndefined();
    expect(worldToGrid(new Vector2(3 * CELL_SIZE, 0), bounds)).toMatchObject({ x: 3, y: 0 });
    expect(worldToGrid(new Vector2(0, 0), bounds)).toMatchObject({ x: 0, y: 0 });
  });

  it('screenToGrid returns undefined for a screen position outside the canvas/map', () => {
    const viewport: ViewportTransform = { x: 0, y: 0, scale: 1 };
    expect(screenToGrid({ x: -50, y: -50 }, viewport)).toBeUndefined();
  });
});

describe('convertPathfindingPathToPositions', () => {
  it('should convert positions', () => {
    const positions = convertPathfindingPathToPositions([
      {
        position: {
          x: 100,
          y: 200,
        },
      } as aStar.Node,
      {
        position: {
          x: 300,
          y: 400,
        },
      } as aStar.Node,
    ]);

    expect(positions).toHaveLength(2);
    expect(positions).toEqual([
      {
        x: 100,
        y: 200,
      },
      {
        x: 300,
        y: 400,
      },
    ]);
  });
});
