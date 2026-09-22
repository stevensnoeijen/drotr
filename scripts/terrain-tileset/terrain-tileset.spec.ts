import { describe, expect, it } from 'vitest';

import { buildPcx, greyscalePalette } from '~/test/pcx-fixture';

import { decodePcx, type PcxImage } from '~/lib/art/pcx';
import { extractTileRgba, tileRect, ATLAS_TILE_SIZE } from '~/lib/art/atlas';
import { TEAL_COLOR_KEY } from '~/lib/art/rgba';
import {
  atlasIndexToTileId,
  buildTerrainTilesetImage,
  buildTerrainTilesetXml,
  EXTRA_TILE_ID_OFFSET,
  gidToTileId,
  TERRAIN_TILE_COUNT,
  TERRAIN_TILESET_COLUMNS,
  TERRAIN_TILESET_HEIGHT,
  TERRAIN_TILESET_WIDTH,
  tileIdToAtlasIndex,
  tileIdToGid,
  VERBATIM_ATLAS_INDEX_MAX,
} from './terrain-tileset';

/**
 * Every atlas index the terrain tileset actually includes: the verbatim
 * 0–1471 run, plus the drawbridge and rubble extras. Hardcoded from the
 * ranges the issue measured, independent of the implementation under test.
 */
const INCLUDED_EXTRA_RANGES: ReadonlyArray<readonly [number, number]> = [
  [1578, 1583],
  [1594, 1599],
  [1610, 1615],
  [1626, 1631],
  [1642, 1646],
];

function isIncludedAtlasIndex(index: number): boolean {
  if (index <= VERBATIM_ATLAS_INDEX_MAX) return true;
  return INCLUDED_EXTRA_RANGES.some(
    ([first, last]) => index >= first && index <= last
  );
}

/** All filler tile ids the issue lists: unused padding in rows 92–96. */
const FILLER_IDS = [
  ...range(1472, 1481),
  ...range(1488, 1497),
  ...range(1504, 1513),
  ...range(1520, 1529),
  ...range(1536, 1545),
  1551,
];

function range(first: number, last: number): number[] {
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
}

/** Palette index reserved for every atlas tile this tileset excludes. */
const POISON_PALETTE_INDEX = 253;

/**
 * Encodes a tile's atlas index as a palette index, so decoding the fixture
 * back gives every tile a solid colour that identifies it. Included tiles
 * get a distinct low index (skipping the teal key at 37); every excluded
 * tile (UI rows, unit frames, the non-extra columns among the drawbridge
 * rows) gets the reserved "poison" colour, so a test can assert none of it
 * ever reaches the output.
 */
function paletteIndexForAtlasIndex(index: number): number {
  if (!isIncludedAtlasIndex(index)) {
    return POISON_PALETTE_INDEX;
  }
  const base = index % (POISON_PALETTE_INDEX - 1);
  return base >= 37 ? base + 1 : base;
}

/** Builds a synthetic atlas: `rows` tile rows tall, 16 columns, 40px tiles. */
function buildAtlasFixture(rows: number): PcxImage {
  const width = TERRAIN_TILESET_COLUMNS * ATLAS_TILE_SIZE;
  const height = rows * ATLAS_TILE_SIZE;
  const indices = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const tileRow = Math.floor(y / ATLAS_TILE_SIZE);
    for (let x = 0; x < width; x++) {
      const tileCol = Math.floor(x / ATLAS_TILE_SIZE);
      const atlasIndex = tileRow * TERRAIN_TILESET_COLUMNS + tileCol;
      indices[y * width + x] = paletteIndexForAtlasIndex(atlasIndex);
    }
  }

  const palette = greyscalePalette();
  palette[37 * 3] = TEAL_COLOR_KEY.r;
  palette[37 * 3 + 1] = TEAL_COLOR_KEY.g;
  palette[37 * 3 + 2] = TEAL_COLOR_KEY.b;

  return decodePcx(buildPcx({ width, height, indices, palette }));
}

/** Tile rows 0–102 covers everything the tileset draws from (up through rubble) plus a spare row 103. */
const FIXTURE_ROWS = 104;
const fixture = buildAtlasFixture(FIXTURE_ROWS);
const tilesetImage = buildTerrainTilesetImage(fixture);

function readTile(
  rgba: Uint8ClampedArray,
  bufferWidth: number,
  id: number
): Uint8ClampedArray {
  const rect = tileRect(id, bufferWidth);
  const out = new Uint8ClampedArray(ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4);
  for (let row = 0; row < ATLAS_TILE_SIZE; row++) {
    const srcOffset = ((rect.y + row) * bufferWidth + rect.x) * 4;
    const destOffset = row * ATLAS_TILE_SIZE * 4;
    out.set(
      rgba.subarray(srcOffset, srcOffset + ATLAS_TILE_SIZE * 4),
      destOffset
    );
  }
  return out;
}

/**
 * Whether two same-length byte buffers are identical. A hand-rolled loop
 * rather than `expect(...).toEqual(...)`, which is far too slow to call
 * per-tile over a fixture this size.
 */
