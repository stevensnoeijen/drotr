import { describe, expect, it } from 'vitest';

import { CELL_SIZE } from '~/lib/grid';
import { planMovePath } from './plan-move-path';

/** World-space centre of cell (`col`, `row`), the placement every unit gets. */
const centre = (col: number, row: number) => ({
  x: col * CELL_SIZE + CELL_SIZE / 2,
  y: row * CELL_SIZE + CELL_SIZE / 2,
});

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

describe('planMovePath', () => {
  const wallWithGap = gridFrom(`
    ....#....
    ....#....
    ....#....
    ....#....
    .........
  `);

  it('routes around a wall, returning world-space cell centres', () => {
    const { status, waypoints } = planMovePath(
      wallWithGap,
      centre(0, 0),
      centre(8, 0),
      CELL_SIZE
    );

    expect(status).toBe('found');
    expect(waypoints).toEqual([
      centre(1, 1),
      centre(2, 2),
      centre(3, 3),
      centre(3, 4),
      centre(4, 4),
      centre(5, 4),
      centre(6, 3),
      centre(7, 2),
      centre(8, 1),
      centre(8, 0),
    ]);
  });

  it('drops the starting cell, since the unit is already standing on it', () => {
    const { waypoints } = planMovePath(
      wallWithGap,
      centre(0, 0),
      centre(8, 0),
      CELL_SIZE
    );

    expect(waypoints).not.toContainEqual(centre(0, 0));
  });

  it('snaps an off-centre order to the destination cell centre', () => {
    const { waypoints } = planMovePath(
      wallWithGap,
      { x: 3, y: 5 },
      { x: 8 * CELL_SIZE + 1, y: 4 * CELL_SIZE + 31 },
      CELL_SIZE
    );

    expect(waypoints.at(-1)).toEqual(centre(8, 4));
  });

  it('returns no waypoints when the unit is already in the destination cell', () => {
    const { status, waypoints } = planMovePath(
      wallWithGap,
      centre(2, 2),
      centre(2, 2),
      CELL_SIZE
    );

    expect(status).toBe('found');
    expect(waypoints).toEqual([]);
  });

  it('reports an unreachable destination with no waypoints', () => {
    const divided = gridFrom(`
      ..#..
      ..#..
      ..#..
      ..#..
      ..#..
    `);

    const { status, waypoints } = planMovePath(
      divided,
      centre(0, 0),
      centre(4, 4),
      CELL_SIZE
    );

    expect(status).toBe('unreachable');
    expect(waypoints).toEqual([]);
  });

  it('converts between world and cells at the grid\'s own cell size', () => {
    // A 40px-tile map: the same wall-with-gap layout, routed in cells of that
    // size, must yield the same cells with 40px centres.
    const cellSize = 40;
    const at = (col: number, row: number) => ({
      x: col * cellSize + cellSize / 2,
      y: row * cellSize + cellSize / 2,
    });

    const { status, waypoints } = planMovePath(wallWithGap, at(0, 0), at(8, 0), cellSize);

    expect(status).toBe('found');
    expect(waypoints).toEqual([
      at(1, 1),
      at(2, 2),
      at(3, 3),
      at(3, 4),
      at(4, 4),
      at(5, 4),
      at(6, 3),
      at(7, 2),
      at(8, 1),
      at(8, 0),
    ]);
  });

  it('walks up to a destination clicked inside a wall', () => {
    const block = gridFrom(`
      .....
      .###.
      .###.
      .###.
      .....
    `);

    const { status, waypoints } = planMovePath(
      block,
      centre(0, 0),
      centre(2, 2),
      CELL_SIZE
    );

    expect(status).toBe('found');
    expect(waypoints.at(-1)).toEqual(centre(2, 0));
  });
});
