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

/** A tiny synthetic tileset: local ids 0-3. */
function smallTileset(firstgid = 1): MapTileset {
  return {
    firstgid,
    tileWidth: 32,
    tileHeight: 32,
    tileCount: 4,
    columns: 2,
    imageUrl: 'http://host/small.png',
  };
}

/**
 * A 2x2 orthogonal map with the given `terrain` and `collision` layer data.
 * `collision` defaults to all-open (every cell `0`) so tests that only care
 * about the terrain layer don't have to spell it out.
 */
function tinyMap(
  terrainData: number[],
  collisionData: number[] = [0, 0, 0, 0],
  extraLayers: TiledLayer[] = []
): TiledMap {
  return {
    ...fixtureMap,
    width: 2,
    height: 2,
    layers: [
      {
        ...fixtureMap.layers[0],
        name: 'terrain',
        width: 2,
        height: 2,
        data: terrainData,
      } as TiledLayerTilelayer,
      {
        ...fixtureMap.layers[0],
        name: 'collision',
        width: 2,
        height: 2,
        data: collisionData,
        visible: false,
      } as TiledLayerTilelayer,
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
  const collision = fixtureMap.layers.find((layer) => layer.name === 'collision')!;
  const spawns = fixtureMap.layers.find((layer) => layer.name === 'spawns')!;
  return { ...fixtureMap, layers: [terrain, collision, ...extra, spawns] };
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

  it('blocks exactly the collision layer\'s non-zero cells', () => {
    const result = parseTiledMap(tinyMap([1, 1, 1, 1], [0, 2, 0, 0]), smallTileset());
    expect([...result.collision]).toEqual([0, 1, 0, 0]);
  });

  it('is unaffected by the terrain layer\'s gids: an empty terrain cell is not implicitly blocked', () => {
    const result = parseTiledMap(tinyMap([0, 0, 0, 0], [0, 0, 0, 0]), smallTileset());
    expect([...result.collision]).toEqual([0, 0, 0, 0]);
  });

  it('ignores flip flags when deciding walkability', () => {
    const flipped = (gid: number) => (gid | 0x80000000) >>> 0;
    const result = parseTiledMap(tinyMap([1, 1, 1, 1], [flipped(2), 0, 0, 0]), smallTileset());
    expect([...result.collision]).toEqual([1, 0, 0, 0]);
  });

  it('accepts a terrain gid no tileset covers: collision never resolves terrain gids', () => {
    const result = parseTiledMap(tinyMap([1, 99, 1, 1]), smallTileset());
    expect([...result.collision]).toEqual([0, 0, 0, 0]);
  });

  it('rejects a map missing the terrain layer', () => {
    const map: TiledMap = {
      ...fixtureMap,
      layers: fixtureMap.layers.filter((layer) => layer.name !== 'terrain'),
    };

    expect(() => parseTiledMap(map, terrainTileset)).toThrow(TiledMapError);
    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/terrain/i);
  });

  it('rejects a map missing the collision layer', () => {
    const map: TiledMap = {
      ...fixtureMap,
      layers: fixtureMap.layers.filter((layer) => layer.name !== 'collision'),
    };

    expect(() => parseTiledMap(map, terrainTileset)).toThrow(TiledMapError);
    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/collision/i);
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

  it('rejects a collision layer whose size does not match the map', () => {
    const map: TiledMap = {
      ...fixtureMap,
      layers: fixtureMap.layers.map((layer) =>
        layer.name === 'collision' ? { ...layer, width: 32 } : layer
      ),
    };

    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/size/i);
  });

  it('rejects a collision layer with encoded data', () => {
    const map: TiledMap = {
      ...fixtureMap,
      layers: fixtureMap.layers.map((layer) =>
        layer.name === 'collision'
          ? ({ ...layer, data: 'AAAA', encoding: 'base64' } as TiledLayerTilelayer)
          : layer
      ),
    };

    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/encoding/);
  });
});

