import { describe, expect, it } from 'vitest';

import { DEFAULT_CELL_SIZE } from '~/lib/grid';
import { isWalkable } from '~/lib/navigation/astar';
import { blockAnchorGrid } from './block-grid';
import { anchorCellAt, footprintCentre } from './footprint';
import { OccupancyGrid } from './occupancy-grid';
import { planMovePath } from './plan-move-path';

/** World-space centre of cell (`col`, `row`), the placement every unit gets. */
const centre = (col: number, row: number) => ({
  x: col * DEFAULT_CELL_SIZE + DEFAULT_CELL_SIZE / 2,
  y: row * DEFAULT_CELL_SIZE + DEFAULT_CELL_SIZE / 2,
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
      DEFAULT_CELL_SIZE
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
      DEFAULT_CELL_SIZE
    );

    expect(waypoints).not.toContainEqual(centre(0, 0));
  });

  it('snaps an off-centre order to the destination cell centre', () => {
    const { waypoints } = planMovePath(
      wallWithGap,
      { x: 3, y: 5 },
      { x: 8 * DEFAULT_CELL_SIZE + 1, y: 5 * DEFAULT_CELL_SIZE - 1 },
      DEFAULT_CELL_SIZE
    );

    expect(waypoints.at(-1)).toEqual(centre(8, 4));
  });

  it('returns no waypoints when the unit is already in the destination cell', () => {
    const { status, waypoints } = planMovePath(
      wallWithGap,
      centre(2, 2),
      centre(2, 2),
      DEFAULT_CELL_SIZE
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
      DEFAULT_CELL_SIZE
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
      DEFAULT_CELL_SIZE
    );

    expect(status).toBe('found');
    expect(waypoints.at(-1)).toEqual(centre(2, 0));
  });
});

