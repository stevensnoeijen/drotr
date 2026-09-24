import { describe, expect, it } from 'vitest';

import { Vector2 } from './math/vector2';
import * as aStar from './navigation/astar';

import {
  toWorldPositionCellCenter,
  toWorldPosition,
  toGridPosition,
  convertPathfindingPathToPositions,
  screenToWorld,
  worldToGrid,
  screenToGrid,
  DEFAULT_CELL_SIZE,
  CELL_CENTRE_TOLERANCE,
  cellCentreCoordinate,
  isAtCellCentre,
  type ViewportTransform,
} from './grid';

describe('toWorldPositionCellCenter', () => {
  it('should center to grid position', () => {
    const position = toWorldPositionCellCenter(new Vector2(101, 60), DEFAULT_CELL_SIZE);

    expect(position.x).toEqual(112);
    expect(position.y).toEqual(48);
  });

  it('centers a negative position in its (negative) cell, not the origin cell', () => {
    // A truncating `%` puts -54 in the same cell as 10 (both "remainder
    // -54"/"remainder 10" round to the [0, 32) cell); floor division must
    // place it in the [-64, -32) cell instead, centered on -48.
    const position = toWorldPositionCellCenter(new Vector2(-54, -1), DEFAULT_CELL_SIZE);

    expect(position.x).toEqual(-48);
    expect(position.y).toEqual(-16);
  });
});

describe('toWorldPosition', () => {
  it('should center to grid position', () => {
    const position = toWorldPosition(new Vector2(10, 2), DEFAULT_CELL_SIZE);

    expect(position.x).toEqual(336);
    expect(position.y).toEqual(80);
  });
});

