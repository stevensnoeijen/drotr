import { describe, expect, it } from 'vitest';

import {
  chunkCells,
  chunkRangesEqual,
  createChunkGrid,
  isChunkVisible,
  visibleChunkRange,
  visibleWorldRect,
} from './tile-chunks';

describe('createChunkGrid', () => {
  it('divides the map evenly when it is a multiple of the chunk size', () => {
    expect(createChunkGrid(64, 64, 16)).toMatchObject({ columns: 4, rows: 4 });
  });

  it('rounds up so a partial last chunk still covers the map edge', () => {
    // A 20x20 map in 16-tile chunks, and a 128x100 one.
    expect(createChunkGrid(20, 20, 16)).toMatchObject({ columns: 2, rows: 2 });
    expect(createChunkGrid(128, 100, 16)).toMatchObject({ columns: 8, rows: 7 });
  });

  it('gives an empty map no chunks', () => {
    expect(createChunkGrid(0, 0, 16)).toMatchObject({ columns: 0, rows: 0 });
  });

  it('rejects a non-positive or fractional chunk size', () => {
    expect(() => createChunkGrid(10, 10, 0)).toThrow(RangeError);
    expect(() => createChunkGrid(10, 10, 2.5)).toThrow(RangeError);
  });
});

describe('chunkCells', () => {
  it('returns a full chunk’s tile bounds, end-exclusive', () => {
    expect(chunkCells(createChunkGrid(64, 64, 16), 1, 2)).toEqual({ x0: 16, y0: 32, x1: 32, y1: 48 });
  });

  it('clips the last chunk to the map edge', () => {
    expect(chunkCells(createChunkGrid(20, 18, 16), 1, 1)).toEqual({ x0: 16, y0: 16, x1: 20, y1: 18 });
  });
});

describe('visibleWorldRect', () => {
  it('is the screen itself at the identity camera', () => {
    expect(visibleWorldRect({ x: 0, y: 0, scale: 1 }, 800, 600)).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it('inverts pan and zoom', () => {
    // Panned so world (100, 50) sits at the screen's top-left, zoomed 2x.
    expect(visibleWorldRect({ x: -200, y: -100, scale: 2 }, 800, 600)).toEqual({
      x: 100,
      y: 50,
      width: 400,
      height: 300,
    });
  });
});

describe('visibleChunkRange', () => {
  // 64x64 tiles of 32px, 16-tile chunks: each chunk is 512px, 4x4 chunks.
  const grid = createChunkGrid(64, 64, 16);
  const tile = 32;

  it('covers only the chunks overlapping the view', () => {
    expect(visibleChunkRange(grid, tile, { x: 0, y: 0, width: 800, height: 600 })).toEqual({
      minColumn: 0,
      maxColumn: 1,
      minRow: 0,
      maxRow: 1,
    });
  });

  it('does not count a view ending exactly on a chunk boundary as reaching the next chunk', () => {
    expect(visibleChunkRange(grid, tile, { x: 0, y: 0, width: 512, height: 512 })).toEqual({
      minColumn: 0,
      maxColumn: 0,
      minRow: 0,
      maxRow: 0,
    });
  });

  it('clamps a view larger than the map to the whole grid', () => {
    expect(visibleChunkRange(grid, tile, { x: -1000, y: -1000, width: 1e5, height: 1e5 })).toEqual({
      minColumn: 0,
      maxColumn: 3,
      minRow: 0,
      maxRow: 3,
    });
  });

  it('handles a view straddling the middle of the map', () => {
    expect(visibleChunkRange(grid, tile, { x: 600, y: 1100, width: 500, height: 10 })).toEqual({
      minColumn: 1,
      maxColumn: 2,
      minRow: 2,
      maxRow: 2,
    });
  });

  it('is empty for a view entirely off the map', () => {
    expect(visibleChunkRange(grid, tile, { x: 5000, y: 0, width: 100, height: 100 })).toBeUndefined();
    expect(visibleChunkRange(grid, tile, { x: -200, y: -200, width: 100, height: 100 })).toBeUndefined();
  });

  it('is empty for a degenerate view or an empty grid', () => {
    expect(visibleChunkRange(grid, tile, { x: 0, y: 0, width: 0, height: 100 })).toBeUndefined();
    expect(visibleChunkRange(grid, tile, { x: Number.NaN, y: 0, width: 10, height: 10 })).toBeUndefined();
    expect(visibleChunkRange(createChunkGrid(0, 0), tile, { x: 0, y: 0, width: 10, height: 10 })).toBeUndefined();
  });

  it('grows the view by the margin on every side', () => {
    const view = { x: 600, y: 600, width: 300, height: 300 };
    expect(visibleChunkRange(grid, tile, view)).toEqual({
      minColumn: 1,
      maxColumn: 1,
      minRow: 1,
      maxRow: 1,
    });
    expect(visibleChunkRange(grid, tile, view, 200)).toEqual({
      minColumn: 0,
      maxColumn: 2,
      minRow: 0,
      maxRow: 2,
    });
  });

  it('works end to end from a camera transform on a full-size county map', () => {
    // 128x128 tiles of 40px (5120px square), zoomed 2x, looking at the centre.
    const county = createChunkGrid(128, 128, 16);
    const view = visibleWorldRect({ x: -5120 + 640, y: -5120 + 360, scale: 2 }, 1280, 720);
    const range = visibleChunkRange(county, 40, view)!;

    // 640x360 world px around (2560, 2560): chunks are 640px wide.
    expect(range).toEqual({ minColumn: 3, maxColumn: 4, minRow: 3, maxRow: 4 });
    const visibleChunks = (range.maxColumn - range.minColumn + 1) * (range.maxRow - range.minRow + 1);
    expect(visibleChunks).toBeLessThan(county.columns * county.rows);
  });
});

describe('isChunkVisible / chunkRangesEqual', () => {
  const range = { minColumn: 1, maxColumn: 2, minRow: 0, maxRow: 0 };

  it('tests membership inclusively', () => {
    expect(isChunkVisible(range, 1, 0)).toBe(true);
    expect(isChunkVisible(range, 2, 0)).toBe(true);
    expect(isChunkVisible(range, 3, 0)).toBe(false);
    expect(isChunkVisible(range, 1, 1)).toBe(false);
    expect(isChunkVisible(undefined, 0, 0)).toBe(false);
  });

  it('compares ranges by value, treating two empty ranges as equal', () => {
    expect(chunkRangesEqual(range, { ...range })).toBe(true);
    expect(chunkRangesEqual(range, { ...range, maxRow: 1 })).toBe(false);
    expect(chunkRangesEqual(undefined, undefined)).toBe(true);
    expect(chunkRangesEqual(range, undefined)).toBe(false);
  });
});
