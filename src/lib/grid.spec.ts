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

    expect(position.x).toEqual(104);
    expect(position.y).toEqual(56);
  });
});

describe('toWorldPosition', () => {
  it('should center to grid position', () => {
    const position = toWorldPosition(new Vector2(10, 2));

    expect(position.x).toEqual(168);
    expect(position.y).toEqual(40);
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
    expect(toGridPosition(new Vector2(47, 47))).toMatchObject({
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
