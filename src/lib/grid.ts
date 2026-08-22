import { Vector2 } from './math/Vector2';
import * as PathFinding from './navigation/astar';
import type { Point } from './math/types';

export const CELL_SIZE = 64;

export const toWorldPositionCellCenter = (vector: Vector2): Vector2 => {
  return new Vector2(
    vector.x - (vector.x % CELL_SIZE) + CELL_SIZE / 2,
    vector.y - (vector.y % CELL_SIZE) + CELL_SIZE / 2
  );
};

export const toWorldPosition = (vector: Vector2): Vector2 => {
  return new Vector2(
    vector.x * CELL_SIZE + CELL_SIZE / 2,
    vector.y * CELL_SIZE + CELL_SIZE / 2
  );
};

/**
 *
 * @param {number} x
 * @param {number} y
 * @returns {Vector2} centered cell vector
 */
export const cellPositionToVector = (x: number, y: number): Vector2 => {
  return toWorldPosition(new Vector2(x, y));
};

export const toGridPosition = (vector: Vector2): Vector2 => {
  return Vector2.divides(vector, CELL_SIZE, 'floor');
};

export const convertPathfindingPathToPositions = (
  path: PathFinding.Path
): Point[] => {
  return path.map(({ position }) => position);
};
