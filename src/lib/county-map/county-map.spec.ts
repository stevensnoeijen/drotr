import { describe, expect, it } from 'vitest';

import { buildCountyMapBytes, tileSubcells } from '~/test/county-map-fixture';

import {
  collapseCollisionMaskPerTile,
  COUNTY_MAP_BYTES,
  CountyMapError,
  parseCountyMap,
  subcellAt,
  tileAt,
} from './county-map';

/** A zeroed county-sized buffer with raw little-endian `u16`s poked in. */
function rawBuffer(writes: Record<number, number>): Uint8Array {
  const bytes = new Uint8Array(COUNTY_MAP_BYTES);
  const view = new DataView(bytes.buffer);
  for (const [offset, value] of Object.entries(writes)) {
    view.setUint16(Number(offset), value, true);
  }
  return bytes;
}

describe('parseCountyMap', () => {
  describe('Section A (tiles)', () => {
    it('reads the lo written at (x*128 + y)*4 back at tiles[y*128 + x]', () => {
      // (x=5, y=9): file offset (5*128 + 9)*4 = 2596.
      const map = parseCountyMap(rawBuffer({ 2596: 42 }));
      expect(map.tiles[9 * 128 + 5]).toEqual(42);
      expect(tileAt(map, 5, 9)).toEqual(42);
    });

    it('is column-major in the file, not transposed', () => {
      // (x=1, y=0) is 128 records in; (x=0, y=1) is the very next record.
      const map = parseCountyMap(rawBuffer({ [128 * 4]: 11, [1 * 4]: 22 }));
      expect(tileAt(map, 1, 0)).toEqual(11);
      expect(tileAt(map, 0, 1)).toEqual(22);
      expect(map.tiles[1]).toEqual(11);
      expect(map.tiles[128]).toEqual(22);
    });

    it('covers the last cell of the grid', () => {
      const map = parseCountyMap(rawBuffer({ [(127 * 128 + 127) * 4]: 7 }));
      expect(tileAt(map, 127, 127)).toEqual(7);
      expect(map.tiles).toHaveLength(128 * 128);
    });

    it('decodes a little-endian u16 above 255 (tile 1471)', () => {
      const bytes = new Uint8Array(COUNTY_MAP_BYTES);
      // 1471 = 0x05BF, low byte first.
      bytes[0] = 0xbf;
      bytes[1] = 0x05;
      expect(tileAt(parseCountyMap(bytes), 0, 0)).toEqual(1471);
    });

    it('keeps only lo, ignoring a non-zero hi', () => {
      const map = parseCountyMap(rawBuffer({ 0: 3, 2: 0xffff }));
      expect(tileAt(map, 0, 0)).toEqual(3);
    });
  });

  describe('Section B (collision mask)', () => {
    it('reads the hi written at 0x10000 + (x*256 + y)*4 back at collisionMask[y*256 + x]', () => {
      // (x=3, y=200): 0x10000 + (3*256 + 200)*4 + 2 (the hi field).
      const offset = 0x10000 + (3 * 256 + 200) * 4 + 2;
      const map = parseCountyMap(rawBuffer({ [offset]: 4 }));
      expect(map.collisionMask[200 * 256 + 3]).toEqual(4);
      expect(subcellAt(map, 3, 200)).toEqual(4);
    });

    it('is column-major in the file, not transposed', () => {
      const map = parseCountyMap(
        rawBuffer({
          [0x10000 + 256 * 4 + 2]: 4, // (x=1, y=0)
          [0x10000 + 1 * 4 + 2]: 256, // (x=0, y=1)
        })
      );
      expect(subcellAt(map, 1, 0)).toEqual(4);
      expect(subcellAt(map, 0, 1)).toEqual(256);
      expect(map.collisionMask[1]).toEqual(4);
      expect(map.collisionMask[256]).toEqual(256);
    });

    it('covers the last subcell, the final bytes of the file', () => {
      const map = parseCountyMap(rawBuffer({ [COUNTY_MAP_BYTES - 2]: 4 }));
      expect(subcellAt(map, 255, 255)).toEqual(4);
      expect(map.collisionMask).toHaveLength(256 * 256);
    });

    it('decodes a little-endian u16 above 255 (hi 256)', () => {
      const bytes = new Uint8Array(COUNTY_MAP_BYTES);
      // 256 = 0x0100, low byte first, in the hi field of subcell (0, 0).
      bytes[0x10000 + 2] = 0x00;
      bytes[0x10000 + 3] = 0x01;
      expect(subcellAt(parseCountyMap(bytes), 0, 0)).toEqual(256);
    });

    it('keeps only hi, ignoring a non-zero lo', () => {
      const map = parseCountyMap(
        rawBuffer({ [0x10000]: 0xffff, [0x10000 + 2]: 4 })
      );
      expect(subcellAt(map, 0, 0)).toEqual(4);
    });

    it('does not bleed Section B into Section A', () => {
      const map = parseCountyMap(rawBuffer({ [0x10000]: 9 }));
      expect(map.tiles.every((tile) => tile === 0)).toBe(true);
    });
  });

  it.each([0, COUNTY_MAP_BYTES - 1, COUNTY_MAP_BYTES + 1, 983040])(
    'throws for a %d-byte buffer',
    (length) => {
      expect(() => parseCountyMap(new Uint8Array(length))).toThrow(
        CountyMapError
      );
      expect(() => parseCountyMap(new Uint8Array(length))).toThrow(
        /327680 bytes/
      );
    }
  );

  it('parses a Uint8Array view with a non-zero byteOffset', () => {
    const file = buildCountyMapBytes({
      tiles: [{ x: 1, y: 0, value: 1471 }],
      collision: [{ x: 0, y: 1, value: 256 }],
    });
    const padding = 13;
    const backing = new Uint8Array(padding + file.length + 7);
    backing.fill(0xaa);
    backing.set(file, padding);
    const view = backing.subarray(padding, padding + file.length);

    const map = parseCountyMap(view);
    expect(tileAt(map, 1, 0)).toEqual(1471);
    expect(tileAt(map, 0, 0)).toEqual(0);
    expect(subcellAt(map, 0, 1)).toEqual(256);
    expect(subcellAt(map, 0, 0)).toEqual(0);
  });
});

