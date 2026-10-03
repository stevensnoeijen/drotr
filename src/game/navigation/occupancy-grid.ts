import { toWorldPosition } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import type { Point } from '~/lib/math/types';
import { toCollisionGrid, type CollisionGrid, type GridLike } from '~/lib/navigation/astar';
import { terrainBlockGrid } from './block-grid';

/** Value stored in a cell that no unit holds. */
export const NO_OCCUPANT = 0;

/** "No such cell": out of bounds, or nothing reserved. */
export const NO_CELL = -1;

/**
 * A rectangular footprint's size, in cells — structurally the same shape as
 * `Footprint` (`~/game/ecs/components`), but this module stays free of any
 * ECS dependency: it only ever needs the two numbers.
 */
export interface BlockSize {
  width: number;
  height: number;
}

/** The size every occupancy check defaults to: a single cell. */
export const SINGLE_CELL: BlockSize = { width: 1, height: 1 };

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
   * World size of one cell — the half-tile unit-placement cell (see
   * `cellSizeOf`), matching the upsampled collision grid it layers over. Read by anything that turns a cell index back into a
   * world position, or plans a route over {@link asBlockedGridExcluding}.
   */
  public readonly cellSize: number;

  /**
   * The map's terrain collision buffer, borrowed rather than copied: terrain
   * is static for the lifetime of a map, and sharing it keeps the two layers
   * from drifting apart.
   */
  private readonly collision: Uint8Array;

  /**
   * The terrain grid `collision` belongs to, kept so block grids derived
   * from it (see {@link asBlockedGridExcluding}) are cached against its
   * identity — the same object `terrainBlockGrid` is keyed on for move
   * orders — rather than rebuilt per repath.
   */
  private readonly terrain: CollisionGrid;

  /**
   * Occupant id per cell, or {@link NO_OCCUPANT}. A flat typed array rather
   * than a `Map` with string keys: fixed size, no per-tick key allocation or
   * hashing, and the same shape as the terrain buffer it layers on.
   */
  private readonly occupants: Int32Array;

  private nextOccupantId = NO_OCCUPANT + 1;

  constructor(grid: GridLike, cellSize: number) {
    const terrain = toCollisionGrid(grid);
    const { width, height, collision } = terrain;
    this.terrain = terrain;
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
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
    return this.indexOf(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
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
      new Vector2(index % this.width, Math.floor(index / this.width)),
      this.cellSize
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

  /**
   * Row-major indices of the `size.width` x `size.height` block anchored
   * (top-left) at `anchor`, or `undefined` when any of it falls off the
   * grid. `size` defaults to a single cell, so passing it in reduces to
   * `[anchor]`.
   */
  public blockCells(anchor: number, size: BlockSize = SINGLE_CELL): number[] | undefined {
    if (anchor === NO_CELL) {
      return undefined;
    }
    const col = anchor % this.width;
    const row = Math.floor(anchor / this.width);
    const cells: number[] = [];
    for (let dy = 0; dy < size.height; dy++) {
      for (let dx = 0; dx < size.width; dx++) {
        const index = this.indexOf(col + dx, row + dy);
        if (index === NO_CELL) {
          return undefined;
        }
        cells.push(index);
      }
    }
    return cells;
  }

  /**
   * {@link isAvailableFor} for a whole block: on the map, walkable, and
   * free or already held by `occupantId`, cell by cell. The cells a moving
   * unit already holds pass trivially, so for a block one step ahead of
   * where it stands this checks exactly the leading cells it would move
   * into.
   */
  public isBlockAvailableFor(anchor: number, size: BlockSize, occupantId: number): boolean {
    const cells = this.blockCells(anchor, size);
    return cells !== undefined && cells.every((index) => this.isAvailableFor(index, occupantId));
  }

  /**
   * Claims a whole block for `occupantId`, **atomically**: either every
   * cell of it is reserved, or — when any single one is unavailable —
   * none of them are. There is no partial claim that leaves stray cells
   * held after a failed reservation.
   */
  public reserveBlock(anchor: number, size: BlockSize, occupantId: number): boolean {
    if (!this.isBlockAvailableFor(anchor, size, occupantId)) {
      return false;
    }
    for (const index of this.blockCells(anchor, size)!) {
      this.occupants[index] = occupantId;
    }
    return true;
  }

  /**
   * Drops `occupantId`'s claim on every cell of the block anchored at
   * `anchor`, except any that also lie in the block anchored at `keep` —
   * the block a unit still stands in or is moving into, which may overlap
   * the one it's letting go of. A cell held by someone else is left alone,
   * exactly as {@link release} already guards per cell.
   */
  public releaseBlock(
    anchor: number,
    size: BlockSize,
    occupantId: number,
    keep: number = NO_CELL
  ): void {
    if (anchor === NO_CELL) {
      return;
    }
    const kept = new Set(this.blockCells(keep, size) ?? []);
    const col = anchor % this.width;
    const row = Math.floor(anchor / this.width);
    for (let dy = 0; dy < size.height; dy++) {
      for (let dx = 0; dx < size.width; dx++) {
        const index = this.indexOf(col + dx, row + dy);
        if (!kept.has(index)) {
          this.release(index, occupantId);
        }
      }
    }
  }

  /**
   * A one-off snapshot grid for re-routing a specific blocked unit: terrain
   * blocking is carried over unchanged, and every cell currently held by
   * some *other* occupant is blocked too, so `planMovePath` can route a
   * stuck unit around whoever is in its way right now. `occupantId`'s own
   * claim (its current and any straddled cell) never counts against it —
   * a unit is never blocked by the ground it's already standing on.
   *
   * For a multi-cell `size` the snapshot is a *block grid* over anchor
   * cells (see `blockAnchorGrid`): an anchor is blocked when any cell of the
   * block it anchors is terrain, off the grid, or held by another unit, so a
   * knight reroutes around a gap between two units it cannot fit through. It
   * is derived from the cached terrain block grid rather than recomputed: a
   * copy of that, plus, for each cell another unit holds, the `width * height`
   * anchors whose block covers it. The cost is one pass over the occupant
   * array and a buffer copy (both `O(width * height)`, the same full-grid
   * pass the single-cell snapshot already makes), plus
   * `O(held cells * width * height of size)` marking — proportional to how
   * crowded the map is, never to the area searched. `size` defaults to a
   * single cell, where the result is exactly the plain snapshot.
   *
   * Deliberately a fresh copy taken only when a reroute is actually
   * attempted, not a view kept live: unit positions change every tick, but a
   * plan is only ever as good as the instant it was made, so there is
   * nothing to gain from the copy tracking further ticks it will never see.
   */
  public asBlockedGridExcluding(occupantId: number, size: BlockSize = SINGLE_CELL): CollisionGrid {
    const collision = new Uint8Array(terrainBlockGrid(this.terrain, size).collision);
    const { width, height } = this;

    for (let i = 0; i < this.occupants.length; i++) {
      const occupant = this.occupants[i];
      if (occupant === NO_OCCUPANT || occupant === occupantId) {
        continue;
      }

      // Every anchor whose block covers this cell: the block's top-left can
      // sit up to `size - 1` cells above and to the left of it.
      const col = i % width;
      const row = Math.floor(i / width);
      for (let dy = 0; dy < size.height && row - dy >= 0; dy++) {
        for (let dx = 0; dx < size.width && col - dx >= 0; dx++) {
          collision[(row - dy) * width + (col - dx)] = 1;
        }
      }
    }

    return { width, height, collision };
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
 *
 * With a `size` larger than one cell, `from` and the result are anchor
 * (top-left) cells of a `size`-cell block, and every cell of the block at a
 * candidate anchor must qualify — the nearest origin whose *whole*
 * rectangle is free, not merely the nearest free single cell.
 */
export function findNearestAvailableCell(
  grid: OccupancyGrid,
  from: number,
  occupantId: number,
  taken: ReadonlySet<number> = new Set(),
  maxRadius = DEFAULT_SEARCH_RADIUS,
  size: BlockSize = SINGLE_CELL
): number {
  if (from === NO_CELL) {
    return NO_CELL;
  }

  const isFree = (index: number) => {
    if (index === NO_CELL || !grid.isBlockAvailableFor(index, size, occupantId)) {
      return false;
    }
    return grid.blockCells(index, size)!.every((cell) => !taken.has(cell));
  };

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
