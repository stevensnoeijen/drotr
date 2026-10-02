import { describe, expect, it } from 'vitest';

import { DEFAULT_CELL_SIZE } from '~/lib/grid';
import {
  findNearestAvailableCell,
  NO_CELL,
  NO_OCCUPANT,
  OccupancyGrid,
} from './occupancy-grid';

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

const open = () =>
  new OccupancyGrid(
    gridFrom(`
      .....
      .....
      .....
      .....
      .....
    `),
    DEFAULT_CELL_SIZE
  );

describe('OccupancyGrid', () => {
  describe('indexing', () => {
    it('indexes row-major, matching the terrain collision buffer', () => {
      const grid = open();

      expect(grid.indexOf(2, 3)).toBe(3 * 5 + 2);
    });

    it('rejects out-of-bounds cells rather than aliasing them onto real ones', () => {
      const grid = open();

      expect(grid.indexOf(-1, 0)).toBe(NO_CELL);
      expect(grid.indexOf(0, -1)).toBe(NO_CELL);
      expect(grid.indexOf(5, 0)).toBe(NO_CELL);
      expect(grid.indexOf(0, 5)).toBe(NO_CELL);
    });

    it('maps a world position to the cell it falls in', () => {
      const grid = open();

      expect(grid.indexAt({ x: 0, y: 0 })).toBe(grid.indexOf(0, 0));
      expect(grid.indexAt({ x: DEFAULT_CELL_SIZE * 2.5, y: DEFAULT_CELL_SIZE * 1.5 })).toBe(grid.indexOf(2, 1));
      // The boundary belongs to the cell it opens, not the one it closes.
      expect(grid.indexAt({ x: DEFAULT_CELL_SIZE, y: 0 })).toBe(grid.indexOf(1, 0));
    });

    it('maps a negative world position off the grid rather than into the wrong cell', () => {
      const grid = open();

      expect(grid.indexAt({ x: -1, y: 0 })).toBe(NO_CELL);
    });

    it('round-trips a cell index back to the world centre of that cell', () => {
      const grid = open();
      const centre = grid.centreOf(grid.indexOf(3, 2));

      expect(centre).toEqual({ x: 3 * DEFAULT_CELL_SIZE + DEFAULT_CELL_SIZE / 2, y: 2 * DEFAULT_CELL_SIZE + DEFAULT_CELL_SIZE / 2 });
      expect(grid.indexAt(centre)).toBe(grid.indexOf(3, 2));
    });

    it('measures world positions in cells of its own cell size', () => {
      // A map whose tiles aren't the default size: the occupancy grid layers
      // over that map's own tile grid, so cells are that big too.
      const grid = new OccupancyGrid(gridFrom(`....\n....`), 40);

      expect(grid.cellSize).toBe(40);
      expect(grid.indexAt({ x: 39, y: 39 })).toBe(grid.indexOf(0, 0));
      expect(grid.indexAt({ x: 40, y: 40 })).toBe(grid.indexOf(1, 1));
      expect(grid.centreOf(grid.indexOf(3, 1))).toEqual({ x: 140, y: 60 });
    });

    it('decodes a row-major index back to its (col, row)', () => {
      const grid = open();

      expect(grid.colRowOf(grid.indexOf(3, 2))).toEqual({ x: 3, y: 2 });
    });

    it('has no (col, row) for NO_CELL', () => {
      const grid = open();

      expect(grid.colRowOf(NO_CELL)).toBeUndefined();
    });
  });

  describe('reservations', () => {
    it('starts with every cell unoccupied', () => {
      const grid = open();

      expect(grid.occupantAt(grid.indexOf(0, 0))).toBe(NO_OCCUPANT);
      expect(grid.isAvailableFor(grid.indexOf(0, 0), 1)).toBe(true);
    });

    it('hands out distinct occupant ids', () => {
      const grid = open();

      expect(grid.claimOccupantId()).not.toBe(grid.claimOccupantId());
    });

    it('never mints NO_OCCUPANT as a real occupant id', () => {
      const grid = open();

      expect(grid.claimOccupantId()).not.toBe(NO_OCCUPANT);
    });

    it('makes a reserved cell unavailable to everyone else', () => {
      const grid = open();
      const cell = grid.indexOf(1, 1);

      expect(grid.reserve(cell, 1)).toBe(true);

      expect(grid.occupantAt(cell)).toBe(1);
      expect(grid.isAvailableFor(cell, 2)).toBe(false);
      expect(grid.reserve(cell, 2)).toBe(false);
      // ...and still belongs to the unit that took it.
      expect(grid.occupantAt(cell)).toBe(1);
    });

    it('leaves a cell available to the unit already holding it', () => {
      const grid = open();
      const cell = grid.indexOf(1, 1);
      grid.reserve(cell, 1);

      expect(grid.isAvailableFor(cell, 1)).toBe(true);
      expect(grid.reserve(cell, 1)).toBe(true);
    });

    it('frees a released cell for the next unit', () => {
      const grid = open();
      const cell = grid.indexOf(1, 1);
      grid.reserve(cell, 1);

      grid.release(cell, 1);

      expect(grid.occupantAt(cell)).toBe(NO_OCCUPANT);
      expect(grid.reserve(cell, 2)).toBe(true);
    });

    it('will not let one unit release another unit\'s cell', () => {
      const grid = open();
      const cell = grid.indexOf(1, 1);
      grid.reserve(cell, 1);

      grid.release(cell, 2);

      expect(grid.occupantAt(cell)).toBe(1);
    });

    it('refuses reservations outside the grid', () => {
      const grid = open();

      expect(grid.reserve(NO_CELL, 1)).toBe(false);
      expect(grid.isAvailableFor(NO_CELL, 1)).toBe(false);
      expect(() => grid.release(NO_CELL, 1)).not.toThrow();
    });

    it('drops every claim on clear, leaving terrain intact', () => {
      const grid = new OccupancyGrid(gridFrom(`.#.`), DEFAULT_CELL_SIZE);
      grid.reserve(grid.indexOf(0, 0), 1);

      grid.clear();

      expect(grid.occupantAt(grid.indexOf(0, 0))).toBe(NO_OCCUPANT);
      expect(grid.isTerrainBlocked(grid.indexOf(1, 0))).toBe(true);
    });
  });

  describe('terrain', () => {
    const walled = () =>
      new OccupancyGrid(
        gridFrom(`
          ...
          .#.
          ...
        `),
        DEFAULT_CELL_SIZE
      );

    it('never offers a terrain-blocked cell, however empty it is of units', () => {
      const grid = walled();
      const wall = grid.indexOf(1, 1);

      expect(grid.occupantAt(wall)).toBe(NO_OCCUPANT);
      expect(grid.isTerrainBlocked(wall)).toBe(true);
      expect(grid.isAvailableFor(wall, 1)).toBe(false);
      expect(grid.reserve(wall, 1)).toBe(false);
    });

    it('treats off-grid cells as blocked', () => {
      const grid = walled();

      expect(grid.isTerrainBlocked(NO_CELL)).toBe(true);
    });

    it('shares the map\'s collision buffer rather than copying it', () => {
      const map = gridFrom(`
        ...
        ...
      `);
      const grid = new OccupancyGrid(map, DEFAULT_CELL_SIZE);

      map.collision[grid.indexOf(1, 0)] = 1;

      expect(grid.isTerrainBlocked(grid.indexOf(1, 0))).toBe(true);
    });
  });

  describe('blocks (multi-cell footprints)', () => {
  it('lists every cell of a rectangle anchored at a given cell', () => {
    const grid = open();

    expect(grid.blockCells(grid.indexOf(1, 1), { width: 2, height: 2 })).toEqual([
      grid.indexOf(1, 1),
      grid.indexOf(2, 1),
      grid.indexOf(1, 2),
      grid.indexOf(2, 2),
    ]);
    expect(grid.blockCells(grid.indexOf(1, 1), { width: 1, height: 2 })).toEqual([
      grid.indexOf(1, 1),
      grid.indexOf(1, 2),
    ]);
  });

  it('refuses a block that would fall off the grid', () => {
    const grid = open();

    expect(grid.blockCells(grid.indexOf(4, 4), { width: 2, height: 2 })).toBeUndefined();
  });

  it('reserves every cell of a 2x2 block atomically', () => {
    const grid = open();
    const anchor = grid.indexOf(1, 1);

    expect(grid.reserveBlock(anchor, { width: 2, height: 2 }, 1)).toBe(true);

    for (const cell of [grid.indexOf(1, 1), grid.indexOf(2, 1), grid.indexOf(1, 2), grid.indexOf(2, 2)]) {
      expect(grid.occupantAt(cell)).toBe(1);
    }
  });

  it('leaves the whole grid unchanged when a 2x2 claim hits one occupied cell', () => {
    const grid = open();
    const anchor = grid.indexOf(1, 1);
    // One of the four cells the block would need is already someone else's.
    grid.reserve(grid.indexOf(2, 2), 9);

    expect(grid.reserveBlock(anchor, { width: 2, height: 2 }, 1)).toBe(false);

    for (const cell of [grid.indexOf(1, 1), grid.indexOf(2, 1), grid.indexOf(1, 2)]) {
      expect(grid.occupantAt(cell)).toBe(NO_OCCUPANT);
    }
    expect(grid.occupantAt(grid.indexOf(2, 2))).toBe(9);
  });

  it('never reserves a block that would fall off the grid', () => {
    const grid = open();

    expect(grid.reserveBlock(grid.indexOf(4, 4), { width: 2, height: 2 }, 1)).toBe(false);
  });

  it('releases exactly the cells a block holds, and nothing another unit holds', () => {
    const grid = open();
    const size = { width: 2, height: 2 };
    grid.reserveBlock(grid.indexOf(1, 1), size, 1);
    grid.reserve(grid.indexOf(3, 1), 9);

    grid.releaseBlock(grid.indexOf(1, 1), size, 1);

    for (const cell of [grid.indexOf(1, 1), grid.indexOf(2, 1), grid.indexOf(1, 2), grid.indexOf(2, 2)]) {
      expect(grid.occupantAt(cell)).toBe(NO_OCCUPANT);
    }
    expect(grid.occupantAt(grid.indexOf(3, 1))).toBe(9);
  });

  it('keeps cells shared with the block being kept when releasing', () => {
    const grid = open();
    const size = { width: 2, height: 2 };
    grid.reserveBlock(grid.indexOf(1, 1), size, 1);
    // Stepping one cell right: the new block overlaps two of the old one's cells.
    grid.reserveBlock(grid.indexOf(2, 1), size, 1);

    grid.releaseBlock(grid.indexOf(1, 1), size, 1, grid.indexOf(2, 1));

    // Cells only the old block held are freed...
    expect(grid.occupantAt(grid.indexOf(1, 1))).toBe(NO_OCCUPANT);
    expect(grid.occupantAt(grid.indexOf(1, 2))).toBe(NO_OCCUPANT);
    // ...but the two shared with the kept (new) block stay held.
    expect(grid.occupantAt(grid.indexOf(2, 1))).toBe(1);
    expect(grid.occupantAt(grid.indexOf(2, 2))).toBe(1);
  });

  it('a block is only available while every one of its cells is', () => {
    const grid = open();
    grid.reserve(grid.indexOf(2, 2), 9);

    expect(grid.isBlockAvailableFor(grid.indexOf(1, 1), { width: 2, height: 2 }, 1)).toBe(false);
    expect(grid.isBlockAvailableFor(grid.indexOf(3, 1), { width: 2, height: 2 }, 1)).toBe(true);
  });

  it('treats a block already held entirely by the same occupant as available', () => {
    const grid = open();
    const size = { width: 2, height: 2 };
    grid.reserveBlock(grid.indexOf(1, 1), size, 1);

    expect(grid.isBlockAvailableFor(grid.indexOf(1, 1), size, 1)).toBe(true);
    expect(grid.reserveBlock(grid.indexOf(1, 1), size, 1)).toBe(true);
  });
});

describe('asBlockedGridExcluding', () => {
  it('blocks every cell of another occupant\'s multi-cell footprint', () => {
    const grid = open();
    grid.reserveBlock(grid.indexOf(2, 2), { width: 2, height: 2 }, 7);

    const snapshot = grid.asBlockedGridExcluding(1);

    for (const cell of [grid.indexOf(2, 2), grid.indexOf(3, 2), grid.indexOf(2, 3), grid.indexOf(3, 3)]) {
      expect(snapshot.collision[cell]).toBe(1);
    }
  });

    it('blocks a cell held by another occupant', () => {
      const grid = open();
      const other = grid.indexOf(2, 2);
      grid.reserve(other, 7);

      const snapshot = grid.asBlockedGridExcluding(1);

      expect(snapshot.collision[other]).toBe(1);
    });

    it('leaves the excluded occupant\'s own cell open', () => {
      const grid = open();
      const own = grid.indexOf(2, 2);
      grid.reserve(own, 1);

      const snapshot = grid.asBlockedGridExcluding(1);

      expect(snapshot.collision[own]).toBe(0);
    });

    it('carries terrain blocking over unchanged', () => {
      const grid = new OccupancyGrid(
        gridFrom(`
          ...
          .#.
          ...
        `),
        DEFAULT_CELL_SIZE
      );

      const snapshot = grid.asBlockedGridExcluding(1);

      expect(snapshot.collision[grid.indexOf(1, 1)]).toBe(1);
    });

    it('leaves the live grid\'s own occupants untouched', () => {
      const grid = open();
      const held = grid.indexOf(0, 0);
      grid.reserve(held, 3);

      grid.asBlockedGridExcluding(1);

      expect(grid.occupantAt(held)).toBe(3);
    });
  });
});

