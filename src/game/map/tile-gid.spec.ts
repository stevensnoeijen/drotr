import { describe, expect, it } from 'vitest';

import {
  decodeGid,
  FLIPPED_DIAGONALLY_FLAG,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  resolveGid,
  ROTATED_HEXAGONAL_120_FLAG,
  tileFrame,
  tileOrientation,
  type TilesetGeometry,
} from './tile-gid';

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
  it('passes a plain gid through with no flags', () => {
    expect(decodeGid(42)).toEqual({
      gid: 42,
      flippedHorizontally: false,
      flippedVertically: false,
      flippedDiagonally: false,
    });
  });

  it('strips each flip flag into its own boolean', () => {
    const raw =
      (7 | FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG) >>> 0;
    expect(decodeGid(raw)).toEqual({
      gid: 7,
      flippedHorizontally: true,
      flippedVertically: true,
      flippedDiagonally: true,
    });
  });

  it('decodes a horizontally flipped gid stored as a negative signed int', () => {
    const signed = (5 | FLIPPED_HORIZONTALLY_FLAG) | 0;
    expect(signed).toBeLessThan(0);
    expect(decodeGid(signed)).toMatchObject({ gid: 5, flippedHorizontally: true });
  });

  it('strips the hexagonal rotation bit too', () => {
    expect(decodeGid((3 | ROTATED_HEXAGONAL_120_FLAG) >>> 0).gid).toBe(3);
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

describe('tileOrientation', () => {
  const none = { flippedHorizontally: false, flippedVertically: false, flippedDiagonally: false };

  /** Applies rotate(rotation) · scale(sx, sy) to a point, rounding away float noise. */
  function apply({ rotation, scaleX, scaleY }: ReturnType<typeof tileOrientation>, x: number, y: number) {
    const sx = x * scaleX;
    const sy = y * scaleY;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return [Math.round(sx * cos - sy * sin), Math.round(sx * sin + sy * cos)];
  }

  /** Tiled's own definition: diagonal swaps x/y, then h negates x, then v negates y. */
  function reference(flags: typeof none, x: number, y: number) {
    let [px, py] = flags.flippedDiagonally ? [y, x] : [x, y];
    if (flags.flippedHorizontally) px = -px;
    if (flags.flippedVertically) py = -py;
    return [px, py];
  }

  it('is the identity with no flags', () => {
    expect(tileOrientation(none)).toEqual({ rotation: 0, scaleX: 1, scaleY: 1 });
  });

  it('maps a plain horizontal/vertical flip onto a negative scale', () => {
    expect(tileOrientation({ ...none, flippedHorizontally: true })).toEqual({
      rotation: 0,
      scaleX: -1,
      scaleY: 1,
    });
    expect(tileOrientation({ ...none, flippedVertically: true })).toEqual({
      rotation: 0,
      scaleX: 1,
      scaleY: -1,
    });
  });

  it('matches Tiled’s flip order for all eight flag combinations', () => {
    for (const flippedDiagonally of [false, true]) {
      for (const flippedHorizontally of [false, true]) {
        for (const flippedVertically of [false, true]) {
          const flags = { flippedDiagonally, flippedHorizontally, flippedVertically };
          const orientation = tileOrientation(flags);
          // A point off every axis and diagonal pins the transform down uniquely.
          expect(apply(orientation, 1, 2)).toEqual(reference(flags, 1, 2));
        }
      }
    }
  });
});
