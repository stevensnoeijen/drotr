import fs from 'node:fs';
import path from 'node:path';

import type { TiledLayer, TiledLayerTilelayer, TiledMap } from 'tiled-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadTiledMap,
  parseTiledMap,
  parseTiledTileset,
  parseTilesetDescription,
  TiledMapError,
  type TerrainType,
} from './load-tiled-map';

const FIXTURE_DIR = path.resolve(import.meta.dirname, '../../../public/maps');
const mapJson = fs.readFileSync(path.join(FIXTURE_DIR, 'test.tmj'), 'utf-8');
const tilesetXml = fs.readFileSync(
  path.join(FIXTURE_DIR, 'test.tsx'),
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
    expect(counts).toEqual({ grass: 3502, wall: 594, water: 0 });
    expect(result.collision.length).toBe(64 * 64);
    // Every non-grass tile blocks movement.
    expect([...result.collision].filter((v) => v === 1).length).toBe(
      counts.wall + counts.water
    );

    expect(result.spawns).toEqual([
      { id: 'spawn-1', position: { x: 176, y: 176 } },
      { id: 'spawn-2', position: { x: 1872, y: 1872 } },
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

/** A map-sized tile layer filled with one gid, for layer-collection tests. */
function tileLayer(name: string, gid: number, extra: Partial<TiledLayerTilelayer> = {}): TiledLayerTilelayer {
  return {
    ...(fixtureMap.layers.find((layer) => layer.name === 'terrain') as TiledLayerTilelayer),
    name,
    data: new Array(fixtureMap.width * fixtureMap.height).fill(gid),
    visible: true,
    opacity: 1,
    ...extra,
  };
}

function withLayers(...extra: TiledLayer[]): TiledMap {
  const terrain = fixtureMap.layers.find((layer) => layer.name === 'terrain')!;
  const spawns = fixtureMap.layers.find((layer) => layer.name === 'spawns')!;
  return { ...fixtureMap, layers: [{ ...terrain, visible: false }, ...extra, spawns] };
}

describe('parseTiledMap tile layers', () => {
  it('exposes visible tile layers back to front and passes the tilesets through', () => {
    const tilesets = [parseTilesetDescription(tilesetXml, 1, 'http://x/maps/test.tsx')];
    const map = withLayers(tileLayer('ground', 5), tileLayer('decoration', 0));

    const result = parseTiledMap(map, fixtureTerrainByGid, tilesets);

    expect(result.tileLayers.map((layer) => layer.name)).toEqual(['ground', 'decoration']);
    expect(result.tileLayers[0].data).toHaveLength(64 * 64);
    expect(result.tileLayers[0].data[0]).toBe(5);
    expect(result.tilesets).toBe(tilesets);
  });

  it('leaves out hidden layers, even when they are the gameplay terrain layer', () => {
    const map = withLayers(tileLayer('ground', 5), tileLayer('hidden', 5, { visible: false }));
    const result = parseTiledMap(map, fixtureTerrainByGid);

    expect(result.tileLayers.map((layer) => layer.name)).toEqual(['ground']);
    // The hidden terrain layer still drives gameplay.
    expect(result.terrain[0][0]).toBe('wall');
  });

  it('flattens groups, skipping hidden ones and multiplying opacity', () => {
    const group = (name: string, layers: TiledLayer[], extra: object = {}) =>
      ({ ...tileLayer(name, 0), type: 'group', layers, ...extra }) as unknown as TiledLayer;
    const map = withLayers(
      group('outer', [tileLayer('a', 1, { opacity: 0.5 }), group('inner', [tileLayer('b', 1)])], {
        opacity: 0.5,
      }),
      group('hidden-group', [tileLayer('c', 1)], { visible: false })
    );

    const result = parseTiledMap(map, fixtureTerrainByGid);

    expect(result.tileLayers.map(({ name, opacity }) => ({ name, opacity }))).toEqual([
      { name: 'a', opacity: 0.25 },
      { name: 'b', opacity: 0.5 },
    ]);
  });

  it('includes the fixture map’s own visible terrain layer', () => {
    const result = parseTiledMap(fixtureMap, fixtureTerrainByGid);
    expect(result.tileLayers.map((layer) => layer.name)).toContain('terrain');
  });

  it('rejects a visible tile layer whose size does not match the map', () => {
    const map = withLayers(tileLayer('ground', 1, { width: 10 }));
    expect(() => parseTiledMap(map, fixtureTerrainByGid)).toThrow(/"ground" size/);
  });

  it('rejects a visible tile layer with encoded data', () => {
    const map = withLayers(
      tileLayer('ground', 1, { data: 'AAAA', encoding: 'base64' } as Partial<TiledLayerTilelayer>)
    );
    expect(() => parseTiledMap(map, fixtureTerrainByGid)).toThrow(/encoding/);
  });
});

describe('parseTilesetDescription', () => {
  it('reads the placeholder test tileset and resolves its image against the tileset URL', () => {
    expect(parseTilesetDescription(tilesetXml, 1, 'http://host/drotr/maps/test.tsx')).toEqual({
      name: 'test',
      firstgid: 1,
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 3,
      columns: 3,
      margin: 0,
      spacing: 0,
      imageUrl: 'http://host/drotr/maps/terrain-atlas.png',
      imageWidth: 96,
      imageHeight: 32,
    });
  });

  it('reads the committed terrain tileset exported from the decoded atlas', () => {
    const xml = fs.readFileSync(path.join(FIXTURE_DIR, 'terrain.tsx'), 'utf-8');
    expect(parseTilesetDescription(xml, 4, 'http://host/maps/terrain.tsx')).toMatchObject({
      name: 'terrain',
      firstgid: 4,
      tileWidth: 40,
      tileHeight: 40,
      tileCount: 1552,
      columns: 16,
      imageUrl: 'http://host/maps/terrain.png',
      imageWidth: 640,
      imageHeight: 3880,
    });
  });

  it('reads margin and spacing when present', () => {
    const xml = `<tileset name="s" tilewidth="16" tileheight="16" tilecount="4" columns="2" margin="1" spacing="2"><image source="s.png" width="37" height="37"/></tileset>`;
    expect(parseTilesetDescription(xml, 1, 'http://h/s.tsx')).toMatchObject({ margin: 1, spacing: 2 });
  });

  it('rejects an image-collection tileset', () => {
    const xml = `<tileset name="c" tilewidth="16" tileheight="16" tilecount="1" columns="0"><tile id="0"><image source="a.png" width="16" height="16"/></tile></tileset>`;
    expect(() => parseTilesetDescription(xml, 1, 'http://h/c.tsx')).toThrow(/image-collection/);
  });

  it('rejects a tileset missing its grid attributes', () => {
    const xml = `<tileset name="b" tilewidth="16"><image source="b.png" width="16" height="16"/></tileset>`;
    expect(() => parseTilesetDescription(xml, 1, 'http://h/b.tsx')).toThrow(/tileheight/);
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
        // Serve each referenced tileset from disk by file name, so the
        // fixture can reference as many as it likes.
        const body = url.toString().endsWith('.tsx')
          ? fs.readFileSync(path.join(FIXTURE_DIR, path.basename(new URL(url).pathname)), 'utf-8')
          : mapJson;
        return { ok: true, text: async () => body } as Response;
      })
    );

    const result = await loadTiledMap('/maps/test.tmj');

    expect(result.width).toBe(64);
    expect(result.spawns).toHaveLength(2);
    expect(result.tilesets.map((tileset) => tileset.name)).toEqual(
      fixtureMap.tilesets.map((reference) =>
        reference.source?.replace(/\.tsx$/, '')
      )
    );
  });

  it('loads every referenced tileset, offsetting each one’s terrain by its own firstgid', async () => {
    // A second tileset whose only tile-with-terrain is local id 0: at
    // firstgid 10 it must answer to gid 10, not gid 1.
    const extraXml = `<tileset name="extra" tilewidth="32" tileheight="32" tilecount="2" columns="2"><image source="img/extra.png" width="64" height="32"/><tile id="0"><properties><property name="terrain" value="water"/></properties></tile></tileset>`;
    const terrain = tileLayer('terrain', 10);
    const map: TiledMap = {
      ...fixtureMap,
      tilesets: [
        { firstgid: 1, source: 'test.tsx' },
        { firstgid: 10, source: 'sets/extra.tsx' },
      ] as TiledMap['tilesets'],
      layers: [terrain, ...fixtureMap.layers.filter((layer) => layer.name === 'spawns')],
    };
    const fetchMock = vi.fn(async (url: string) => {
      const body = url.endsWith('extra.tsx') ? extraXml : url.endsWith('.tsx') ? tilesetXml : JSON.stringify(map);
      return { ok: true, text: async () => body } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadTiledMap('/maps/test.tmj');

    expect(result.terrain[0][0]).toBe('water');
    expect(result.tilesets.map(({ name, firstgid }) => ({ name, firstgid }))).toEqual([
      { name: 'test', firstgid: 1 },
      { name: 'extra', firstgid: 10 },
    ]);
    expect(result.tilesets[1].imageUrl).toMatch(/\/maps\/sets\/img\/extra\.png$/);
  });

  it('rejects a map that embeds its tileset', async () => {
    const map = { ...fixtureMap, tilesets: [{ ...fixtureMap.tilesets[0], source: undefined, name: 'inline' }] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(map) }) as Response)
    );

    await expect(loadTiledMap('/maps/test.tmj')).rejects.toThrow(/embeds tileset "inline"/);
  });
});
