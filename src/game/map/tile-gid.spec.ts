import { describe, expect, it } from 'vitest';

import { decodeGid, resolveGid, tileFrame, type TilesetGeometry } from './tile-gid';

function tileset(overrides: Partial<TilesetGeometry> = {}): TilesetGeometry {
  return {
    firstgid: 1,
    tileWidth: 40,
    tileHeight: 40,
    tileCount: 1552,
    columns: 16,
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
  it('applies the firstgid offset: localId = gid - firstgid', () => {
    expect(resolveGid(1, tileset({ firstgid: 1 }))).toBe(0);
    expect(resolveGid(1073, tileset({ firstgid: 1 }))).toBe(1072);
    expect(resolveGid(1076, tileset({ firstgid: 4 }))).toBe(1072);
  });

  it('returns undefined for the empty gid 0', () => {
    expect(resolveGid(0, tileset())).toBeUndefined();
  });

  it('returns undefined for a gid below the tileset’s firstgid', () => {
    expect(resolveGid(3, tileset({ firstgid: 10 }))).toBeUndefined();
  });

  it('returns undefined for a gid past the end of the tileset', () => {
    expect(resolveGid(1553, tileset())).toBeUndefined();
    expect(resolveGid(1552, tileset())).toBe(1551);
  });

  it('returns undefined for a non-integer gid', () => {
    expect(resolveGid(1.5, tileset())).toBeUndefined();
    expect(resolveGid(Number.NaN, tileset())).toBeUndefined();
  });
});

describe('tileFrame', () => {
  it('locates a tile by row and column in a tightly packed sheet', () => {
    expect(tileFrame(tileset(), 0)).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(tileFrame(tileset(), 17)).toEqual({ x: 40, y: 40, width: 40, height: 40 });
    // Grass at atlas index 1072: row 67, column 0.
    expect(tileFrame(tileset(), 1072)).toEqual({ x: 0, y: 2680, width: 40, height: 40 });
  });

  it('uses the tileset’s own tile size and column count', () => {
    const small = tileset({ tileWidth: 32, tileHeight: 16, columns: 3 });
    expect(tileFrame(small, 4)).toEqual({ x: 32, y: 16, width: 32, height: 16 });
  });
});
