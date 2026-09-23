/**
 * Pure chunking and viewport-culling math for the tile layer. A map is cut
 * into fixed-size square chunks of tiles, each drawn in its own container;
 * each frame only the chunks overlapping the camera's view are shown. Kept
 * free of Pixi so the visibility math is unit-testable on its own.
 */

/** Tiles per chunk side: 16x16 = 256 sprites per chunk. */
export const DEFAULT_CHUNK_SIZE = 16;

/** How a map of `mapWidth x mapHeight` tiles divides into chunks. */
export interface ChunkGrid {
  mapWidth: number;
  mapHeight: number;
  /** Tiles per chunk side. */
  chunkSize: number;
  /** Chunks across; the last column may be narrower than `chunkSize`. */
  columns: number;
  /** Chunks down; the last row may be shorter than `chunkSize`. */
  rows: number;
}

export function createChunkGrid(
  mapWidth: number,
  mapHeight: number,
  chunkSize = DEFAULT_CHUNK_SIZE
): ChunkGrid {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError(`Chunk size must be a positive integer, got ${chunkSize}`);
  }
  return {
    mapWidth,
    mapHeight,
    chunkSize,
    columns: Math.ceil(Math.max(0, mapWidth) / chunkSize),
    rows: Math.ceil(Math.max(0, mapHeight) / chunkSize),
  };
}

/** Tile-coordinate bounds of one chunk: `[x0, x1) x [y0, y1)`, clipped to the map. */
export interface ChunkCells {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function chunkCells(grid: ChunkGrid, column: number, row: number): ChunkCells {
  const x0 = column * grid.chunkSize;
  const y0 = row * grid.chunkSize;
  return {
    x0,
    y0,
    x1: Math.min(x0 + grid.chunkSize, grid.mapWidth),
    y1: Math.min(y0 + grid.chunkSize, grid.mapHeight),
  };
}

/** An axis-aligned rectangle in world pixels. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The camera's pan/zoom, as `pixi-viewport` exposes it. */
export interface CameraTransform {
  x: number;
  y: number;
  scale: number;
}

/**
 * The world-space rectangle a camera shows on a `screenWidth x
 * screenHeight` screen. The camera places world point `p` at screen point
 * `p * scale + (x, y)`, so the screen's corners map back through the
 * inverse.
 */
export function visibleWorldRect(
  camera: CameraTransform,
  screenWidth: number,
  screenHeight: number
): WorldRect {
  // `+ 0` folds the -0 an unpanned camera would otherwise produce.
  return {
    x: -camera.x / camera.scale + 0,
    y: -camera.y / camera.scale + 0,
    width: screenWidth / camera.scale,
    height: screenHeight / camera.scale,
  };
}

/** Inclusive range of chunk columns/rows, all within the grid. */
export interface ChunkRange {
  minColumn: number;
  maxColumn: number;
  minRow: number;
  maxRow: number;
}

/**
 * The chunks a world rectangle overlaps, or `undefined` when it overlaps
 * none (entirely off-map, empty, or degenerate). Touching a chunk's edge
 * exactly doesn't count as overlapping it. `margin` (world pixels) grows the
 * rectangle on every side first, so chunks just outside the view are
 * already shown before they scroll in.
 */
export function visibleChunkRange(
  grid: ChunkGrid,
  tileSize: number,
  view: WorldRect,
  margin = 0
): ChunkRange | undefined {
  const chunkPixels = grid.chunkSize * tileSize;
  const left = view.x - margin;
  const top = view.y - margin;
  const right = view.x + view.width + margin;
  const bottom = view.y + view.height + margin;

  if (
    grid.columns === 0 ||
    grid.rows === 0 ||
    !(chunkPixels > 0) ||
    ![left, top, right, bottom].every(Number.isFinite) ||
    right <= left ||
    bottom <= top
  ) {
    return undefined;
  }

  const minColumn = Math.max(0, Math.floor(left / chunkPixels));
  const minRow = Math.max(0, Math.floor(top / chunkPixels));
  // Exclusive right/bottom edges: a view ending exactly on a chunk
  // boundary doesn't reach into the next chunk.
  const maxColumn = Math.min(grid.columns - 1, Math.ceil(right / chunkPixels) - 1);
  const maxRow = Math.min(grid.rows - 1, Math.ceil(bottom / chunkPixels) - 1);

  if (minColumn > maxColumn || minRow > maxRow) {
    return undefined;
  }
  return { minColumn, maxColumn, minRow, maxRow };
}

/** Whether a chunk falls inside a (possibly empty) visible range. */
export function isChunkVisible(
  range: ChunkRange | undefined,
  column: number,
  row: number
): boolean {
  return (
    range !== undefined &&
    column >= range.minColumn &&
    column <= range.maxColumn &&
    row >= range.minRow &&
    row <= range.maxRow
  );
}

export function chunkRangesEqual(
  a: ChunkRange | undefined,
  b: ChunkRange | undefined
): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return (
    a.minColumn === b.minColumn &&
    a.maxColumn === b.maxColumn &&
    a.minRow === b.minRow &&
    a.maxRow === b.maxRow
  );
}