describe('asBlockedGridExcluding for a multi-cell footprint', () => {
  const TWO_BY_TWO = { width: 2, height: 2 };

  /** The snapshot rendered as art, so expectations read as pictures. */
  const artOf = (snapshot: { width: number; height: number; collision: Uint8Array }) =>
    Array.from({ length: snapshot.height }, (_, y) =>
      Array.from({ length: snapshot.width }, (_, x) =>
        snapshot.collision[y * snapshot.width + x] ? '#' : '.'
      ).join('')
    );

  it('is the plain snapshot for a single cell', () => {
    const grid = open();
    grid.reserve(grid.indexOf(2, 2), 7);

    expect(artOf(grid.asBlockedGridExcluding(1, { width: 1, height: 1 }))).toEqual(
      artOf(grid.asBlockedGridExcluding(1))
    );
  });

  it('blocks an anchor when its block would hang off the grid', () => {
    expect(artOf(open().asBlockedGridExcluding(1, TWO_BY_TWO))).toEqual([
      '....#',
      '....#',
      '....#',
      '....#',
      '#####',
    ]);
  });

  it('blocks an anchor when any cell of its block is terrain', () => {
    const grid = new OccupancyGrid(
      gridFrom(`
        .....
        .....
        ..#..
        .....
        .....
      `),
      DEFAULT_CELL_SIZE
    );

    expect(artOf(grid.asBlockedGridExcluding(1, TWO_BY_TWO))).toEqual([
      '....#',
      '.##.#',
      '.##.#',
      '....#',
      '#####',
    ]);
  });

  it('blocks every anchor whose block would overlap another unit', () => {
    const grid = open();
    grid.reserve(grid.indexOf(2, 2), 7);

    expect(artOf(grid.asBlockedGridExcluding(1, TWO_BY_TWO))).toEqual([
      '....#',
      '.##.#',
      '.##.#',
      '....#',
      '#####',
    ]);
  });

  it('blocks anchors for a unit held in a corner without wrapping rows', () => {
    const grid = open();
    grid.reserve(grid.indexOf(0, 1), 7);

    expect(artOf(grid.asBlockedGridExcluding(1, TWO_BY_TWO))).toEqual([
      '#...#',
      '#...#',
      '....#',
      '....#',
      '#####',
    ]);
  });

  it("never counts the excluded unit's own block against it", () => {
    const grid = open();
    grid.reserveBlock(grid.indexOf(1, 1), TWO_BY_TWO, 1);

    expect(artOf(grid.asBlockedGridExcluding(1, TWO_BY_TWO))).toEqual(
      artOf(open().asBlockedGridExcluding(1, TWO_BY_TWO))
    );
  });

  it('leaves the cached terrain block grid untouched by a later snapshot', () => {
    const grid = open();
    const before = artOf(grid.asBlockedGridExcluding(1, TWO_BY_TWO));
    grid.reserve(grid.indexOf(2, 2), 7);
    grid.asBlockedGridExcluding(1, TWO_BY_TWO);
    grid.release(grid.indexOf(2, 2), 7);

    expect(artOf(grid.asBlockedGridExcluding(1, TWO_BY_TWO))).toEqual(before);
  });
});

