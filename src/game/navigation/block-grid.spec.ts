import { describe, expect, it } from 'vitest';

import { blockAnchorGrid, terrainBlockGrid } from './block-grid';

const ONE = { width: 1, height: 1 };
const TWO_BY_TWO = { width: 2, height: 2 };
const ONE_BY_TWO = { width: 1, height: 2 };

/** A collision grid in the exact shape a loaded map exposes. */
const gridFrom = (art: string) => {
  const rows = art
    .trim()
    .split('\n')
    .map((line) => [...line.trim()]);
  const width = rows[0].length;
  const collision = new Uint8Array(width * rows.length);
  rows.forEach((row, y) =>
    row.forEach((cell, x) => {
      collision[y * width + x] = cell === '#' ? 1 : 0;
    })
  );

  return { width, height: rows.length, collision };
};

/** Renders a grid back to art, so expectations read as pictures. */
const artOf = (grid: { width: number; height: number; collision: Uint8Array }) =>
  Array.from({ length: grid.height }, (_, y) =>
    Array.from({ length: grid.width }, (_, x) => (grid.collision[y * grid.width + x] ? '#' : '.')).join('')
  );

describe('blockAnchorGrid', () => {
  it('returns the very same grid for a single cell', () => {
    const grid = gridFrom(`
      ..#
      ...
    `);

    expect(blockAnchorGrid(grid, ONE)).toBe(grid);
  });

  it('blocks an anchor when any cell of its block is terrain', () => {
    const grid = gridFrom(`
      .....
      ..#..
      .....
      .....
    `);

    expect(artOf(blockAnchorGrid(grid, TWO_BY_TWO))).toEqual([
      '.##.#',
      '.##.#',
      '....#',
      '#####',
    ]);
  });

  it('blocks an anchor whose block hangs off the right or bottom edge', () => {
    const grid = gridFrom(`
      ...
      ...
      ...
    `);

    expect(artOf(blockAnchorGrid(grid, TWO_BY_TWO))).toEqual(['..#', '..#', '###']);
  });

  it('handles a non-square footprint on each axis independently', () => {
    const grid = gridFrom(`
      ....
      .#..
      ....
    `);

    // 1 wide x 2 tall: each anchor needs itself and the cell below.
    expect(artOf(blockAnchorGrid(grid, ONE_BY_TWO))).toEqual(['.#..', '.#..', '####']);
    // 2 wide x 1 tall: each anchor needs itself and the cell to the right.
    expect(artOf(blockAnchorGrid(grid, { width: 2, height: 1 }))).toEqual(['...#', '##.#', '...#']);
  });

  it('blocks every anchor of a grid smaller than the footprint', () => {
    expect(artOf(blockAnchorGrid(gridFrom('.'), TWO_BY_TWO))).toEqual(['#']);
  });

  it('leaves its input untouched', () => {
    const grid = gridFrom(`
      ..#
      ...
    `);
    const before = Array.from(grid.collision);

    blockAnchorGrid(grid, TWO_BY_TWO);

    expect(Array.from(grid.collision)).toEqual(before);
  });
});

describe('terrainBlockGrid', () => {
  const terrain = gridFrom(`
    ....
    .#..
    ....
    ....
  `);

  it('matches blockAnchorGrid', () => {
    expect(terrainBlockGrid(terrain, TWO_BY_TWO)).toEqual(blockAnchorGrid(terrain, TWO_BY_TWO));
  });

  it('builds a footprint size once per terrain grid, and keeps sizes apart', () => {
    const first = terrainBlockGrid(terrain, TWO_BY_TWO);

    expect(terrainBlockGrid(terrain, { width: 2, height: 2 })).toBe(first);
    expect(terrainBlockGrid(terrain, ONE_BY_TWO)).not.toBe(first);
    expect(terrainBlockGrid(gridFrom('....'), TWO_BY_TWO)).not.toBe(first);
  });

  it('returns the terrain itself for a single cell', () => {
    expect(terrainBlockGrid(terrain, ONE)).toBe(terrain);
  });

  it('accepts the nested-array grid form', () => {
    const rows = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];

    expect(artOf(terrainBlockGrid(rows, TWO_BY_TWO))).toEqual(['###', '###', '###']);
    expect(terrainBlockGrid(rows, TWO_BY_TWO)).toBe(terrainBlockGrid(rows, TWO_BY_TWO));
  });
});
