import { describe, expect, it } from 'vitest';

import { CELL_SIZE } from '~/lib/grid';
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
    `)
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
      expect(grid.indexAt({ x: CELL_SIZE * 2.5, y: CELL_SIZE * 1.5 })).toBe(grid.indexOf(2, 1));
      // The boundary belongs to the cell it opens, not the one it closes.
      expect(grid.indexAt({ x: CELL_SIZE, y: 0 })).toBe(grid.indexOf(1, 0));
    });

    it('maps a negative world position off the grid rather than into the wrong cell', () => {
      const grid = open();

      expect(grid.indexAt({ x: -1, y: 0 })).toBe(NO_CELL);
    });

    it('round-trips a cell index back to the world centre of that cell', () => {
      const grid = open();
      const centre = grid.centreOf(grid.indexOf(3, 2));

      expect(centre).toEqual({ x: 3 * CELL_SIZE + CELL_SIZE / 2, y: 2 * CELL_SIZE + CELL_SIZE / 2 });
      expect(grid.indexAt(centre)).toBe(grid.indexOf(3, 2));
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
      const grid = new OccupancyGrid(gridFrom(`.#.`));
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
        `)
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
      const grid = new OccupancyGrid(map);

      map.collision[grid.indexOf(1, 0)] = 1;

      expect(grid.isTerrainBlocked(grid.indexOf(1, 0))).toBe(true);
    });
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
      `)
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
      `)
    );
    const centre = occupancy.indexOf(1, 1);
    occupancy.reserve(centre, 9);

    expect(findNearestAvailableCell(occupancy, centre, 1)).toBe(NO_CELL);
  });

  it('gives up rather than searching forever when nothing is free', () => {
    const occupancy = new OccupancyGrid(gridFrom(`..`));
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
});
