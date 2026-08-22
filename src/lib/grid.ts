import { Vector2 } from './math/Vector2';
import * as PathFinding from './navigation/astar';
import type { Point } from './math/types';

export const CELL_SIZE = 64;

export const toGridPosition = (vector: Vector2): Vector2 => {
  return Vector2.divides(vector, CELL_SIZE, 'floor');
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

/**
 * Snaps a world-space position to the center of whichever grid cell it falls
 * in. Goes through {@link toGridPosition}'s floored division rather than `%`
 * directly, so it's correct for negative coordinates too (JS's `%` is a
 * truncating remainder, not a floor modulo — `-54 % 64` is `-54`, not the
 * `10` a floor modulo would give, which put negative positions in the wrong
 * cell).
 */
export const toWorldPositionCellCenter = (vector: Vector2): Vector2 => {
  const cell = toGridPosition(vector);
  return toWorldPosition(cell);
};

export const convertPathfindingPathToPositions = (
  path: PathFinding.Path
): Point[] => {
  return path.map(({ position }) => position);
};
