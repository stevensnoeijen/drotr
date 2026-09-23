import fs from 'node:fs';
import path from 'node:path';

import type { TiledLayer, TiledLayerTilelayer, TiledMap } from 'tiled-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadTiledMap,
  parseTiledMap,
  parseTilesetDescription,
  TiledMapError,
  type MapTileset,
} from './load-tiled-map';

const FIXTURE_DIR = path.resolve(import.meta.dirname, '../../../public/maps');
const mapJson = fs.readFileSync(path.join(FIXTURE_DIR, 'test.tmj'), 'utf-8');
const terrainXml = fs.readFileSync(path.join(FIXTURE_DIR, 'terrain.tsx'), 'utf-8');
const fixtureMap = JSON.parse(mapJson) as TiledMap;
const terrainTileset = parseTilesetDescription(terrainXml, 1, 'http://host/maps/terrain.tsx');

/** A tiny synthetic tileset: local ids 0-3, of which 1 is blocked. */
function smallTileset(firstgid = 1, blocked: number[] = [1]): MapTileset {
  return {
    firstgid,
    tileWidth: 32,
    tileHeight: 32,
    tileCount: 4,
    columns: 2,
    margin: 0,
    spacing: 0,
    imageUrl: 'http://host/small.png',
    blockedTileIds: new Set(blocked),
  };
}

/** A 2x2 orthogonal map with the given `terrain` layer data. */
function tinyMap(data: number[], extraLayers: TiledLayer[] = []): TiledMap {
  return {
    ...fixtureMap,
    width: 2,
    height: 2,
    layers: [
      { ...fixtureMap.layers[0], name: 'terrain', width: 2, height: 2, data } as TiledLayerTilelayer,
      ...extraLayers,
      fixtureMap.layers.find((layer) => layer.name === 'spawns')!,
    ],
  };
}

/** A map-sized tile layer filled with one gid, for layer-collection tests. */
function tileLayer(name: string, gid: number, extra: Partial<TiledLayerTilelayer> = {}): TiledLayerTilelayer {
  return {
    ...(fixtureMap.layers.find((layer) => layer.name === 'terrain') as TiledLayerTilelayer),
    name,
    data: new Array(fixtureMap.width * fixtureMap.height).fill(gid),
    visible: true,
    ...extra,
  };
}

function withLayers(...extra: TiledLayer[]): TiledMap {
  const terrain = fixtureMap.layers.find((layer) => layer.name === 'terrain')!;
  const spawns = fixtureMap.layers.find((layer) => layer.name === 'spawns')!;
  return { ...fixtureMap, layers: [terrain, ...extra, spawns] };
}

describe('parseTiledMap', () => {
  it('parses the committed test map to the expected dimensions and spawn list', () => {
    const result = parseTiledMap(fixtureMap, terrainTileset);

    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.tileSize).toBe(32);
    expect(result.collision.length).toBe(64 * 64);
    expect(result.spawns).toEqual([
      { id: 'spawn-1', position: { x: 176, y: 176 } },
      { id: 'spawn-2', position: { x: 1872, y: 1872 } },
    ]);
  });

  it('blocks a cell whose tile is marked blocked, and only that', () => {
    // Local ids 0 and 1 at firstgid 1: gid 1 walkable, gid 2 blocked.
    const result = parseTiledMap(tinyMap([1, 2, 1, 1]), smallTileset());
    expect([...result.collision]).toEqual([0, 1, 0, 0]);
  });

  it('applies the firstgid offset when looking a tile’s blocked flag up', () => {
    // At firstgid 10 the blocked local id 1 is gid 11.
    const result = parseTiledMap(tinyMap([10, 11, 12, 13]), smallTileset(10));
    expect([...result.collision]).toEqual([0, 1, 0, 0]);
  });

  it('blocks an empty cell (gid 0)', () => {
    const result = parseTiledMap(tinyMap([0, 1, 1, 1]), smallTileset());
    expect([...result.collision]).toEqual([1, 0, 0, 0]);
  });

  it('ignores flip flags when deciding walkability', () => {
    const flipped = (gid: number) => (gid | 0x80000000) >>> 0;
    const result = parseTiledMap(tinyMap([flipped(1), flipped(2), 1, 1]), smallTileset());
    expect([...result.collision]).toEqual([0, 1, 0, 0]);
  });

  it('rejects a gid no tileset covers', () => {
    expect(() => parseTiledMap(tinyMap([1, 99, 1, 1]), smallTileset())).toThrow(/unknown tile gid 99/i);
  });

  it('rejects a map missing the terrain layer', () => {
    const map: TiledMap = {
      ...fixtureMap,
      layers: fixtureMap.layers.filter((layer) => layer.name !== 'terrain'),
    };

    expect(() => parseTiledMap(map, terrainTileset)).toThrow(TiledMapError);
    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/terrain/i);
  });

  it('rejects a non-orthogonal orientation', () => {
    const map = { ...fixtureMap, orientation: 'isometric' } as TiledMap;

    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/orientation/i);
  });

  it('rejects a terrain layer whose size does not match the map', () => {
    const map: TiledMap = {
      ...fixtureMap,
      layers: fixtureMap.layers.map((layer) =>
        layer.name === 'terrain' ? { ...layer, width: 32 } : layer
      ),
    };

    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/size/i);
  });
});

