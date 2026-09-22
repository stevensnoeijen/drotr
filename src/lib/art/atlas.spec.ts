import { describe, expect, it } from 'vitest';

import { buildPcx } from '~/test/pcx-fixture';

import { decodePcx } from './pcx';
import {
  ATLAS_TILE_SIZE,
  extractTileRgba,
  tileColumns,
  tileCount,
  tileRect,
  tileRows,
} from './atlas';

/** The real `BATTLE.ART` sheet size, used to pin the derived geometry. */
const BATTLE_WIDTH = 640;
const BATTLE_HEIGHT = 9367;

describe('tileColumns', () => {
  it('fits 16 tiles across the 640px sheet', () => {
    expect(tileColumns(BATTLE_WIDTH)).toEqual(16);
  });

  it('ignores a trailing partial column', () => {
    expect(tileColumns(ATLAS_TILE_SIZE * 3 + 7)).toEqual(3);
  });
});

describe('tileRows', () => {
  it('counts only whole rows, dropping the sheet trailing partial row', () => {
    // 9367 is 234 whole rows plus 7 leftover pixel rows.
    expect(tileRows(BATTLE_HEIGHT)).toEqual(234);
  });
});

describe('tileCount', () => {
  it('reports the complete tiles in the battle sheet', () => {
    expect(tileCount(BATTLE_WIDTH, BATTLE_HEIGHT)).toEqual(3744);
  });

  it('covers every tile index the county maps reference', () => {
    // The highest index seen across all twelve county `.MAP` files is 1471,
    // so the sheet must hold at least 1472 tiles for maps to draw in full.
    expect(tileCount(BATTLE_WIDTH, BATTLE_HEIGHT)).toBeGreaterThanOrEqual(1472);
  });
});

describe('tileRect', () => {
  it('places tile 0 at the origin', () => {
    expect(tileRect(0, BATTLE_WIDTH)).toEqual({
      x: 0,
      y: 0,
      width: ATLAS_TILE_SIZE,
      height: ATLAS_TILE_SIZE,
    });
  });

  it('walks across a row before wrapping to the next', () => {
    expect(tileRect(15, BATTLE_WIDTH)).toMatchObject({ x: 600, y: 0 });
    expect(tileRect(16, BATTLE_WIDTH)).toMatchObject({ x: 0, y: 40 });
  });

  it('places the highest index the maps use inside the sheet', () => {
    const rect = tileRect(1471, BATTLE_WIDTH);

    expect(rect).toMatchObject({ x: 600, y: 3640 });
    expect(rect.y + rect.height).toBeLessThanOrEqual(BATTLE_HEIGHT);
  });

  it('keeps the three tiles of a horizontal run adjacent', () => {
    // A multi-tile object stored in the sheet occupies consecutive indices
    // along one row, which is what makes the 16-column layout verifiable.
    const [a, b, c] = [1437, 1438, 1439].map((i) => tileRect(i, BATTLE_WIDTH));

    expect(a.y).toEqual(b.y);
    expect(b.y).toEqual(c.y);
    expect(b.x - a.x).toEqual(ATLAS_TILE_SIZE);
    expect(c.x - b.x).toEqual(ATLAS_TILE_SIZE);
  });

  it('rejects a negative or fractional index', () => {
    expect(() => tileRect(-1, BATTLE_WIDTH)).toThrow(RangeError);
    expect(() => tileRect(1.5, BATTLE_WIDTH)).toThrow(RangeError);
  });

  it('rejects a sheet too narrow to hold a tile', () => {
    expect(() => tileRect(0, 10)).toThrow(RangeError);
  });
});

describe('extractTileRgba', () => {
  it('cuts one tile out of a sheet', () => {
    const width = ATLAS_TILE_SIZE * 2;
    const height = ATLAS_TILE_SIZE;
    const indices = new Uint8Array(width * height);
    // Fill the right-hand tile with a distinct value.
    for (let y = 0; y < height; y++) {
      for (let x = ATLAS_TILE_SIZE; x < width; x++) {
        indices[y * width + x] = 99;
      }
    }
    const image = decodePcx(buildPcx({ width, height, indices }));

    const tile = extractTileRgba(image, 1, null);

    expect(tile).toHaveLength(ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4);
    expect(tile[0]).toEqual(99);
    expect(tile[tile.length - 4]).toEqual(99);
  });

  it('rejects a tile the sheet does not fully contain', () => {
    const image = decodePcx(
      buildPcx({
        width: ATLAS_TILE_SIZE,
        height: ATLAS_TILE_SIZE,
        indices: new Uint8Array(ATLAS_TILE_SIZE * ATLAS_TILE_SIZE),
      })
    );

    expect(() => extractTileRgba(image, 1)).toThrow(RangeError);
  });
});