function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe('buildTerrainTilesetImage', () => {
  it('is 640x3880 RGBA', () => {
    expect(tilesetImage.width).toEqual(640);
    expect(tilesetImage.height).toEqual(3880);
    expect(TERRAIN_TILESET_WIDTH).toEqual(640);
    expect(TERRAIN_TILESET_HEIGHT).toEqual(3880);
    expect(TERRAIN_TILE_COUNT).toEqual(1552);
    expect(tilesetImage.rgba).toHaveLength(640 * 3880 * 4);
  });

  it('reproduces atlas tiles 0-1471 tile-for-tile', () => {
    const mismatches: number[] = [];
    for (let index = 0; index <= VERBATIM_ATLAS_INDEX_MAX; index++) {
      const expected = extractTileRgba(fixture, index);
      const actual = readTile(tilesetImage.rgba, TERRAIN_TILESET_WIDTH, index);
      if (!bytesEqual(actual, expected)) {
        mismatches.push(index);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('places the drawbridge and rubble extras at atlasIndex - 96', () => {
    const cases: Array<[atlasIndex: number, id: number]> = [
      [1578, 1482],
      [1646, 1550],
    ];
    for (const [atlasIndex, id] of cases) {
      const expected = extractTileRgba(fixture, atlasIndex);
      const actual = readTile(tilesetImage.rgba, TERRAIN_TILESET_WIDTH, id);
      expect(actual).toEqual(expected);
    }
  });

  it('leaves every filler id fully transparent', () => {
    // One assertion over the collected offenders rather than one per byte:
    // ~326k individual `expect` calls took long enough to time the test out
    // under a loaded full-suite run.
    const nonTransparentIds = FILLER_IDS.filter((id) =>
      readTile(tilesetImage.rgba, TERRAIN_TILESET_WIDTH, id).some(
        (byte) => byte !== 0
      )
    );
    expect(nonTransparentIds).toEqual([]);
  });

  it('never draws a pixel sourced from an excluded atlas tile', () => {
    // The fixture marks every excluded atlas tile (UI rows 92-97, the
    // non-extra columns of rows 98-102, and rows 103+) with a reserved
    // "poison" colour. If the builder ever read one of those tiles, that
    // colour would show up somewhere in the output.
    const { rgba } = tilesetImage;
    const poisonR = greyscalePalette()[POISON_PALETTE_INDEX * 3];
    let sawPoison = false;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] === 0) continue; // transparent filler, not a source pixel
      if (rgba[i] === poisonR) {
        sawPoison = true;
        break;
      }
    }
    expect(sawPoison).toEqual(false);
  }, 20000);
});

describe('atlasIndexToTileId / tileIdToAtlasIndex', () => {
  it('is the identity for the verbatim range', () => {
    expect(atlasIndexToTileId(0)).toEqual(0);
    expect(atlasIndexToTileId(1471)).toEqual(1471);
    expect(tileIdToAtlasIndex(0)).toEqual(0);
    expect(tileIdToAtlasIndex(1471)).toEqual(1471);
  });

  it('offsets the extras by EXTRA_TILE_ID_OFFSET', () => {
    expect(EXTRA_TILE_ID_OFFSET).toEqual(96);
    expect(atlasIndexToTileId(1578)).toEqual(1482);
    expect(atlasIndexToTileId(1631)).toEqual(1535);
    expect(atlasIndexToTileId(1646)).toEqual(1550);
    expect(tileIdToAtlasIndex(1482)).toEqual(1578);
    expect(tileIdToAtlasIndex(1535)).toEqual(1631);
    expect(tileIdToAtlasIndex(1550)).toEqual(1646);
  });

  it.each([1472, 1577, 1647, 1700])(
    'throws for excluded atlas index %d',
    (index) => {
      expect(() => atlasIndexToTileId(index)).toThrow(RangeError);
    }
  );

  it.each(FILLER_IDS)('throws for filler id %d', (id) => {
    expect(() => tileIdToAtlasIndex(id)).toThrow(RangeError);
  });
});

describe('gid conversion', () => {
  it('uses firstgid = 1', () => {
    expect(tileIdToGid(0)).toEqual(1);
    expect(gidToTileId(1)).toEqual(0);
  });

  it.each([0, 1471, 1482, 1550])(
    'round-trips atlasIndex -> id -> gid -> id -> atlasIndex for id %d',
    (id) => {
      const atlasIndex = tileIdToAtlasIndex(id);
      const roundTrippedId = atlasIndexToTileId(atlasIndex);
      const gid = tileIdToGid(roundTrippedId);
      const backToId = gidToTileId(gid);
      const backToAtlasIndex = tileIdToAtlasIndex(backToId);
      expect(backToAtlasIndex).toEqual(atlasIndex);
    }
  );

  it.each([
    [1578, 1482],
    [1646, 1550],
  ])('round-trips the worked examples atlas %d <-> id %d', (atlasIndex, id) => {
    expect(atlasIndexToTileId(atlasIndex)).toEqual(id);
    expect(tileIdToAtlasIndex(id)).toEqual(atlasIndex);
  });
});

describe('buildTerrainTilesetXml', () => {
  it('describes the terrain tileset', () => {
    const xml = buildTerrainTilesetXml();
    expect(xml).toContain('name="terrain"');
    expect(xml).toContain('tilewidth="40"');
    expect(xml).toContain('tileheight="40"');
    expect(xml).toContain('columns="16"');
    expect(xml).toContain('tilecount="1552"');
    expect(xml).toContain(
      '<image source="terrain.png" width="640" height="3880"/>'
    );
    expect(xml).not.toContain('<properties>');
  });

  it('is deterministic', () => {
    expect(buildTerrainTilesetXml()).toEqual(buildTerrainTilesetXml());
  });
});
