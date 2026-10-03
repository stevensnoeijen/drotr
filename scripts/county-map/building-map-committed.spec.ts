import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TiledLayerObjectgroup, TiledLayerTilelayer, TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import {
  parseTiledMap,
  parseTilesetDescription,
} from '~/game/map/load-tiled-map';

/**
 * Tests against the **committed** `public/maps/buildings.tmj` itself. These
 * need no `.cd/` data, so they always run (CI included).
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

  it('has terrain, a hidden intact, a hidden ruined, a hidden collision, an empty spawns layer and a prefabs layer, back to front', () => {
    expect(map.layers.map((l) => [l.name, l.type, l.visible])).toEqual([
      ['terrain', 'tilelayer', true],
      ['intact', 'tilelayer', false],
      ['ruined', 'tilelayer', false],
      ['collision', 'tilelayer', false],
      ['spawns', 'objectgroup', true],
      ['prefabs', 'objectgroup', true],
    ]);
  });

  describe('prefabs layer', () => {
    const prefabs = (
      map.layers.find(
        (layer): layer is TiledLayerObjectgroup => layer.name === 'prefabs'
      )?.objects ?? []
    ).map((object) => ({
      ...object,
      properties: Object.fromEntries(
        (object.properties ?? []).map((p) => [p.name, p.value])
      ),
    }));

    it('marks 57 prefabs: 42 bridges, 3 towers, 12 castles', () => {
      const count = (type: string) =>
        prefabs.filter((o) => o.type === type).length;
      expect([count('bridge'), count('tower'), count('castle')]).toEqual([
        42, 3, 12,
      ]);
      expect(new Set(prefabs.map((o) => o.name)).size).toEqual(57);
    });

    it('splits the bridges into 28 grass-bank and 14 rock-bank', () => {
      const bank = (value: string) =>
        prefabs.filter((o) => o.properties.bank === value).length;
      expect([bank('grass'), bank('rock')]).toEqual([28, 14]);
    });

    it('places rects on tile boundaries, in bounds, overlapping nothing', () => {
      for (const o of prefabs) {
        expect([o.x, o.y, o.width, o.height].map((v) => v % 40)).toEqual([
          0, 0, 0, 0,
        ]);
        expect(o.width).toBeGreaterThan(0);
        expect(o.x + o.width).toBeLessThanOrEqual(128 * 40);
        expect(o.y + o.height).toBeLessThanOrEqual(128 * 40);
      }
      for (const [i, a] of prefabs.entries()) {
        for (const b of prefabs.slice(i + 1)) {
          const overlaps =
            a.x < b.x + b.width &&
            b.x < a.x + a.width &&
            a.y < b.y + b.height &&
            b.y < a.y + a.height;
          expect(overlaps, `${a.name} vs ${b.name}`).toBe(false);
        }
      }
    });

    it('marks the unused rock-3 castle, 21x21 tiles at (89, 85)', () => {
      const rock3 = prefabs.find((o) => o.name === 'castle-rock-3');
      expect(rock3).toMatchObject({
        x: 89 * 40,
        y: 85 * 40,
        width: 21 * 40,
        height: 21 * 40,
      });
    });
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
    // All four are kept; only terrain starts out shown.
    expect(parsed.tileLayers).toEqual([
      { name: 'terrain', visible: true, data: tileData('terrain') },
      { name: 'intact', visible: false, data: tileData('intact') },
      { name: 'ruined', visible: false, data: tileData('ruined') },
      { name: 'collision', visible: false, data: tileData('collision') },
    ]);
    expect(parsed.collision).toHaveLength(128 * 128);
    // All open: real building collision is not yet derived.
    expect([...parsed.collision].every((cell) => cell === 0)).toBe(true);
  });
});
