import { describe, expect, it } from 'vitest';

import {
  CATEGORY_BY_CODE,
  isWalkableTile,
  TILE_CATEGORY_ROWS,
  tileCategory,
  WALKABLE_CATEGORIES,
  type TileCategory,
} from './tile-categories';
import {
  TERRAIN_TILE_COUNT,
  TERRAIN_TILESET_COLUMNS,
  TERRAIN_TILESET_ROWS,
  tileIdToAtlasIndex,
} from './terrain-tileset';

describe('TILE_CATEGORY_ROWS', () => {
  it('has one row per tileset row, one known code per tile', () => {
    expect(TILE_CATEGORY_ROWS).toHaveLength(TERRAIN_TILESET_ROWS);
    for (const row of TILE_CATEGORY_ROWS) {
      expect(row).toHaveLength(TERRAIN_TILESET_COLUMNS);
      for (const code of row) {
        expect(CATEGORY_BY_CODE).toHaveProperty(code);
      }
    }
  });

  it('marks exactly the unused slots as filler — plus the one black void tile', () => {
    const fillerIds: number[] = [];
    const unusedIds: number[] = [];
    for (let id = 0; id < TERRAIN_TILE_COUNT; id++) {
      if (tileCategory(id) === 'filler') fillerIds.push(id);
      try {
        tileIdToAtlasIndex(id);
      } catch {
        unusedIds.push(id);
      }
    }
    // 719, 1167, 1182 and 1183 are real atlas tiles, but solid black.
    const blackVoidIds = [719, 1167, 1182, 1183];
    expect(fillerIds).toEqual([...blackVoidIds, ...unusedIds].sort((a, b) => a - b));
  });
});

describe('tileCategory', () => {
  const cases: Array<[id: number, category: TileCategory, what: string]> = [
    [0, 'ground', 'the first gravel tile'],
    [1072, 'ground', 'plain grass (the test map’s grass)'],
    [9, 'rock', 'a boulder on grass'],
    [210, 'wall', 'a wall strip beside cobbled paving (the test map’s wall)'],
    [398, 'water', 'open water'],
    [100, 'rubble', 'a damaged wall'],
    [108, 'roof', 'a tiled roof'],
    [426, 'roof', 'an intact tower’s wooden top'],
    [428, 'rubble', 'a ruined tower'],
    [1146, 'tree', 'a pine'],
    [915, 'bridge', 'an intact bridge deck'],
    [919, 'broken-bridge', 'a bridge deck with holes'],
    [1200, 'bridge', 'an intact bridge deck'],
    [1206, 'broken-bridge', 'a bridge deck with holes'],
    [1312, 'closed-gate', 'a closed gate'],
    [1317, 'closed-gate', 'a closed gate'],
    [1440, 'open-gate', 'an open gate'],
    [1445, 'open-gate', 'an open gate'],
    [1360, 'rubble', 'splintered gate doors still hanging'],
    [1365, 'rubble', 'splintered gate doors still hanging'],
    [1408, 'open-gate', 'a gateway with its doors smashed out'],
    [1413, 'open-gate', 'a gateway with its doors smashed out'],
    [1482, 'bridge', 'the intact drawbridge'],
    [1514, 'broken-bridge', 'the broken drawbridge'],
    [1535, 'broken-bridge', 'the broken drawbridge'],
    [1546, 'rubble', 'the rubble extras'],
    [1472, 'filler', 'an unused slot'],
  ];

  it.each(cases)('classifies tile %i as %s (%s)', (id, category) => {
    expect(tileCategory(id)).toBe(category);
  });

  it('rejects an id outside the tileset', () => {
    expect(() => tileCategory(-1)).toThrow(RangeError);
    expect(() => tileCategory(TERRAIN_TILE_COUNT)).toThrow(RangeError);
    expect(() => tileCategory(1.5)).toThrow(RangeError);
  });
});

describe('isWalkableTile', () => {
  it('lets units stand on ground, open gates and intact bridges only', () => {
    expect([...WALKABLE_CATEGORIES].sort()).toEqual(['bridge', 'ground', 'open-gate']);
  });

  it('blocks walls, closed gates, water, rock, rubble, broken bridges, roofs, trees and filler', () => {
    for (const id of [210, 1312, 1360, 398, 9, 800, 100, 919, 108, 1146, 1472]) {
      expect(isWalkableTile(id)).toBe(false);
    }
    for (const id of [0, 1072, 915, 1440, 1408, 1482]) {
      expect(isWalkableTile(id)).toBe(true);
    }
  });

  it('keeps the intact drawbridge walkable and blocks its broken rows', () => {
    for (let row = 92; row <= 95; row++) {
      for (let column = 10; column <= 15; column++) {
        const id = row * TERRAIN_TILESET_COLUMNS + column;
        expect(tileCategory(id)).toBe(row <= 93 ? 'bridge' : 'broken-bridge');
        expect(isWalkableTile(id)).toBe(row <= 93);
      }
    }
  });
});