describe('findNearestAvailableCell', () => {
  const grid = () =>
    new OccupancyGrid(
      gridFrom(`
        .....
        .....
        .....
        .....
        .....
      `),
      DEFAULT_CELL_SIZE
    );

  it('returns the requested cell when it is free', () => {
    const occupancy = grid();
    const wanted = occupancy.indexOf(2, 2);

    expect(findNearestAvailableCell(occupancy, wanted, 1)).toBe(wanted);
  });

  it('rings outward to the closest free cell when the requested one is taken', () => {
    const occupancy = grid();
    const wanted = occupancy.indexOf(2, 2);
    occupancy.reserve(wanted, 9);

    const found = findNearestAvailableCell(occupancy, wanted, 1);

    expect(found).not.toBe(wanted);
    const col = found % occupancy.width;
    const row = Math.floor(found / occupancy.width);
    expect(Math.max(Math.abs(col - 2), Math.abs(row - 2))).toBe(1);
  });

  it('skips cells already handed out in the same batch', () => {
    const occupancy = grid();
    const wanted = occupancy.indexOf(2, 2);

    const taken = new Set<number>();
    const cells = [0, 1, 2, 3, 4].map(() => {
      const cell = findNearestAvailableCell(occupancy, wanted, 1, taken);
      taken.add(cell);
      return cell;
    });

    expect(new Set(cells).size).toBe(cells.length);
  });

  it('never rings into terrain, however unoccupied it is', () => {
    const occupancy = new OccupancyGrid(
      gridFrom(`
        ###
        #.#
        ###
      `),
      DEFAULT_CELL_SIZE
    );
    const centre = occupancy.indexOf(1, 1);
    occupancy.reserve(centre, 9);

    expect(findNearestAvailableCell(occupancy, centre, 1)).toBe(NO_CELL);
  });

  it('gives up rather than searching forever when nothing is free', () => {
    const occupancy = new OccupancyGrid(gridFrom(`..`), DEFAULT_CELL_SIZE);
    occupancy.reserve(occupancy.indexOf(0, 0), 9);
    occupancy.reserve(occupancy.indexOf(1, 0), 9);

    expect(findNearestAvailableCell(occupancy, occupancy.indexOf(0, 0), 1)).toBe(NO_CELL);
  });

  it('offers a unit the cell it already holds', () => {
    const occupancy = grid();
    const cell = occupancy.indexOf(2, 2);
    occupancy.reserve(cell, 1);

    expect(findNearestAvailableCell(occupancy, cell, 1)).toBe(cell);
  });

  it('returns NO_CELL for an off-grid request', () => {
    expect(findNearestAvailableCell(grid(), NO_CELL, 1)).toBe(NO_CELL);
  });

  describe('with a multi-cell footprint', () => {
    const size = { width: 2, height: 2 };

    it('returns the requested anchor when its whole block is free', () => {
      const occupancy = grid();
      const wanted = occupancy.indexOf(1, 1);

      expect(findNearestAvailableCell(occupancy, wanted, 1, undefined, undefined, size)).toBe(
        wanted
      );
    });

    it('rejects an anchor whose block only partly overlaps an occupied cell', () => {
      const occupancy = grid();
      const wanted = occupancy.indexOf(1, 1);
      // Blocks the bottom-right cell of the 2x2 block anchored at (1, 1).
      occupancy.reserve(occupancy.indexOf(2, 2), 9);

      const found = findNearestAvailableCell(occupancy, wanted, 1, undefined, undefined, size);

      expect(found).not.toBe(wanted);
      expect(occupancy.isBlockAvailableFor(found, size, 1)).toBe(true);
    });

    it('never offers an anchor whose block would fall off the grid', () => {
      const occupancy = grid();
      const corner = occupancy.indexOf(4, 4);

      const found = findNearestAvailableCell(occupancy, corner, 1, undefined, undefined, size);

      expect(occupancy.blockCells(found, size)).toBeDefined();
    });
  });
});
