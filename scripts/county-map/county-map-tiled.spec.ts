import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TiledLayerTilelayer, TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import {
  parseTiledMap,
  parseTilesetDescription,
} from '~/game/map/load-tiled-map';
import {
  collapseCollisionMaskPerTile,
  parseCountyMap,
  type CountyMap,
} from '~/lib/county-map';
import { buildCountyMapBytes, tileSubcells } from '~/test/county-map-fixture';

import { buildCountyTiledMap, serializeTiledMap } from './county-map-tiled';

const MAPS_DIR = path.join(process.cwd(), 'public', 'maps');
const terrainTileset = parseTilesetDescription(
  fs.readFileSync(path.join(MAPS_DIR, 'terrain.tsx'), 'utf-8'),
  1,
  'http://host/maps/terrain.tsx'
);

/**
 * A small hand-built county: a few distinct tiles at asymmetric positions
 * (so a transposed grid would show), the extremes of the atlas range, and
 * collision tiles with every number of blocked subcells.
 */
function syntheticCountyMap(): CountyMap {
  return parseCountyMap(
    buildCountyMapBytes({
      tiles: [
        { x: 1, y: 0, value: 1471 },
        { x: 0, y: 1, value: 5 },
        { x: 127, y: 0, value: 702 },
        { x: 0, y: 127, value: 1437 },
        { x: 64, y: 32, value: 211 },
      ],
      collision: [
        ...tileSubcells(2, 0, [4, 4, 4, 4]),
        ...tileSubcells(0, 2, [4, 256, 256, 4]),
        ...tileSubcells(3, 3, [256, 256, 256, 256]),
        ...tileSubcells(4, 4, [4, 4, 4, 0]),
        ...tileSubcells(5, 5, [4, 4, 0, 0]),
        ...tileSubcells(6, 6, [0, 0, 0, 256]),
      ],
    })
  );
}

function layer(map: TiledMap, name: string): TiledLayerTilelayer {
  const found = map.layers.find((l) => l.name === name);
  if (found?.type !== 'tilelayer') {
    throw new Error(`no tile layer named ${name}`);
  }
  return found;
}

describe('buildCountyTiledMap', () => {
  it('serializes to the committed golden fixture, byte for byte', async () => {
    const serialized = serializeTiledMap(
      buildCountyTiledMap(syntheticCountyMap())
    );
    // Regenerate with `npx vitest run -u` after an intended format change.
    await expect(serialized).toMatchFileSnapshot(
      './fixtures/synthetic-county.tmj'
    );
  });

  it('serializes identically on every run', () => {
    const first = serializeTiledMap(buildCountyTiledMap(syntheticCountyMap()));
    const second = serializeTiledMap(buildCountyTiledMap(syntheticCountyMap()));
    expect(second).toEqual(first);
    expect(first.endsWith('}\n')).toBe(true);
  });

  it('emits map-level fields matching terrain.tsx and the test.tmj layout', () => {
    const map = buildCountyTiledMap(syntheticCountyMap());
    expect(Object.keys(map)).toEqual([
      'type',
      'version',
      'tiledversion',
      'orientation',
      'renderorder',
      'width',
      'height',
      'tilewidth',
      'tileheight',
      'infinite',
      'nextlayerid',
      'nextobjectid',
      'compressionlevel',
      'properties',
      'tilesets',
      'layers',
    ]);
    expect(map).toMatchObject({
      orientation: 'orthogonal',
      width: 128,
      height: 128,
      tilewidth: 40,
      tileheight: 40,
      nextlayerid: 4,
      nextobjectid: 1,
    });
    expect(map.tilesets).toEqual([{ firstgid: 1, source: 'terrain.tsx' }]);
    expect(map.layers.map((l) => [l.id, l.name, l.type, l.visible])).toEqual([
      [1, 'terrain', 'tilelayer', true],
      [2, 'spawns', 'objectgroup', true],
      [3, 'collision', 'tilelayer', false],
    ]);
  });

  it('draws terrain row-major with gid = atlas index + 1', () => {
    const terrain = layer(buildCountyTiledMap(syntheticCountyMap()), 'terrain');
    expect(terrain.width).toEqual(128);
    expect(terrain.height).toEqual(128);
    const data = terrain.data as number[];
    expect(data).toHaveLength(128 * 128);
    expect(data[0]).toEqual(1); // index 0 -> gid 1
    expect(data[1]).toEqual(1472); // (1, 0): index 1471
    expect(data[128]).toEqual(6); // (0, 1): index 5
    expect(data[127]).toEqual(703); // (127, 0)
    expect(data[127 * 128]).toEqual(1438); // (0, 127)
    expect(data[32 * 128 + 64]).toEqual(212);
    expect(data.every((gid) => gid >= 1)).toBe(true);
  });

  it.each([1472, 1578, 0xffff])('throws for tile index %d', (index) => {
    const map = parseCountyMap(
      buildCountyMapBytes({ tiles: [{ x: 7, y: 9, value: index }] })
    );
    expect(() => buildCountyTiledMap(map)).toThrow(RangeError);
    expect(() => buildCountyTiledMap(map)).toThrow(/at \(7, 9\).*1471/);
  });

  it('emits an empty spawns layer', () => {
    const spawns = buildCountyTiledMap(syntheticCountyMap()).layers[1];
    expect(spawns).toMatchObject({
      type: 'objectgroup',
      draworder: 'topdown',
      objects: [],
    });
  });

  it('fills collision from collapseCollisionMaskPerTile, hidden', () => {
    const county = syntheticCountyMap();
    const debug = layer(buildCountyTiledMap(county), 'collision');
    const collapsed = collapseCollisionMaskPerTile(county);

    expect(debug.visible).toBe(false);
    expect(debug.width).toEqual(128);
    expect(debug.height).toEqual(128);
    expect(debug.data).toEqual(
      Array.from(collapsed, (blocked) => (blocked ? 1 : 0))
    );

    const blocked = (debug.data as number[]).flatMap((gid, i) =>
      gid === 1 ? [[i % 128, Math.floor(i / 128)]] : []
    );
    // Row-major order; the 3-of-4, 2-of-4 and 1-of-4 tiles stay open.
    expect(blocked).toEqual([
      [2, 0],
      [0, 2],
      [3, 3],
    ]);
  });

  it('passes parseTiledMap, which draws the collision layer hidden but reads engine collision from it', () => {
    const map = buildCountyTiledMap(syntheticCountyMap());
    const parsed = parseTiledMap(map, terrainTileset);

    expect(parsed).toMatchObject({ width: 128, height: 128, tileSize: 40 });
    expect(parsed.spawns).toEqual([]);
    // Kept (so it can be switched on), but hidden by default.
    expect(parsed.tileLayers).toEqual([
      { name: 'terrain', visible: true, data: layer(map, 'terrain').data },
      { name: 'collision', visible: false, data: layer(map, 'collision').data },
    ]);

    // Collision comes from the collision layer's gids alone.
    const collisionData = layer(map, 'collision').data as number[];
    expect(Array.from(parsed.collision)).toEqual(
      collisionData.map((gid) => (gid !== 0 ? 1 : 0))
    );
  });
});
