import { describe, expect, it } from 'vitest';

import {
  compareWithCountyMask,
  COUNTY_MAP_BYTES,
  countyGroundTile,
  IMPASSABLE_BIT,
  isCountySubcellBlocked,
} from './walkability-evidence';

/** A synthetic county map: every cell tile 0 and open unless set otherwise. */
function blankCountyMap(): Uint8Array {
  return new Uint8Array(COUNTY_MAP_BYTES);
}

function setGroundTile(map: Uint8Array, x: number, y: number, tile: number): void {
  const offset = (x * 128 + y) * 4;
  map[offset] = tile & 0xff;
  map[offset + 1] = tile >> 8;
}

function setSubcellHi(map: Uint8Array, sx: number, sy: number, hi: number): void {
  const offset = 0x10000 + (sx * 256 + sy) * 4;
  map[offset + 2] = hi & 0xff;
  map[offset + 3] = hi >> 8;
}

describe('county map readers', () => {
  it('reads Section A column-major, little-endian', () => {
    const map = blankCountyMap();
    setGroundTile(map, 3, 5, 1072);
    expect(countyGroundTile(map, 3, 5)).toBe(1072);
    expect(countyGroundTile(map, 5, 3)).toBe(0);
  });

  it('reads Section B bit 2 as impassable, ignoring the other bits', () => {
    const map = blankCountyMap();
    setSubcellHi(map, 10, 2, IMPASSABLE_BIT);
    setSubcellHi(map, 11, 2, 256);
    setSubcellHi(map, 12, 2, 256 | IMPASSABLE_BIT);
    expect(isCountySubcellBlocked(map, 10, 2)).toBe(true);
    expect(isCountySubcellBlocked(map, 2, 10)).toBe(false);
    expect(isCountySubcellBlocked(map, 11, 2)).toBe(false);
    expect(isCountySubcellBlocked(map, 12, 2)).toBe(true);
  });
});

describe('compareWithCountyMask', () => {
  const WALL = 7;
  const isWalkable = (tile: number) => tile !== WALL;
  const categoryOf = (tile: number) => (tile === WALL ? 'wall' : 'ground');

  it('counts both kinds of disagreement per subcell, overall and per category', () => {
    const map = blankCountyMap();
    // A wall tile at (1, 1) whose four subcells are only half blocked.
    setGroundTile(map, 1, 1, WALL);
    setSubcellHi(map, 2, 2, IMPASSABLE_BIT);
    setSubcellHi(map, 3, 2, IMPASSABLE_BIT);
    // A ground tile at (4, 0) with one blocked subcell.
    setSubcellHi(map, 9, 1, IMPASSABLE_BIT);

    const result = compareWithCountyMask(map, isWalkable, categoryOf);

    expect(result.subcells).toBe(256 * 256);
    expect(result.openButNotWalkable).toBe(2);
    expect(result.blockedButWalkable).toBe(1);
    expect(result.byCategory.wall).toEqual({ subcells: 4, blockedButWalkable: 0, openButNotWalkable: 2 });
    expect(result.byCategory.ground).toEqual({
      subcells: 256 * 256 - 4,
      blockedButWalkable: 1,
      openButNotWalkable: 0,
    });
  });

  it('rejects a buffer that is not a county map', () => {
    expect(() => compareWithCountyMask(new Uint8Array(10), isWalkable, categoryOf)).toThrow(RangeError);
  });
});
