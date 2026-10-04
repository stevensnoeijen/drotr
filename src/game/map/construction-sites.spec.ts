import { describe, expect, it } from 'vitest';

import {
  parseBuildingPrefabs,
  parseConstructionSites,
  parseFootprints,
} from './construction-sites';
import type { MapObject, ParsedMap } from './load-tiled-map';

function object(overrides: Partial<MapObject>): MapObject {
  return {
    name: '',
    type: '',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    point: false,
    properties: {},
    ...overrides,
  };
}

function mapWith(layerName: string, objects: MapObject[]): Pick<ParsedMap, 'objectLayers' | 'tileSize'> {
  return { tileSize: 40, objectLayers: [{ name: layerName, visible: true, objects }] };
}

describe('parseFootprints', () => {
  it('keys each footprint by level and skips malformed values', () => {
    expect(
      parseFootprints({
        'footprint:1': '10,20,11,11',
        'footprint:bad': '1,2,3',
        'footprint:nan': 'a,b,c,d',
        levels: '1',
      })
    ).toEqual({ '1': { x: 10, y: 20, width: 11, height: 11 } });
  });
});

describe('parseConstructionSites', () => {
  it('reads category, levels, orientation and footprints', () => {
    const map = mapWith('constructions', [
      object({
        name: 'bridge-2',
        type: 'bridge',
        point: true,
        properties: {
          levels: 'wood,stone',
          orientation: 'vertical',
          'footprint:wood': '69,9,1,4',
          'footprint:stone': '69,9,2,4',
        },
      }),
      object({ name: 'junk', type: 'banana' }),
    ]);
    expect(parseConstructionSites(map)).toEqual([
      {
        name: 'bridge-2',
        category: 'bridge',
        levels: ['wood', 'stone'],
        orientation: 'vertical',
        footprints: {
          wood: { x: 69, y: 9, width: 1, height: 4 },
          stone: { x: 69, y: 9, width: 2, height: 4 },
        },
      },
    ]);
  });

  it('returns no sites for a map without a constructions layer', () => {
    expect(parseConstructionSites(mapWith('spawns', []))).toEqual([]);
  });
});

describe('parseBuildingPrefabs', () => {
  it('converts the pixel rect to tiles and reads bank, with and without a slot', () => {
    const map = mapWith('prefabs', [
      object({
        name: 'bridge-wood-vertical-grass-0',
        type: 'bridge',
        x: 440,
        y: 0,
        width: 40,
        height: 120,
        properties: {
          category: 'bridge',
          level: 'wood',
          orientation: 'vertical',
          bank: 'grass',
          slot: 0,
        },
      }),
      object({
        name: 'bridge-spare',
        type: 'bridge',
        x: 80,
        y: 40,
        width: 80,
        height: 40,
        properties: { category: 'bridge', level: 'stone', orientation: 'horizontal', bank: 'rock' },
      }),
      object({ name: 'no-category', properties: { level: '1' } }),
    ]);
    expect(parseBuildingPrefabs(map)).toEqual([
      {
        name: 'bridge-wood-vertical-grass-0',
        category: 'bridge',
        level: 'wood',
        orientation: 'vertical',
        bank: 'grass',
        rect: { x: 11, y: 0, width: 1, height: 3 },
      },
      {
        name: 'bridge-spare',
        category: 'bridge',
        level: 'stone',
        orientation: 'horizontal',
        bank: 'rock',
        rect: { x: 2, y: 1, width: 2, height: 1 },
      },
    ]);
  });
});
