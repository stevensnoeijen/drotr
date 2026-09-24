import { describe, expect, it } from 'vitest';

import { buildBuildingMapBytes } from '~/test/building-map-fixture';

import {
  BUILDING_MAP_BYTES,
  BuildingMapError,
  INTACT_GRID_OFFSET,
  INTERIOR_GRID_OFFSET,
  parseBuildingMap,
  RUINED_GRID_OFFSET,
} from './building-map';

describe('parseBuildingMap', () => {
  it('is 15 back-to-back 128x128 grids of 4-byte records', () => {
    expect(BUILDING_MAP_BYTES).toEqual(983040);
    expect(INTERIOR_GRID_OFFSET).toEqual(0x00000);
    expect(INTACT_GRID_OFFSET).toEqual(0x10000);
    expect(RUINED_GRID_OFFSET).toEqual(0x20000);
  });

  it.each([
    ['interior', 0x00000],
    ['intact', 0x10000],
    ['ruined', 0x20000],
  ] as const)(
    'reads %s lo at its grid offset + (x*128 + y)*4 back at [y*128 + x]',
    (grid, gridOffset) => {
      // (x=5, y=9): (5*128 + 9)*4 = 2596 bytes into the grid.
      const map = parseBuildingMap(
        buildBuildingMapBytes({ raw: { [gridOffset + 2596]: 42 } })
      );
      expect(map[grid][9 * 128 + 5]).toEqual(42);
      expect(Array.from(map[grid]).filter((tile) => tile !== 0)).toEqual([42]);
    }
  );

  it('keeps the three grids apart', () => {
    const map = parseBuildingMap(
      buildBuildingMapBytes({
        interior: [{ x: 1, y: 2, value: 1382 }],
        intact: [{ x: 3, y: 4, value: 1449 }],
        ruined: [{ x: 5, y: 6, value: 1451 }],
      })
    );
    const nonZero = (grid: Uint16Array) =>
      Array.from(grid).flatMap((tile, i) => (tile ? [[i, tile]] : []));
    expect(nonZero(map.interior)).toEqual([[2 * 128 + 1, 1382]]);
    expect(nonZero(map.intact)).toEqual([[4 * 128 + 3, 1449]]);
    expect(nonZero(map.ruined)).toEqual([[6 * 128 + 5, 1451]]);
  });

  it('is column-major in the file, transposed to row-major', () => {
    // (x=1, y=0) is 128 records in; (x=0, y=1) is the very next record.
    const map = parseBuildingMap(
      buildBuildingMapBytes({
        raw: {
          [INTACT_GRID_OFFSET + 128 * 4]: 11,
          [INTACT_GRID_OFFSET + 4]: 22,
        },
      })
    );
    expect(map.intact[1]).toEqual(11);
    expect(map.intact[128]).toEqual(22);
  });

  it('covers the last cell of each grid', () => {
    const last = { x: 127, y: 127 };
    const map = parseBuildingMap(
      buildBuildingMapBytes({
        interior: [{ ...last, value: 1 }],
        intact: [{ ...last, value: 2 }],
        ruined: [{ ...last, value: 3 }],
      })
    );
    for (const grid of [map.interior, map.intact, map.ruined]) {
      expect(grid).toBeInstanceOf(Uint16Array);
      expect(grid).toHaveLength(128 * 128);
    }
    expect(map.interior[128 * 128 - 1]).toEqual(1);
    expect(map.intact[128 * 128 - 1]).toEqual(2);
    expect(map.ruined[128 * 128 - 1]).toEqual(3);
  });

  it('decodes a little-endian u16 above 255 (tile 1451)', () => {
    const bytes = buildBuildingMapBytes();
    // 1451 = 0x05AB, low byte first.
    bytes[RUINED_GRID_OFFSET] = 0xab;
    bytes[RUINED_GRID_OFFSET + 1] = 0x05;
    expect(parseBuildingMap(bytes).ruined[0]).toEqual(1451);
  });

  it('ignores hi fields and the flag grids past grid 2', () => {
    const map = parseBuildingMap(
      buildBuildingMapBytes({
        interior: [{ x: 0, y: 0, value: 3 }],
        raw: {
          [INTERIOR_GRID_OFFSET + 2]: 0xffff, // grid 0 hi at (0, 0)
          [INTACT_GRID_OFFSET + 2]: 4, // grid 1 hi at (0, 0)
          [3 * 0x10000 + 2]: 12, // grid 3 hi
          [3 * 0x10000]: 99, // grid 3 lo
          [BUILDING_MAP_BYTES - 2]: 256, // grid 14's last hi
        },
      })
    );
    expect(map.interior[0]).toEqual(3);
    expect(map.intact.every((tile) => tile === 0)).toBe(true);
    expect(map.ruined.every((tile) => tile === 0)).toBe(true);
  });

  it.each([0, 327680, BUILDING_MAP_BYTES - 1, BUILDING_MAP_BYTES + 1])(
    'throws for a %d-byte buffer',
    (length) => {
      expect(() => parseBuildingMap(new Uint8Array(length))).toThrow(
        BuildingMapError
      );
      expect(() => parseBuildingMap(new Uint8Array(length))).toThrow(
        /983040 bytes/
      );
    }
  );

  it('parses a Uint8Array view with a non-zero byteOffset', () => {
    const file = buildBuildingMapBytes({
      intact: [{ x: 1, y: 0, value: 1449 }],
    });
    const padding = 13;
    const backing = new Uint8Array(padding + file.length + 7);
    backing.fill(0xaa);
    backing.set(file, padding);

    const map = parseBuildingMap(
      backing.subarray(padding, padding + file.length)
    );
    expect(map.intact[1]).toEqual(1449);
    expect(map.intact[0]).toEqual(0);
  });
});
