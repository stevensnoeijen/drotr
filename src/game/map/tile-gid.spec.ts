import { describe, expect, it } from 'vitest';

import { decodeGid, resolveGid, tileFrame, type TilesetGeometry } from './tile-gid';

function tileset(overrides: Partial<TilesetGeometry> = {}): TilesetGeometry {
  return {
    firstgid: 1,
    tileWidth: 40,
    tileHeight: 40,
    tileCount: 1552,
    columns: 16,
    margin: 0,
    spacing: 0,
    ...overrides,
  };
}

describe('decodeGid', () => {
  it('passes a plain gid through', () => {
    expect(decodeGid(42)).toBe(42);
    expect(decodeGid(0)).toBe(0);
  });

  it('strips each of the four flag bits, alone or together', () => {
    // Horizontal, vertical and diagonal flip, and hexagonal rotation.
    for (const flag of [0x80000000, 0x40000000, 0x20000000, 0x10000000]) {
      expect(decodeGid((7 | flag) >>> 0)).toBe(7);
    }
    expect(decodeGid((7 | 0xf0000000) >>> 0)).toBe(7);
  });

  it('decodes a horizontally flipped gid stored as a negative signed int', () => {
    const signed = (5 | 0x80000000) | 0;
    expect(signed).toBeLessThan(0);
    expect(decodeGid(signed)).toBe(5);
  });

  it('keeps the largest gid the flags leave room for', () => {
    expect(decodeGid(0x0fffffff)).toBe(0x0fffffff);
  });
});

describe('resolveGid', () => {
  it('applies the firstgid offset: gid = localId + firstgid', () => {
    const terrain = tileset({ firstgid: 1 });
    expect(resolveGid(1, [terrain])).toEqual({ tileset: terrain, localId: 0 });
    expect(resolveGid(1073, [terrain])).toEqual({ tileset: terrain, localId: 1072 });
  });

  it('picks the tileset with the highest firstgid not above the gid', () => {
    const first = tileset({ firstgid: 1, tileCount: 3, columns: 3 });
    const second = tileset({ firstgid: 4 });
    // Deliberately unsorted.
    const tilesets = [second, first];

    expect(resolveGid(3, tilesets)).toEqual({ tileset: first, localId: 2 });
    expect(resolveGid(4, tilesets)).toEqual({ tileset: second, localId: 0 });
    expect(resolveGid(1076, tilesets)).toEqual({ tileset: second, localId: 1072 });
  });

  it('returns undefined for the empty gid 0', () => {
    expect(resolveGid(0, [tileset()])).toBeUndefined();
  });

  it('returns undefined for a gid below every tileset', () => {
    expect(resolveGid(3, [tileset({ firstgid: 10 })])).toBeUndefined();
  });

  it('returns undefined for a gid past the end of its tileset', () => {
    expect(resolveGid(1553, [tileset()])).toBeUndefined();
    expect(resolveGid(1552, [tileset()])).toBeDefined();
  });

  it('returns undefined with no tilesets, or for a non-integer gid', () => {
    expect(resolveGid(1, [])).toBeUndefined();
    expect(resolveGid(1.5, [tileset()])).toBeUndefined();
    expect(resolveGid(Number.NaN, [tileset()])).toBeUndefined();
  });
});

describe('tileFrame', () => {
  it('locates a tile by row and column in a tightly packed sheet', () => {
    expect(tileFrame(tileset(), 0)).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(tileFrame(tileset(), 17)).toEqual({ x: 40, y: 40, width: 40, height: 40 });
    // Grass at atlas index 1072: row 67, column 0.
    expect(tileFrame(tileset(), 1072)).toEqual({ x: 0, y: 2680, width: 40, height: 40 });
  });

  it('accounts for margin and spacing', () => {
    const spaced = tileset({ tileWidth: 32, tileHeight: 32, columns: 3, margin: 2, spacing: 1 });
    expect(tileFrame(spaced, 4)).toEqual({ x: 2 + 33, y: 2 + 33, width: 32, height: 32 });
  });
});