describe('parseTiledMap tile layers', () => {
  it('draws the test map from its terrain layer, every cell a real terrain tile', () => {
    const result = parseTiledMap(fixtureMap, terrainTileset);

    expect(result.tileLayers).toHaveLength(1);
    expect(result.tileset).toEqual(terrainTileset);
    // Grass (tile 1072) and a wall (tile 210) at firstgid 1, nothing else.
    expect(new Set(result.tileLayers[0])).toEqual(new Set([1073, 211]));
  });

  it('exposes visible tile layers back to front', () => {
    const map = withLayers(tileLayer('decoration', 0), tileLayer('overlay', 5));
    const result = parseTiledMap(map, terrainTileset);

    // The test map's terrain layer starts with a wall (gid 211).
    expect(result.tileLayers.map((layer) => layer[0])).toEqual([211, 0, 5]);
  });

  it('leaves out hidden layers', () => {
    const map = withLayers(tileLayer('hidden', 5, { visible: false }));
    const result = parseTiledMap(map, terrainTileset);

    expect(result.tileLayers.map((layer) => layer[0])).toEqual([211]);
  });

  it('ignores group layers and what is inside them', () => {
    const group = { ...tileLayer('group', 0), type: 'group', layers: [tileLayer('inside', 1)] } as unknown as TiledLayer;
    const result = parseTiledMap(withLayers(group), terrainTileset);

    expect(result.tileLayers.map((layer) => layer[0])).toEqual([211]);
  });

  it('rejects a visible tile layer whose size does not match the map', () => {
    const map = withLayers(tileLayer('overlay', 1, { width: 10 }));
    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/"overlay" size/);
  });

  it('rejects a visible tile layer with encoded data', () => {
    const map = withLayers(
      tileLayer('overlay', 1, { data: 'AAAA', encoding: 'base64' } as Partial<TiledLayerTilelayer>)
    );
    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/encoding/);
  });
});

describe('parseTilesetDescription', () => {
  it('reads the committed terrain tileset, resolving its image against the tileset URL', () => {
    expect(parseTilesetDescription(terrainXml, 4, 'http://host/drotr/maps/terrain.tsx')).toMatchObject({
      firstgid: 4,
      tileWidth: 40,
      tileHeight: 40,
      tileCount: 1552,
      columns: 16,
      margin: 0,
      spacing: 0,
      imageUrl: 'http://host/drotr/maps/terrain.png',
    });
  });

  it('reads the terrain tileset’s blocked tiles', () => {
    const { blockedTileIds } = terrainTileset;
    expect(blockedTileIds.size).toBe(1226);
    // A wall, water and an unused slot block; grass and the drawbridge don't.
    expect([210, 398, 1472].every((id) => blockedTileIds.has(id))).toBe(true);
    expect([1072, 1482].some((id) => blockedTileIds.has(id))).toBe(false);
  });

  it('only counts a blocked property whose value is true', () => {
    const xml = `<tileset name="p" tilewidth="16" tileheight="16" tilecount="3" columns="3"><image source="p.png" width="48" height="16"/>
      <tile id="0"><properties><property name="blocked" type="bool" value="true"/></properties></tile>
      <tile id="1"><properties><property name="blocked" type="bool" value="false"/></properties></tile>
      <tile id="2"><properties><property name="other" type="bool" value="true"/></properties></tile>
    </tileset>`;
    expect([...parseTilesetDescription(xml, 1, 'http://h/p.tsx').blockedTileIds]).toEqual([0]);
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
        // Serve the referenced tileset from disk by file name.
        const body = url.toString().endsWith('.tsx')
          ? fs.readFileSync(path.join(FIXTURE_DIR, path.basename(new URL(url).pathname)), 'utf-8')
          : mapJson;
        return { ok: true, text: async () => body } as Response;
      })
    );

    const result = await loadTiledMap('/maps/test.tmj');

    expect(result.width).toBe(64);
    expect(result.spawns).toHaveLength(2);
    expect(result.tileset.imageUrl).toMatch(/\/maps\/terrain\.png$/);
  });

  it.each([0, 2])('rejects a map that references %i tilesets', async (count) => {
    const map = {
      ...fixtureMap,
      tilesets: Array.from({ length: count }, (_, i) => ({ firstgid: 1 + i * 2000, source: 'terrain.tsx' })),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(map) }) as Response)
    );

    await expect(loadTiledMap('/maps/test.tmj')).rejects.toThrow(/exactly one external tileset/);
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
