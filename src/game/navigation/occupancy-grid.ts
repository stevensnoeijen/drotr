import { CELL_SIZE, toWorldPosition } from '~/lib/grid';
import { Vector2 } from '~/lib/math/Vector2';
import type { Point } from '~/lib/math/types';
import { toCollisionGrid, type GridLike } from '~/lib/navigation/astar';

/** Value stored in a cell that no unit holds. */
export const NO_OCCUPANT = 0;

/** "No such cell": out of bounds, or nothing reserved. */
export const NO_CELL = -1;

/**
 * How far out {@link findNearestAvailableCell} rings before giving up, in
 * cells. Matches the pathfinder's own `nearestSearchRadius` default, so a
 * blocked destination relocates over the same neighbourhood whether it was
 * terrain or a unit that blocked it.
 */
const DEFAULT_SEARCH_RADIUS = 16;

/**
 * Unit-to-unit collision as a layer over the map's *existing* terrain
 * collision grid (`ParsedMap.collision`), rather than a parallel structure
 * at some other resolution: same dimensions, same row-major
 * `row * width + col` indexing, so a cell index means the same thing to A*,
 * to the terrain, and to this.
 *
 * The grid is the spatial index. Asking "may this unit enter that cell" is a
 * single typed-array read, so unit-to-unit collision costs O(1) per unit per
 * tick with no pairwise distance checks and no separate spatial partitioning
 * to maintain — which is what makes it scale to hundreds of units. Claims are
 * event-driven (written when a unit starts into a cell, cleared when it
 * leaves), never rebuilt from scratch each tick.
 *
 * Terrain is consulted on every availability check, so a cell no unit happens
 * to occupy is still unavailable when the terrain under it blocks movement.
 * A* already routes around terrain, so a unit should never legitimately aim
 * at such a cell — the check is a deliberate second line of defence, not a
 * duplicate of the pathfinder's job.
 */
export class OccupancyGrid {
  public readonly width: number;
  public readonly height: number;

  /**
   * The map's terrain collision buffer, borrowed rather than copied: terrain
   * is static for the lifetime of a map, and sharing it keeps the two layers
   * from drifting apart.
   */
  private readonly collision: Uint8Array;

  /**
   * Occupant id per cell, or {@link NO_OCCUPANT}. A flat typed array rather
   * than a `Map` with string keys: fixed size, no per-tick key allocation or
   * hashing, and the same shape as the terrain buffer it layers on.
   */
  private readonly occupants: Int32Array;

  private nextOccupantId = NO_OCCUPANT + 1;

  constructor(grid: GridLike) {
    const { width, height, collision } = toCollisionGrid(grid);
    this.width = width;
    this.height = height;
    this.collision = collision;
    this.occupants = new Int32Array(width * height);
  }

  /** Mints a fresh, never-reused occupant id for one unit. */
  public claimOccupantId(): number {
    return this.nextOccupantId++;
  }

