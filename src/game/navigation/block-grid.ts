import { toCollisionGrid, type CollisionGrid, type GridLike } from '~/lib/navigation/astar';

/**
 * A footprint's size in cells. Structurally the same as `Footprint`
 * (`~/game/ecs/components`) and `BlockSize` (`./occupancy-grid`); declared
 * locally so this module needs neither.
 */
interface BlockExtent {
  readonly width: number;
  readonly height: number;
}

const isSingleCell = (size: BlockExtent): boolean => size.width <= 1 && size.height <= 1;

/**
 * A collision grid for routing a `size.width` x `size.height` block by its
 * **anchor** (top-left) cell: an anchor is blocked whenever *any* cell of the
 * block it anchors is blocked or falls off the grid.
 *
 * That makes every node A* expands a placement where the whole block fits,
 * so the search needs no notion of footprints at all. It also keeps diagonal
 * steps honest without any extra rule: the plain corner-cutting check
 * (`generateAdjacentNodes`) demands that the target anchor and both
 * orthogonal-neighbour anchors are free, and a block anchored at the target
 * already covers every cell a diagonal step newly enters (the 3 leading-edge
 * cells of a 2x2 block) — the same cells `CellOccupancySystem` reserves
 * before stepping. A planned step is therefore never one the occupancy
 * system refuses to take.
 *
 * Built as a separable sliding window — a pass along each row, then a pass
 * along each column — so the cost is `O(width * height * (w + h))`, not
 * `O(width * height * w * h)`.
 *
 * Returns `grid` itself for a single cell: the block grid of a 1x1 footprint
 * is the input, unchanged, so single-cell units route exactly as before.
 */
export function blockAnchorGrid(grid: CollisionGrid, size: BlockExtent): CollisionGrid {
  if (isSingleCell(size)) {
    return grid;
  }

  const { width, height, collision } = grid;
  const blockWidth = Math.max(1, size.width);
  const blockHeight = Math.max(1, size.height);

  // Pass 1: a run of `blockWidth` cells starting at each column is blocked
  // when any of them is, or when the run leaves the grid.
  const rows = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const offset = row * width;
    for (let col = 0; col < width; col++) {
      let blocked = col + blockWidth > width;
      for (let dx = 0; dx < blockWidth && !blocked; dx++) {
        blocked = collision[offset + col + dx] !== 0;
      }
      rows[offset + col] = blocked ? 1 : 0;
    }
  }

  // Pass 2: the same down each column, over the row runs.
  const blocks = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let blocked = row + blockHeight > height;
      for (let dy = 0; dy < blockHeight && !blocked; dy++) {
        blocked = rows[(row + dy) * width + col] !== 0;
      }
      blocks[row * width + col] = blocked ? 1 : 0;
    }
  }

  return { width, height, collision: blocks };
}

/**
 * Block grids already built, per terrain grid and then per footprint size.
 * Keyed weakly on the terrain object itself, so a map's grids are collected
 * with the map and nothing needs to be told when a map is replaced.
 */
const terrainBlockGrids = new WeakMap<object, Map<string, CollisionGrid>>();

/**
 * {@link blockAnchorGrid} over a map's *terrain* grid, built once per grid
 * per distinct footprint size and cached.
 *
 * Terrain only changes when the map does, but a move order (and every
 * `?debug=paths` preview frame) would otherwise rebuild a whole-map grid.
 * The cache is keyed on the identity of `grid`, which is therefore assumed
 * immutable for as long as it is in use — true of the upsampled collision
 * grid `createMapNavigation` hands out. Grids that *do* change (the
 * occupancy snapshot, see `OccupancyGrid.asBlockedGridExcluding`) must not
 * go through here.
 *
 * A single-cell footprint skips the cache entirely and returns the grid
 * as-is.
 */
export function terrainBlockGrid(grid: GridLike, size: BlockExtent): CollisionGrid {
  if (isSingleCell(size)) {
    return toCollisionGrid(grid);
  }

  let bySize = terrainBlockGrids.get(grid);
  if (!bySize) {
    bySize = new Map();
    terrainBlockGrids.set(grid, bySize);
  }

  const key = `${size.width}x${size.height}`;
  let blocks = bySize.get(key);
  if (!blocks) {
    blocks = blockAnchorGrid(toCollisionGrid(grid), size);
    bySize.set(key, blocks);
  }
  return blocks;
}
