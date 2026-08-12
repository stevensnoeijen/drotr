import fs from 'node:fs';
import path from 'node:path';

import type { TiledMap } from 'tiled-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadTiledMap,
  parseTiledMap,
  parseTiledTileset,
  TiledMapError,
  type TerrainType,
} from './loadTiledMap';

const FIXTURE_DIR = path.resolve(import.meta.dirname, '../../../public/maps');
const mapJson = fs.readFileSync(path.join(FIXTURE_DIR, 'grass.tmj'), 'utf-8');
const tilesetXml = fs.readFileSync(
  path.join(FIXTURE_DIR, 'grass.tsx'),
  'utf-8'
);
const fixtureMap = JSON.parse(mapJson) as TiledMap;
const fixtureTerrainByGid = new Map<number, TerrainType>(
  [...parseTiledTileset(tilesetXml)].map(([localId, type]) => [
    localId + 1,
    type,
  ])
);

describe('parseTiledMap', () => {
  it('parses the committed fixture to the expected dimensions, terrain counts and spawn list', () => {
    const result = parseTiledMap(fixtureMap, fixtureTerrainByGid);

    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.tileSize).toBe(32);
    expect(result.terrain).toHaveLength(64);
    expect(result.terrain[0]).toHaveLength(64);

    const counts = { grass: 0, wall: 0, water: 0 };
    for (const row of result.terrain) {
      for (const type of row) {
        counts[type]++;
      }
    }
    expect(counts).toEqual({ grass: 3764, wall: 252, water: 80 });
    expect(result.collision.length).toBe(64 * 64);
    // Every non-grass tile blocks movement.
    expect([...result.collision].filter((v) => v === 1).length).toBe(
      counts.wall + counts.water
    );

    expect(result.spawns).toEqual([
      { position: { x: 176, y: 176 }, team: 'blue', unitType: 'soldier' },
      { position: { x: 1872, y: 1872 }, team: 'red', unitType: 'soldier' },
    ]);
  });

  it('rejects a map missing the terrain layer', () => {
    const map: TiledMap = {
      ...fixtureMap,
      layers: fixtureMap.layers.filter((layer) => layer.name !== 'terrain'),
    };

    expect(() => parseTiledMap(map, fixtureTerrainByGid)).toThrow(
      TiledMapError
    );
    expect(() => parseTiledMap(map, fixtureTerrainByGid)).toThrow(/terrain/i);
  });

  it('rejects an unknown tile gid', () => {
    const badTerrainByGid = new Map(fixtureTerrainByGid);
    badTerrainByGid.delete(1);

    expect(() => parseTiledMap(fixtureMap, badTerrainByGid)).toThrow(
      /unknown tile gid/i
    );
  });

  it('rejects a non-orthogonal orientation', () => {
    const map = { ...fixtureMap, orientation: 'isometric' } as TiledMap;

    expect(() => parseTiledMap(map, fixtureTerrainByGid)).toThrow(
      /orientation/i
    );
  });

  it('rejects a terrain layer whose size does not match the map', () => {
    const map: TiledMap = {
      ...fixtureMap,
      layers: fixtureMap.layers.map((layer) =>
        layer.name === 'terrain' ? { ...layer, width: 32 } : layer
      ),
    };

    expect(() => parseTiledMap(map, fixtureTerrainByGid)).toThrow(/size/i);
  });
});

describe('loadTiledMap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the map and its external tileset and parses them end to end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.toString().endsWith('.tsx') ? tilesetXml : mapJson;
        return { ok: true, text: async () => body } as Response;
      })
    );

    const result = await loadTiledMap('/maps/grass.tmj');

    expect(result.width).toBe(64);
    expect(result.spawns).toHaveLength(2);
  });
});
