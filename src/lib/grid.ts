import { Vector2 } from './math/Vector2';
import * as PathFinding from './navigation/astar';
import type { Point } from './math/types';

/**
 * Matches the map's own tile size — and the original game's raw infantry
 * sprites (`raw/sprites/units/swordsmen.*`, `crossbowsoldier.*`, 32x32) —
 * so the unit-placement grid and the terrain/collision grid are the same
 * grid rather than two grids at different resolutions. Larger unit types
 * (knight, juggernaut, catapult: 64x64 in the raw sprites) still place on
 * this same grid; sizing individual units to their real sprite dimensions
 * is asset-integration work (phase 6), not something this constant does.
 */
export const CELL_SIZE = 32;

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

/** The camera's current pan/zoom, as needed to invert screen -> world. */
export interface ViewportTransform {
  /** World-container x offset, in screen pixels. */
  x: number;
  /** World-container y offset, in screen pixels. */
  y: number;
  /** Uniform zoom factor (1 = no zoom). */
  scale: number;
}

/** Size, in grid cells, that a valid cell coordinate must fall within. */
export interface GridBounds {
  width: number;
  height: number;
}

/**
 * Converts a screen-space (canvas-relative) point to world space, inverting
 * the pan/zoom the viewport applied when drawing: world = (screen -
 * viewport offset) / scale. Mirrors how `pixi-viewport` positions its world
 * container (`viewport.x`/`viewport.y`/`viewport.scale.x`), so callers can
 * pass that transform straight through without any Pixi dependency here.
 */
export const screenToWorld = (screen: Point, viewport: ViewportTransform): Vector2 => {
  return new Vector2(
    (screen.x - viewport.x) / viewport.scale,
    (screen.y - viewport.y) / viewport.scale
  );
};

/**
 * Converts a world-space point to a grid cell via {@link toGridPosition},
 * returning `undefined` rather than a negative or out-of-range index when
 * the point falls outside `bounds` (or, with no bounds given, outside the
 * non-negative quadrant).
 */
export const worldToGrid = (world: Vector2, bounds?: GridBounds): Vector2 | undefined => {
  const cell = toGridPosition(world);
  if (cell.x < 0 || cell.y < 0) {
    return undefined;
  }
  if (bounds && (cell.x >= bounds.width || cell.y >= bounds.height)) {
    return undefined;
  }
  return cell;
};

/**
 * Converts a screen-space point straight to a grid cell, composing
 * {@link screenToWorld} and {@link worldToGrid}. The single entry point the
 * input system and debug overlay use to turn a pointer position into "which
 * cell is this" under whatever pan/zoom is currently applied.
 */
export const screenToGrid = (
  screen: Point,
  viewport: ViewportTransform,
  bounds?: GridBounds
): Vector2 | undefined => {
  return worldToGrid(screenToWorld(screen, viewport), bounds);
};

export const convertPathfindingPathToPositions = (
  path: PathFinding.Path
): Point[] => {
  return path.map(({ position }) => position);
};