describe('parseTiledMap tile layers', () => {
  it('draws the test map from its terrain layer, every cell a real terrain tile', () => {
    const result = parseTiledMap(fixtureMap, terrainTileset);

    const terrainLayer = result.tileLayers.find((layer) => layer.name === 'terrain')!;
    expect(terrainLayer).toMatchObject({ name: 'terrain', visible: true });
    expect(result.tileset).toEqual(terrainTileset);
    // Grass (tile 1072) and a wall (tile 210) at firstgid 1, nothing else.
    expect(new Set(terrainLayer.data)).toEqual(new Set([1073, 211]));
  });

  it('exposes tile layers back to front, with their names', () => {
    const map = withLayers(tileLayer('decoration', 0), tileLayer('overlay', 5));
    const result = parseTiledMap(map, terrainTileset);

    // The test map's terrain layer starts with a wall (gid 211).
    expect(result.tileLayers.map((layer) => [layer.name, layer.data[0]])).toEqual([
      ['terrain', 211],
      ['collision', 1],
      ['decoration', 0],
      ['overlay', 5],
    ]);
  });

  it('keeps hidden layers, flagged not visible, so they can be switched on', () => {
    const map = withLayers(
      tileLayer('hidden', 5, { visible: false }),
      tileLayer('shown', 6),
      tileLayer('unflagged', 7, { visible: undefined })
    );
    const result = parseTiledMap(map, terrainTileset);

    expect(result.tileLayers.map((layer) => [layer.name, layer.visible, layer.data[0]])).toEqual([
      ['terrain', true, 211],
      ['collision', false, 1],
      ['hidden', false, 5],
      ['shown', true, 6],
      ['unflagged', true, 7],
    ]);
  });

  it('takes collision from the collision layer alone, whatever any other layer draws', () => {
    const baseline = parseTiledMap(fixtureMap, terrainTileset).collision;
    const terrain = fixtureMap.layers.find((layer) => layer.name === 'terrain') as TiledLayerTilelayer;
    const collision = fixtureMap.layers.find((layer) => layer.name === 'collision') as TiledLayerTilelayer;
    // A hidden terrain layer, and an all-open overlay drawn over it: neither
    // should move the collision result away from the collision layer.
    const map = {
      ...fixtureMap,
      layers: [
        { ...terrain, visible: false },
        collision,
        tileLayer('overlay', 0),
        fixtureMap.layers.find((layer) => layer.name === 'spawns')!,
      ],
    };

    expect(parseTiledMap(map, terrainTileset).collision).toEqual(baseline);
  });

  it('ignores group layers and what is inside them', () => {
    const group = { ...tileLayer('group', 0), type: 'group', layers: [tileLayer('inside', 1)] } as unknown as TiledLayer;
    const result = parseTiledMap(withLayers(group), terrainTileset);

    expect(result.tileLayers.map((layer) => layer.data[0])).toEqual([211, 1]);
  });

  it('rejects a tile layer, hidden or not, whose size does not match the map', () => {
    const map = withLayers(tileLayer('overlay', 1, { width: 10 }));
    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/"overlay" size/);
    const hidden = withLayers(tileLayer('hidden', 1, { width: 10, visible: false }));
    expect(() => parseTiledMap(hidden, terrainTileset)).toThrow(/"hidden" size/);
  });

  it('rejects a tile layer with encoded data', () => {
    const map = withLayers(
      tileLayer('overlay', 1, { data: 'AAAA', encoding: 'base64' } as Partial<TiledLayerTilelayer>)
    );
    expect(() => parseTiledMap(map, terrainTileset)).toThrow(/encoding/);
  });
});

describe('parseTiledMap real fagaras.tmj regression', () => {
  // Per docs/ART_FORMAT.md, "Tile walkability", these five tile ids were
  // where the removed per-tile `blocked` flag disagreed with the majority
  // of the original county's per-subcell mask: 735 (gravel) was walkable
  // under the old flag but the counties block it on half its subcells;
  // 1053, 1054, 1388 and 1389 (rock) were blocked under the old flag but
  // the counties mostly leave them open.
  const OLD_FLAG_BLOCKED: ReadonlyMap<number, boolean> = new Map([
    [735, false],
    [1053, true],
    [1054, true],
    [1388, true],
    [1389, true],
  ]);

  it('now matches the collision layer on at least one cell where the old flag and the mask disagreed', () => {
    const map = JSON.parse(
      fs.readFileSync(path.join(FIXTURE_DIR, 'fagaras.tmj'), 'utf-8')
    ) as TiledMap;
    const tileset = parseTilesetDescription(
      fs.readFileSync(path.join(FIXTURE_DIR, 'terrain.tsx'), 'utf-8'),
      map.tilesets[0].firstgid,
      'http://host/maps/terrain.tsx'
    );
    const result = parseTiledMap(map, tileset);

    const terrain = map.layers.find((layer) => layer.name === 'terrain') as TiledLayerTilelayer;
    const terrainData = terrain.data as number[];

    const disagreements = terrainData.flatMap((gid, index) => {
      const tileId = gid - tileset.firstgid;
      const oldFlag = OLD_FLAG_BLOCKED.get(tileId);
      if (oldFlag === undefined) return [];
      const nowBlocked = result.collision[index] === 1;
      return nowBlocked !== oldFlag ? [index] : [];
    });

    // At least one cell now disagrees with what the removed per-tile flag
    // would have said, proving collision comes from the mask, not the tile.
    expect(disagreements.length).toBeGreaterThan(0);
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
      imageUrl: 'http://host/drotr/maps/terrain.png',
    });
  });

  it.each(['margin="1"', 'spacing="2"'])('rejects a tileset with %s between tiles', (attribute) => {
    const xml = `<tileset name="s" tilewidth="16" tileheight="16" tilecount="4" columns="2" ${attribute}><image source="s.png" width="37" height="37"/></tileset>`;
    expect(() => parseTilesetDescription(xml, 1, 'http://h/s.tsx')).toThrow(/tightly packed/);
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