describe('collapseCollisionMaskPerTile', () => {
  function collapsedAt(
    values: [number, number, number, number],
    x = 3,
    y = 5
  ): number {
    const map = parseCountyMap(
      buildCountyMapBytes({ collision: tileSubcells(x, y, values) })
    );
    return collapseCollisionMaskPerTile(map)[y * 128 + x];
  }

  it('returns a row-major 128x128 grid', () => {
    const map = parseCountyMap(buildCountyMapBytes());
    const collapsed = collapseCollisionMaskPerTile(map);
    expect(collapsed).toBeInstanceOf(Uint8Array);
    expect(collapsed).toHaveLength(128 * 128);
    expect(collapsed.every((cell) => cell === 0)).toBe(true);
  });

  it('blocks a tile whose 4 subcells are all blocked', () => {
    expect(collapsedAt([4, 4, 4, 4])).toEqual(1);
  });

  it.each<[string, [number, number, number, number]]>([
    ['0 of 4', [0, 0, 0, 0]],
    ['1 of 4', [4, 0, 0, 0]],
    ['2 of 4', [0, 4, 4, 0]],
    ['3 of 4 (bottom-right open)', [4, 4, 4, 0]],
    ['3 of 4 (top-left open)', [0, 4, 4, 4]],
  ])('leaves a tile with %s subcells blocked open', (_label, values) => {
    expect(collapsedAt(values)).toEqual(0);
  });

  it('counts a lone 256 as blocked', () => {
    expect(collapsedAt([256, 256, 256, 256])).toEqual(1);
  });

  it('blocks a tile with mixed 4/256 subcells', () => {
    expect(collapsedAt([4, 256, 256, 4])).toEqual(1);
  });

  it('maps subcells (2x..2x+1, 2y..2y+1) to tile (x, y), not transposed', () => {
    const map = parseCountyMap(
      buildCountyMapBytes({ collision: tileSubcells(1, 0, [4, 4, 4, 4]) })
    );
    const collapsed = collapseCollisionMaskPerTile(map);
    expect(collapsed[0 * 128 + 1]).toEqual(1);
    expect(collapsed[1 * 128 + 0]).toEqual(0);
    expect(collapsed.reduce((sum, cell) => sum + cell, 0)).toEqual(1);
  });

  it('covers the bottom-right tile', () => {
    expect(collapsedAt([4, 4, 4, 4], 127, 127)).toEqual(1);
  });
});