  /**
   * Row-major index of cell (`col`, `row`), or {@link NO_CELL} when it falls
   * outside the grid — so an out-of-bounds cell fails every subsequent check
   * instead of silently aliasing onto a real one.
   */
  public indexOf(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) {
      return NO_CELL;
    }
    return row * this.width + col;
  }

  /**
   * Row-major index of the cell world-space coordinates fall in.
   *
   * Takes loose coordinates rather than a `Point` so the movement hot path
   * can ask about a position it hasn't moved to yet without allocating an
   * object for it, and floors inline rather than going through
   * `toGridPosition`, whose `Vector2` return would allocate again. The
   * arithmetic is the same floored division, and stays correct for negative
   * coordinates (which land out of bounds and return {@link NO_CELL}).
   */
  public indexAtWorld(x: number, y: number): number {
    return this.indexOf(Math.floor(x / CELL_SIZE), Math.floor(y / CELL_SIZE));
  }

  /** {@link indexAtWorld} for a position that already exists as a point. */
  public indexAt(position: Point): number {
    return this.indexAtWorld(position.x, position.y);
  }

  /** The (col, row) a row-major index decodes to, or `undefined` for {@link NO_CELL}. */
  public colRowOf(index: number): { x: number; y: number } | undefined {
    if (index === NO_CELL) {
      return undefined;
    }
    return { x: index % this.width, y: Math.floor(index / this.width) };
  }

  /** World-space centre of a cell, i.e. where a unit standing in it rests. */
  public centreOf(index: number): Point {
    const centre = toWorldPosition(
      new Vector2(index % this.width, Math.floor(index / this.width))
    );
    return { x: centre.x, y: centre.y };
  }

  /** Whether the terrain under a cell blocks movement (or it isn't a cell). */
  public isTerrainBlocked(index: number): boolean {
    if (index === NO_CELL) {
      return true;
    }
    return this.collision[index] !== 0;
  }

  /** The occupant id holding a cell, or {@link NO_OCCUPANT}. */
  public occupantAt(index: number): number {
    if (index === NO_CELL) {
      return NO_OCCUPANT;
    }
    return this.occupants[index];
  }

  /**
   * Whether `occupantId` may enter a cell: it must be on the map, walkable
   * terrain, and either empty or already held by this same unit (so a unit
   * re-asserting a claim it already has never blocks itself).
   */
  public isAvailableFor(index: number, occupantId: number): boolean {
    if (index === NO_CELL || this.isTerrainBlocked(index)) {
      return false;
    }
    const occupant = this.occupants[index];
    return occupant === NO_OCCUPANT || occupant === occupantId;
  }

  /**
   * Claims a cell for `occupantId`. Returns whether the claim was granted —
   * a cell held by another unit, or blocked by terrain, is refused rather
   * than overwritten.
   */
  public reserve(index: number, occupantId: number): boolean {
    if (!this.isAvailableFor(index, occupantId)) {
      return false;
    }
    this.occupants[index] = occupantId;
    return true;
  }

  /**
   * Drops `occupantId`'s claim on a cell. A no-op when the cell is held by
   * someone else, so a unit releasing a cell it never actually got (two
   * units spawned into one cell, say) can't evict the unit that did.
   */
  public release(index: number, occupantId: number): void {
    if (index === NO_CELL) {
      return;
    }
    if (this.occupants[index] === occupantId) {
      this.occupants[index] = NO_OCCUPANT;
    }
  }

  /** Drops every claim, leaving terrain untouched. */
  public clear(): void {
    this.occupants.fill(NO_OCCUPANT);
  }
}

/**
 * The cell nearest `from` that `occupantId` could stand in — `from` itself
 * when it is free, otherwise the closest cell in expanding square rings that
 * is walkable, unoccupied, and not already spoken for in `taken`. Returns
 * {@link NO_CELL} when nothing within `maxRadius` qualifies.
 *
 * `taken` is what lets one batch of orders (a group right-click) hand every
 * unit a *distinct* destination: cells assigned earlier in the batch are
 * reserved on paper before anyone has walked anywhere.
 */
export function findNearestAvailableCell(
  grid: OccupancyGrid,
  from: number,
  occupantId: number,
  taken: ReadonlySet<number> = new Set(),
  maxRadius = DEFAULT_SEARCH_RADIUS
): number {
  if (from === NO_CELL) {
    return NO_CELL;
  }

  const isFree = (index: number) =>
    index !== NO_CELL && !taken.has(index) && grid.isAvailableFor(index, occupantId);

  if (isFree(from)) {
    return from;
  }

  const originCol = from % grid.width;
  const originRow = Math.floor(from / grid.width);

  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let row = originRow - radius; row <= originRow + radius; row++) {
      for (let col = originCol - radius; col <= originCol + radius; col++) {
        // Only the ring's border: everything inside it was covered by a
        // smaller radius, so each cell is tested exactly once.
        const onBorder =
          Math.abs(row - originRow) === radius || Math.abs(col - originCol) === radius;
        if (!onBorder) {
          continue;
        }

        const index = grid.indexOf(col, row);
        if (isFree(index)) {
          return index;
        }
      }
    }
  }

  return NO_CELL;
}
