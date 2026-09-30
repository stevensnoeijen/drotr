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
  SIGNPOST_TILE_INDEX,
  type CountyMap,
} from '~/lib/county-map';
import { buildCountyMapBytes, tileSubcells } from '~/test/county-map-fixture';

import { COLLISION_MARKER_TILE_ID } from '~/lib/art/collision-marker';

import type { BuildingSite } from '../dracula-exe';

import {
  BUILDING_SITES_LAYER_NAME,
  buildCountyTiledMap,
  buildingSiteObjects,
  edgeSpawnTiles,
  serializeTiledMap,
} from './county-map-tiled';

const COLLISION_MARKER_GID = COLLISION_MARKER_TILE_ID + 1;

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
      nextlayerid: 5,
      nextobjectid: 1,
    });
    expect(map.tilesets).toEqual([{ firstgid: 1, source: 'terrain.tsx' }]);
    expect(map.layers.map((l) => [l.id, l.name, l.type, l.visible])).toEqual([
      [1, 'terrain', 'tilelayer', true],
      [2, 'spawns', 'objectgroup', true],
      [3, 'collision', 'tilelayer', false],
      [4, 'building-sites', 'objectgroup', true],
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

  it('emits an empty spawns layer for a county without signposts', () => {
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
      Array.from(collapsed, (blocked) => (blocked ? COLLISION_MARKER_GID : 0))
    );

    const blocked = (debug.data as number[]).flatMap((gid, i) =>
      gid === COLLISION_MARKER_GID ? [[i % 128, Math.floor(i / 128)]] : []
    );
    // Row-major order; the 3-of-4 and 2-of-4 tiles block too, only the
    // 1-of-4 tile stays open.
    expect(blocked).toEqual([
      [2, 0],
      [0, 2],
      [3, 3],
      [4, 4],
      [5, 5],
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

  describe('edge spawns from map-edge signposts', () => {
    /** Signpost tile, with the top half blocked like every real one. */
    const signpost = (x: number, y: number) => ({
      tile: { x, y, value: SIGNPOST_TILE_INDEX },
      collision: tileSubcells(x, y, [4, 4, 0, 0]),
    });
    const solid = (x: number, y: number) => tileSubcells(x, y, [4, 4, 4, 4]);

    function signpostCounty(
      signposts: [number, number][],
      extraBlocked: [number, number][] = []
    ): CountyMap {
      const placed = signposts.map(([x, y]) => signpost(x, y));
      return parseCountyMap(
        buildCountyMapBytes({
          tiles: placed.map((p) => p.tile),
          collision: [
            ...placed.flatMap((p) => p.collision),
            ...extraBlocked.flatMap(([x, y]) => solid(x, y)),
          ],
        })
      );
    }

    // One signpost per edge plus a corner; the top one has its first
    // inward tile blocked too, so it steps on to the second.
    const county = () =>
      signpostCounty(
        [
          [0, 10],
          [20, 0],
          [127, 50],
          [40, 127],
          [127, 127],
        ],
        [[20, 1]]
      );

    it('steps inward from each edge (diagonally from a corner) to the nearest walkable tile', () => {
      const map = county();
      expect(edgeSpawnTiles(map, collapseCollisionMaskPerTile(map))).toEqual([
        [20, 2],
        [1, 10],
        [126, 50],
        [40, 126],
        [126, 126],
      ]);
    });

    it('emits edge-N point objects at those tile centres, in row-major signpost order', () => {
      const tiled = buildCountyTiledMap(county());
      const spawns = tiled.layers[1];
      if (spawns.type !== 'objectgroup') throw new Error('no spawns layer');

      expect(
        spawns.objects.map(({ id, name, x, y }) => [id, name, x, y])
      ).toEqual([
        [1, 'edge-1', 20 * 40 + 20, 2 * 40 + 20],
        [2, 'edge-2', 1 * 40 + 20, 10 * 40 + 20],
        [3, 'edge-3', 126 * 40 + 20, 50 * 40 + 20],
        [4, 'edge-4', 40 * 40 + 20, 126 * 40 + 20],
        [5, 'edge-5', 126 * 40 + 20, 126 * 40 + 20],
      ]);
      for (const object of spawns.objects) {
        expect(object).toMatchObject({
          point: true,
          type: '',
          width: 0,
          height: 0,
        });
      }
      expect(tiled.nextobjectid).toBe(6);
    });

    it('puts every edge spawn on a walkable cell of the parsed collision grid', () => {
      const parsed = parseTiledMap(buildCountyTiledMap(county()), terrainTileset);
      expect(parsed.spawns).toHaveLength(5);
      for (const { position } of parsed.spawns) {
        const x = Math.floor(position.x / 40);
        const y = Math.floor(position.y / 40);
        expect(parsed.collision[y * 128 + x]).toBe(0);
      }
    });

    it('fails when no tile within 3 steps inward is walkable', () => {
      const map = signpostCounty(
        [[0, 100]],
        [
          [1, 100],
          [2, 100],
          [3, 100],
        ]
      );
      expect(() => buildCountyTiledMap(map)).toThrow(
        /No walkable tile within 3 tiles inward of the signpost at \(0, 100\)/
      );
    });
  });
});

describe('building sites', () => {
  const castle: BuildingSite = {
    category: 'castle',
    levels: [
      { level: '1', type: 2, slot: 0, footprint: { x: 10, y: 20, width: 11, height: 11 } },
      { level: '2', type: 2, slot: 1, footprint: { x: 8, y: 18, width: 15, height: 15 } },
    ],
  };
  const bridge: BuildingSite = {
    category: 'bridge',
    orientation: 'vertical',
    levels: [
      { level: 'wood', type: 0, slot: 1, footprint: { x: 5, y: 6, width: 1, height: 4 } },
      { level: 'stone', type: 0, slot: 8, footprint: { x: 5, y: 6, width: 2, height: 4 } },
    ],
  };
  const tower: BuildingSite = {
    category: 'tower',
    levels: [{ level: 'grass', type: 1, slot: 0, footprint: { x: 0, y: 0, width: 2, height: 3 } }],
  };

  it('emits one point per site at the centre of its first level, classed by category', () => {
    const [castleObject, bridgeObject, towerObject, secondCastle] = buildingSiteObjects(
      [castle, bridge, tower, castle],
      7
    );
    expect(castleObject).toMatchObject({
      id: 7,
      name: 'castle-1',
      type: 'castle',
      point: true,
      x: 15.5 * 40,
      y: 25.5 * 40,
    });
    expect(bridgeObject).toMatchObject({ id: 8, name: 'bridge-1', x: 5.5 * 40, y: 8 * 40 });
    expect(towerObject).toMatchObject({ id: 9, name: 'tower-1', x: 40, y: 1.5 * 40 });
    expect(secondCastle).toMatchObject({ id: 10, name: 'castle-2' });
  });

  it('lists every level and its footprint as alphabetically ordered properties', () => {
    const [castleObject, bridgeObject] = buildingSiteObjects([castle, bridge]);
    expect(castleObject.properties).toEqual([
      { name: 'footprint:1', type: 'string', value: '10,20,11,11' },
      { name: 'footprint:2', type: 'string', value: '8,18,15,15' },
      { name: 'levels', type: 'string', value: '1,2' },
    ]);
    expect(bridgeObject.properties).toEqual([
      { name: 'footprint:stone', type: 'string', value: '5,6,2,4' },
      { name: 'footprint:wood', type: 'string', value: '5,6,1,4' },
      { name: 'levels', type: 'string', value: 'wood,stone' },
      { name: 'orientation', type: 'string', value: 'vertical' },
    ]);
  });

  it('adds them as a building-sites layer, numbered after the edge spawns', () => {
    const county = parseCountyMap(
      buildCountyMapBytes({ tiles: [{ x: 0, y: 40, value: SIGNPOST_TILE_INDEX }] })
    );
    const map = buildCountyTiledMap(county, [castle, tower]);
    const layer = map.layers.find((l) => l.name === BUILDING_SITES_LAYER_NAME);
    if (layer?.type !== 'objectgroup') throw new Error('no building-sites layer');

    expect(layer.objects.map((object) => [object.id, object.name])).toEqual([
      [2, 'castle-1'],
      [3, 'tower-1'],
    ]);
    expect(map.nextobjectid).toBe(4);
    // The engine ignores the layer: it still parses as before.
    expect(parseTiledMap(map, terrainTileset).spawns.map((s) => s.id)).toEqual(['edge-1']);
  });
});