describe('toGridPosition', () => {
  it('should 0,0 when position is 8,8', () => {
    expect(toGridPosition(new Vector2(8, 8), DEFAULT_CELL_SIZE)).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it('should round down', () => {
    expect(toGridPosition(new Vector2(130, 130), DEFAULT_CELL_SIZE)).toMatchObject({
      x: 4,
      y: 4,
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
    // this transform: world = viewport.x + cell*DEFAULT_CELL_SIZE*scale (offset to
    // land inside the cell rather than exactly on its edge).
    const cellX = 3;
    const cellY = 5;
    const worldX = cellX * DEFAULT_CELL_SIZE + 10;
    const worldY = cellY * DEFAULT_CELL_SIZE + 10;
    const screen = {
      x: worldX * viewport.scale + viewport.x,
      y: worldY * viewport.scale + viewport.y,
    };

    const world = screenToWorld(screen, viewport);
    expect(world.x).toBeCloseTo(worldX);
    expect(world.y).toBeCloseTo(worldY);

    const cell = worldToGrid(world, DEFAULT_CELL_SIZE);
    expect(cell).toMatchObject({ x: cellX, y: cellY });

    expect(screenToGrid(screen, viewport, DEFAULT_CELL_SIZE)).toMatchObject({ x: cellX, y: cellY });
  });
});

describe('worldToGrid out-of-bounds handling', () => {
  it('returns undefined for a negative cell rather than a negative index', () => {
    const cell = worldToGrid(new Vector2(-10, -10), DEFAULT_CELL_SIZE);
    expect(cell).toBeUndefined();
  });

  it('returns undefined when the cell falls outside the given bounds', () => {
    const bounds = { width: 4, height: 4 };
    expect(worldToGrid(new Vector2(4 * DEFAULT_CELL_SIZE, 0), DEFAULT_CELL_SIZE, bounds)).toBeUndefined();
    expect(worldToGrid(new Vector2(0, 4 * DEFAULT_CELL_SIZE), DEFAULT_CELL_SIZE, bounds)).toBeUndefined();
    expect(worldToGrid(new Vector2(3 * DEFAULT_CELL_SIZE, 0), DEFAULT_CELL_SIZE, bounds)).toMatchObject({ x: 3, y: 0 });
    expect(worldToGrid(new Vector2(0, 0), DEFAULT_CELL_SIZE, bounds)).toMatchObject({ x: 0, y: 0 });
  });

  it('screenToGrid returns undefined for a screen position outside the canvas/map', () => {
    const viewport: ViewportTransform = { x: 0, y: 0, scale: 1 };
    expect(screenToGrid({ x: -50, y: -50 }, viewport, DEFAULT_CELL_SIZE)).toBeUndefined();
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

describe('cellCentreCoordinate', () => {
  it('centres a column/row index in its cell', () => {
    expect(cellCentreCoordinate(0, DEFAULT_CELL_SIZE)).toBe(16);
    expect(cellCentreCoordinate(3, DEFAULT_CELL_SIZE)).toBe(112);
  });

  it('agrees with toWorldPosition on both axes', () => {
    const world = toWorldPosition(new Vector2(5, 7), DEFAULT_CELL_SIZE);

    expect(cellCentreCoordinate(5, DEFAULT_CELL_SIZE)).toBe(world.x);
    expect(cellCentreCoordinate(7, DEFAULT_CELL_SIZE)).toBe(world.y);
  });

  it('stays correct for negative indices', () => {
    expect(cellCentreCoordinate(-1, DEFAULT_CELL_SIZE)).toBe(-16);
  });
});

describe('isAtCellCentre', () => {
  it('accepts a position exactly on a cell centre', () => {
    expect(isAtCellCentre({ x: 16, y: 16 }, DEFAULT_CELL_SIZE)).toBe(true);
    expect(isAtCellCentre({ x: 112, y: 48 }, DEFAULT_CELL_SIZE)).toBe(true);
  });

  it('accepts a position within the arrival tolerance of the centre', () => {
    expect(isAtCellCentre({ x: 16 + CELL_CENTRE_TOLERANCE, y: 16 }, DEFAULT_CELL_SIZE)).toBe(true);
    expect(isAtCellCentre({ x: 16, y: 16 - CELL_CENTRE_TOLERANCE }, DEFAULT_CELL_SIZE)).toBe(true);
  });

  it('rejects a position part-way across its cell on either axis', () => {
    expect(isAtCellCentre({ x: 16 + CELL_CENTRE_TOLERANCE + 0.5, y: 16 }, DEFAULT_CELL_SIZE)).toBe(false);
    expect(isAtCellCentre({ x: 16, y: 16 + CELL_CENTRE_TOLERANCE + 0.5 }, DEFAULT_CELL_SIZE)).toBe(false);
  });

  it('rejects a position straddling a cell boundary', () => {
    expect(isAtCellCentre({ x: DEFAULT_CELL_SIZE, y: DEFAULT_CELL_SIZE }, DEFAULT_CELL_SIZE)).toBe(false);
  });

  it('is measured against the cell the position falls in, not the origin cell', () => {
    // Negative coordinates floor into the [-32, 0) cell, centred on -16.
    expect(isAtCellCentre({ x: -16, y: -16 }, DEFAULT_CELL_SIZE)).toBe(true);
    expect(isAtCellCentre({ x: -8, y: -16 }, DEFAULT_CELL_SIZE)).toBe(false);
  });

  it('honours an explicit tolerance', () => {
    expect(isAtCellCentre({ x: 20, y: 16 }, DEFAULT_CELL_SIZE, 4)).toBe(true);
    expect(isAtCellCentre({ x: 21, y: 16 }, DEFAULT_CELL_SIZE, 4)).toBe(false);
  });
});

describe('a cell size other than the default', () => {
  // The unit grid follows the loaded map's own tile size, so every helper
  // must honour whatever cell size it's handed rather than a fixed 32.
  const cellSize = 40;

  it('floors world positions into cells of that size', () => {
    expect(toGridPosition(new Vector2(39, 40), cellSize)).toMatchObject({ x: 0, y: 1 });
    expect(toGridPosition(new Vector2(-1, 79), cellSize)).toMatchObject({ x: -1, y: 1 });
  });

  it('centres cells on half that size', () => {
    expect(toWorldPosition(new Vector2(2, 3), cellSize)).toMatchObject({ x: 100, y: 140 });
    expect(cellCentreCoordinate(2, cellSize)).toBe(100);
    expect(toWorldPositionCellCenter(new Vector2(81, 119), cellSize)).toMatchObject({
      x: 100,
      y: 100,
    });
  });

  it('judges cell centres against cells of that size', () => {
    expect(isAtCellCentre({ x: 20, y: 60 }, cellSize)).toBe(true);
    // The centre of a 32px cell is off-centre in a 40px one.
    expect(isAtCellCentre({ x: 16, y: 16 }, cellSize)).toBe(false);
  });

  it('maps screen points to cells of that size, bounds included', () => {
    const viewport: ViewportTransform = { x: 0, y: 0, scale: 1 };
    const bounds = { width: 4, height: 4 };
    expect(screenToGrid({ x: 159, y: 0 }, viewport, cellSize, bounds)).toMatchObject({
      x: 3,
      y: 0,
    });
    expect(screenToGrid({ x: 160, y: 0 }, viewport, cellSize, bounds)).toBeUndefined();
  });
});
