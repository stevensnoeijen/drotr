import { Vector2 } from './math/vector2';
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

/**
 * The grid cell a world-space position falls in, on a grid of `cellSize`
 * world units per cell.
 *
 * Every world<->cell helper in this module takes the cell size explicitly
 * rather than reading a global: the unit-placement grid *is* the loaded
 * map's tile grid, so its cell size is a per-map value (see
 * {@link cellSizeOf}), and a helper that silently assumed one fixed size
 * would put units, paths and collision on different grids on any map whose
 * tiles are a different size.
 */
export const toGridPosition = (vector: Vector2, cellSize: number): Vector2 => {
  return Vector2.divides(vector, cellSize, 'floor');
};

/** World-space centre of grid cell `vector`, on a grid of `cellSize` world units per cell. */
export const toWorldPosition = (vector: Vector2, cellSize: number): Vector2 => {
  return new Vector2(
    vector.x * cellSize + cellSize / 2,
    vector.y * cellSize + cellSize / 2
  );
};

/** World-space centre of the cell at column `x`, row `y` — {@link toWorldPosition} for loose coordinates. */
export const cellPositionToVector = (x: number, y: number, cellSize: number): Vector2 => {
  return toWorldPosition(new Vector2(x, y), cellSize);
};

/**
 * Snaps a world-space position to the center of whichever grid cell it falls
 * in. Goes through {@link toGridPosition}'s floored division rather than `%`
 * directly, so it's correct for negative coordinates too (JS's `%` is a
 * truncating remainder, not a floor modulo — `-54 % 64` is `-54`, not the
 * `10` a floor modulo would give, which put negative positions in the wrong
 * cell).
 */
export const toWorldPositionCellCenter = (vector: Vector2, cellSize: number): Vector2 => {
  const cell = toGridPosition(vector, cellSize);
  return toWorldPosition(cell, cellSize);
};

/**
 * World-space coordinate of the centre of the cell at grid index `index`
 * along one axis — the x of column `index`, or the y of row `index`.
 *
 * The scalar half of {@link toWorldPosition}, kept separate because the
 * movement hot path asks this per axis, per unit, per tick and has no use for
 * the `Vector2` that version allocates.
 */
export const cellCentreCoordinate = (index: number, cellSize: number): number => {
  return index * cellSize + cellSize / 2;
};

/**
 * How far, in world units, a position may sit from its cell's centre and
 * still count as standing *in* that cell rather than somewhere across it.
 *
 * Must never be tighter than `ARRIVAL_TOLERANCE` in
 * {@link file://../game/systems/move-target-system.ts}: that is the distance
 * within which a unit walking to a point stops moving, so a unit that has
 * genuinely finished a move onto a cell centre can be up to that far from it
 * and must still read as centred here. `move-target-system.spec.ts` asserts
 * the relationship holds.
 */
export const CELL_CENTRE_TOLERANCE = 1;

/**
 * Whether `point` is at the centre of whichever cell it falls in, to within
 * {@link CELL_CENTRE_TOLERANCE}.
 *
 * This is the engine's definition of "fully arrived in a cell, not part-way
 * across it". Combat reads it to decide whether a unit may swing or be
 * swung at, and `SeekSystem` reads it to decide whether an approach is
 * finished — both of which need the *visible* fact (is the unit drawn in the
 * middle of a cell?) rather than a proxy such as "has zero velocity", which a
 * unit stopped anywhere at all satisfies.
 *
 * Deliberately allocation-free: it runs per unit, per tick.
 */
export const isAtCellCentre = (
  point: Point,
  cellSize: number,
  tolerance: number = CELL_CENTRE_TOLERANCE
): boolean => {
  const centreX = cellCentreCoordinate(Math.floor(point.x / cellSize), cellSize);
  const centreY = cellCentreCoordinate(Math.floor(point.y / cellSize), cellSize);
  return Math.abs(point.x - centreX) <= tolerance && Math.abs(point.y - centreY) <= tolerance;
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
export const worldToGrid = (
  world: Vector2,
  cellSize: number,
  bounds?: GridBounds
): Vector2 | undefined => {
  const cell = toGridPosition(world, cellSize);
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
  cellSize: number,
  bounds?: GridBounds
): Vector2 | undefined => {
  return worldToGrid(screenToWorld(screen, viewport), cellSize, bounds);
};

export const convertPathfindingPathToPositions = (
  path: PathFinding.Path
): Point[] => {
  return path.map(({ position }) => position);
};
