import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TiledLayerTilelayer, TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import {
  parseTiledMap,
  parseTilesetDescription,
} from '~/game/map/load-tiled-map';

/**
 * Tests against the **committed** `public/maps/buildings.tmj` itself. These
 * need no `.cd/` data, so they always run (CI included). That the file is
 * exactly what the converter produces from the real `BUILDING.MAP` is
 * checked by the golden suite (`building-map-golden.spec.ts`), which skips
 * without `.cd/`.
 */

const MAPS_DIR = path.join(process.cwd(), 'public', 'maps');

describe('public/maps/buildings.tmj', () => {
  const map = JSON.parse(
    fs.readFileSync(path.join(MAPS_DIR, 'buildings.tmj'), 'utf-8')
  ) as TiledMap;
  const tileset = parseTilesetDescription(
    fs.readFileSync(path.join(MAPS_DIR, 'terrain.tsx'), 'utf-8'),
    map.tilesets[0].firstgid,
    'http://host/maps/terrain.tsx'
  );
  const tileData = (name: string) =>
    (map.layers.find(
      (layer): layer is TiledLayerTilelayer =>
        layer.type === 'tilelayer' && layer.name === name
    )?.data ?? []) as number[];
  const nonEmptyCount = (data: number[]) =>
    data.filter((gid) => gid !== 0).length;

  it('references terrain.tsx as its one external tileset', () => {
    expect(map.tilesets).toEqual([{ firstgid: 1, source: 'terrain.tsx' }]);
  });

  it('has terrain, a hidden intact, a hidden ruined and an empty spawns layer, back to front', () => {
    expect(map.layers.map((l) => [l.name, l.type, l.visible])).toEqual([
      ['terrain', 'tilelayer', true],
      ['intact', 'tilelayer', false],
      ['ruined', 'tilelayer', false],
      ['spawns', 'objectgroup', true],
    ]);
  });

  it('sets every terrain cell and the recorded overlay cells, all inside the verbatim range', () => {
    const terrain = tileData('terrain');
    expect(terrain).toHaveLength(128 * 128);
    expect(nonEmptyCount(terrain)).toEqual(128 * 128);
    expect(nonEmptyCount(tileData('intact'))).toEqual(4940);
    expect(nonEmptyCount(tileData('ruined'))).toEqual(2767);
    const all = [...terrain, ...tileData('intact'), ...tileData('ruined')];
    // gid = atlas index + 1, and the highest index used is 1451.
    expect(Math.max(...all)).toEqual(1452);
  });

  it('passes parseTiledMap as a 128x128, 40 px map with no spawns', () => {
    const parsed = parseTiledMap(map, tileset);
    expect(parsed.width).toEqual(128);
    expect(parsed.height).toEqual(128);
    expect(parsed.tileSize).toEqual(40);
    expect(parsed.spawns).toEqual([]);
    // All three are kept; only terrain starts out shown.
    expect(parsed.tileLayers).toEqual([
      { name: 'terrain', visible: true, data: tileData('terrain') },
      { name: 'intact', visible: false, data: tileData('intact') },
      { name: 'ruined', visible: false, data: tileData('ruined') },
    ]);
    expect(parsed.collision).toHaveLength(128 * 128);
  });
});