describe('planMovePath for a multi-cell footprint', () => {
  const CELL = DEFAULT_CELL_SIZE;
  const TWO_BY_TWO = { width: 2, height: 2 };

  /** World-space centre of the block anchored (top-left) at (`col`, `row`). */
  const blockAt = (col: number, row: number, size = TWO_BY_TWO) =>
    footprintCentre(col, row, size, CELL);

  /** Plans a route for a `size` block over `terrain`'s block grid. */
  const plan = (
    terrain: ReturnType<typeof gridFrom>,
    from: { col: number; row: number },
    to: { col: number; row: number },
    size = TWO_BY_TWO
  ) =>
    planMovePath(
      blockAnchorGrid(terrain, size),
      blockAt(from.col, from.row, size),
      blockAt(to.col, to.row, size),
      CELL,
      size
    );

  /** Every cell of the block centred at each waypoint, as `col,row` strings. */
  const cellsCovered = (waypoints: { x: number; y: number }[], size = TWO_BY_TWO) =>
    waypoints.flatMap((waypoint) => {
      const anchor = anchorCellAt(waypoint.x, waypoint.y, size, CELL);
      return Array.from({ length: size.width * size.height }, (_, i) => ({
        x: anchor.x + (i % size.width),
        y: anchor.y + Math.floor(i / size.width),
      }));
    });

  it('routes a 2x2 block through the two-cell-wide detour, not the one-cell gap', () => {
    // A one-cell gap at row 2 and a two-cell-wide one at rows 5-6.
    const terrain = gridFrom(`
      ....#....
      ....#....
      .........
      ....#....
      ....#....
      .........
      .........
      ....#....
    `);

    const { status, waypoints } = plan(terrain, { col: 0, row: 2 }, { col: 6, row: 2 });

    expect(status).toBe('found');
    expect(waypoints.at(-1)).toEqual(blockAt(6, 2));
    expect(cellsCovered(waypoints).every(({ x, y }) => isWalkable(terrain, x, y))).toBe(true);
    // It crossed the wall column through the wide gap...
    const crossing = waypoints.filter((w) => anchorCellAt(w.x, w.y, TWO_BY_TWO, CELL).x === 3);
    expect(crossing.length).toBeGreaterThan(0);
    expect(crossing.every((w) => anchorCellAt(w.x, w.y, TWO_BY_TWO, CELL).y >= 5)).toBe(true);
    // ...whereas a single cell takes the narrow gap, the shorter way.
    const single = planMovePath(terrain, centre(0, 2), centre(6, 2), CELL);
    expect(single.waypoints).toContainEqual(centre(4, 2));
  });

  it("is unreachable when no gap fits the block, though a single cell gets through", () => {
    const terrain = gridFrom(`
      ....#....
      ....#....
      .........
      ....#....
      ....#....
    `);

    const wide = plan(terrain, { col: 0, row: 0 }, { col: 6, row: 0 });
    expect(wide).toEqual({ status: 'unreachable', waypoints: [] });

    const single = planMovePath(terrain, centre(0, 0), centre(6, 0), CELL);
    expect(single.status).toBe('found');
  });

  it('does not squeeze a 2x2 block diagonally between two blocked cells', () => {
    // Two open chambers that only touch corner to corner.
    const terrain = gridFrom(`
      ....####
      ....####
      ....####
      ....####
      ####....
      ####....
      ####....
      ####....
    `);

    const { status, waypoints } = plan(terrain, { col: 0, row: 0 }, { col: 6, row: 6 });

    expect(status).toBe('unreachable');
    expect(waypoints).toEqual([]);
  });

  it('still steps diagonally through open ground', () => {
    const terrain = gridFrom(`
      ......
      ......
      ......
      ......
      ......
      ......
    `);

    const { status, waypoints } = plan(terrain, { col: 0, row: 0 }, { col: 4, row: 4 });

    expect(status).toBe('found');
    expect(waypoints).toEqual([blockAt(1, 1), blockAt(2, 2), blockAt(3, 3), blockAt(4, 4)]);
  });

  it('relocates a blocked destination to a placement where the whole block is walkable', () => {
    const terrain = gridFrom(`
      ........
      ...###..
      ...###..
      ...###..
      ........
      ........
    `);

    // Anchor (4, 2) is inside the wall.
    const { status, waypoints } = plan(terrain, { col: 0, row: 4 }, { col: 4, row: 2 });

    expect(status).toBe('found');
    const end = anchorCellAt(waypoints.at(-1)!.x, waypoints.at(-1)!.y, TWO_BY_TWO, CELL);
    expect(cellsCovered([waypoints.at(-1)!]).every(({ x, y }) => isWalkable(terrain, x, y))).toBe(true);
    // Two cells from the requested anchor, the nearest a 2x2 block fits.
    expect(['6,2', '4,4']).toContain(`${end.x},${end.y}`);
  });

  it('routes a non-square footprint by its own width and height', () => {
    const cannon = { width: 1, height: 2 };
    // The gap through the wall is one row tall: a block two cells tall (the
    // cannon's 1x2) cannot pass it, however narrow it is the other way.
    const terrain = gridFrom(`
      ....#....
      ....#....
      .........
      ....#....
      ....#....
    `);

    expect(plan(terrain, { col: 0, row: 0 }, { col: 6, row: 0 }, cannon).status).toBe(
      'unreachable'
    );
    expect(plan(terrain, { col: 0, row: 1 }, { col: 6, row: 1 }, cannon).status).toBe(
      'unreachable'
    );
    // A 2x1 block, on the other hand, passes the one-row gap.
    const wide = { width: 2, height: 1 };
    expect(plan(terrain, { col: 0, row: 2 }, { col: 6, row: 2 }, wide).status).toBe('found');
  });

  describe('never plans a step the occupancy system would refuse', () => {
    /** Small deterministic PRNG, so a failing layout is reproducible. */
    const random = (seed: number) => () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const SIZES = [TWO_BY_TWO, { width: 1, height: 2 }, { width: 2, height: 1 }, { width: 3, height: 2 }];

    it.each(SIZES)('for a %o block on random terrain', (size) => {
      const next = random(size.width * 31 + size.height);
      const width = 14;
      const height = 12;
      let checkedSteps = 0;

      for (let layout = 0; layout < 40; layout++) {
        const collision = new Uint8Array(width * height);
        for (let i = 0; i < collision.length; i++) {
          collision[i] = next() < 0.22 ? 1 : 0;
        }
        const terrain = { width, height, collision };
        const occupancy = new OccupancyGrid(terrain, CELL);
        const blocks = blockAnchorGrid(terrain, size);

        const freeAnchors: { col: number; row: number }[] = [];
        for (let row = 0; row < height; row++) {
          for (let col = 0; col < width; col++) {
            if (isWalkable(blocks, col, row)) {
              freeAnchors.push({ col, row });
            }
          }
        }
        if (freeAnchors.length < 2) {
          continue;
        }

        for (let attempt = 0; attempt < 6; attempt++) {
          const from = freeAnchors[Math.floor(next() * freeAnchors.length)];
          const to = freeAnchors[Math.floor(next() * freeAnchors.length)];
          const { status, waypoints } = plan(terrain, from, to, size);
          if (status !== 'found') {
            continue;
          }

          let previous = from;
          for (const waypoint of waypoints) {
            const anchor = anchorCellAt(waypoint.x, waypoint.y, size, CELL);
            const dx = anchor.x - previous.col;
            const dy = anchor.y - previous.row;
            expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(1);

            // The whole block at the new anchor is free: for a diagonal that
            // includes the 3 (2x2) leading-edge cells the occupancy system
            // reserves before stepping.
            expect(occupancy.isBlockAvailableFor(occupancy.indexOf(anchor.x, anchor.y), size, 1)).toBe(true);
            if (dx !== 0 && dy !== 0) {
              // And the planner never clips a corner either: both blocks the
              // diagonal passes between are free too.
              for (const [col, row] of [
                [previous.col + dx, previous.row],
                [previous.col, previous.row + dy],
              ]) {
                expect(occupancy.isBlockAvailableFor(occupancy.indexOf(col, row), size, 1)).toBe(true);
              }
            }
            previous = { col: anchor.x, row: anchor.y };
            checkedSteps++;
          }
        }
      }

      expect(checkedSteps).toBeGreaterThan(50);
    });
  });
});
