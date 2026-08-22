import { describe, expect, it } from 'vitest';

import { Vector2 } from './math/Vector2';
import * as aStar from './navigation/astar';

import {
  toWorldPositionCellCenter,
  toWorldPosition,
  toGridPosition,
  convertPathfindingPathToPositions,
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
