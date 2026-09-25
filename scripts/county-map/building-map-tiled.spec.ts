import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TiledLayerTilelayer, TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import {
  parseTiledMap,
  parseTilesetDescription,
} from '~/game/map/load-tiled-map';
import { parseBuildingMap, type BuildingMap } from '~/lib/building-map';
import { parseCountyMap } from '~/lib/county-map';
import {
  buildBuildingMapBytes,
  type BuildingMapFixtureOptions,
} from '~/test/building-map-fixture';
import { buildCountyMapBytes } from '~/test/county-map-fixture';

import { buildBuildingsTiledMap } from './building-map-tiled';
import { buildCountyTiledMap, serializeTiledMap } from './county-map-tiled';

const MAPS_DIR = path.join(process.cwd(), 'public', 'maps');
const terrainTileset = parseTilesetDescription(
  fs.readFileSync(path.join(MAPS_DIR, 'terrain.tsx'), 'utf-8'),
  1,
  'http://host/maps/terrain.tsx'
);

/**
 * A small hand-built building file: a few interior tiles and overlays at
 * asymmetric positions (so a transposed grid would show), plus the atlas
 * extremes the real file uses.
 */
function syntheticBuildingMap(
  options: BuildingMapFixtureOptions = {
    interior: [
      { x: 1, y: 0, value: 1382 },
      { x: 0, y: 1, value: 5 },
      { x: 127, y: 127, value: 1471 },
    ],
    intact: [
      { x: 1, y: 0, value: 1449 },
      { x: 3, y: 2, value: 1 },
    ],
    ruined: [
      { x: 0, y: 1, value: 1451 },
      { x: 2, y: 3, value: 7 },
    ],
  }
): BuildingMap {
  return parseBuildingMap(buildBuildingMapBytes(options));
}

function layer(map: TiledMap, name: string): TiledLayerTilelayer {
  const found = map.layers.find((l) => l.name === name);
  if (found?.type !== 'tilelayer') {
    throw new Error(`no tile layer named ${name}`);
  }
  return found;
}

/** The non-empty cells of a layer, as `[x, y, gid]`, row-major. */
function nonEmpty(data: number[]): [number, number, number][] {
  return data.flatMap((gid, i) =>
    gid !== 0
      ? [[i % 128, Math.floor(i / 128), gid] as [number, number, number]]
      : []
  );
}

describe('buildBuildingsTiledMap', () => {
  it('shares the county map shell: key order, size, tileset reference', () => {
    const map = buildBuildingsTiledMap(syntheticBuildingMap());
    const county = buildCountyTiledMap(parseCountyMap(buildCountyMapBytes()));
    expect(Object.keys(map)).toEqual(Object.keys(county));
    expect(map).toMatchObject({
      orientation: 'orthogonal',
      width: 128,
      height: 128,
      tilewidth: 40,
      tileheight: 40,
      nextlayerid: 6,
      nextobjectid: 1,
    });
    expect(map.tilesets).toEqual([{ firstgid: 1, source: 'terrain.tsx' }]);
  });

  it('emits terrain, intact (hidden), ruined (hidden), collision (hidden) and spawns, back to front', () => {
    const map = buildBuildingsTiledMap(syntheticBuildingMap());
    expect(map.layers.map((l) => [l.id, l.name, l.type, l.visible])).toEqual([
      [1, 'terrain', 'tilelayer', true],
      [2, 'intact', 'tilelayer', false],
      [3, 'ruined', 'tilelayer', false],
      [4, 'collision', 'tilelayer', false],
      [5, 'spawns', 'objectgroup', true],
    ]);
    expect(map.layers[4]).toMatchObject({ draworder: 'topdown', objects: [] });
  });

  it('leaves collision all open (gid 0): real building collision is not yet derived', () => {
    const collision = layer(
      buildBuildingsTiledMap(syntheticBuildingMap()),
      'collision'
    );
    expect(collision.width).toEqual(128);
    expect(collision.height).toEqual(128);
    expect(nonEmpty(collision.data as number[])).toEqual([]);
  });

  it('draws every terrain cell row-major, gid = atlas index + 1', () => {
    const data = layer(
      buildBuildingsTiledMap(syntheticBuildingMap()),
      'terrain'
    ).data as number[];
    expect(data).toHaveLength(128 * 128);
    expect(data[0]).toEqual(1); // index 0 is a real tile -> gid 1
    expect(data[1]).toEqual(1383); // (1, 0): index 1382
    expect(data[128]).toEqual(6); // (0, 1): index 5
    expect(data[128 * 128 - 1]).toEqual(1472); // (127, 127): index 1471
    expect(data.every((gid) => gid >= 1)).toBe(true);
  });

  it('leaves intact empty (gid 0) where its grid is 0', () => {
    const intact = layer(
      buildBuildingsTiledMap(syntheticBuildingMap()),
      'intact'
    );
    expect(intact.width).toEqual(128);
    expect(intact.height).toEqual(128);
    expect(nonEmpty(intact.data as number[])).toEqual([
      [1, 0, 1450],
      [3, 2, 2],
    ]);
  });

  it('leaves ruined empty (gid 0) where its grid is 0', () => {
    const ruined = layer(
      buildBuildingsTiledMap(syntheticBuildingMap()),
      'ruined'
    );
    expect(nonEmpty(ruined.data as number[])).toEqual([
      [0, 1, 1452],
      [2, 3, 8],
    ]);
  });

  it.each(['interior', 'intact', 'ruined'] as const)(
    'throws for a %s tile index above 1471',
    (grid) => {
      const map = syntheticBuildingMap({
        [grid]: [{ x: 7, y: 9, value: 1472 }],
      });
      expect(() => buildBuildingsTiledMap(map)).toThrow(RangeError);
      expect(() => buildBuildingsTiledMap(map)).toThrow(/at \(7, 9\).*1471/);
    }
  );

  it('serializes identically on every run', () => {
    const first = serializeTiledMap(
      buildBuildingsTiledMap(syntheticBuildingMap())
    );
    const second = serializeTiledMap(
      buildBuildingsTiledMap(syntheticBuildingMap())
    );
    expect(second).toEqual(first);
    expect(first.endsWith('}\n')).toBe(true);
  });

  it('passes parseTiledMap, drawing only terrain, with intact, ruined and collision kept hidden', () => {
    const map = buildBuildingsTiledMap(syntheticBuildingMap());
    const parsed = parseTiledMap(map, terrainTileset);

    expect(parsed).toMatchObject({ width: 128, height: 128, tileSize: 40 });
    expect(parsed.spawns).toEqual([]);
    expect(parsed.tileLayers).toEqual([
      { name: 'terrain', visible: true, data: layer(map, 'terrain').data },
      { name: 'intact', visible: false, data: layer(map, 'intact').data },
      { name: 'ruined', visible: false, data: layer(map, 'ruined').data },
      { name: 'collision', visible: false, data: layer(map, 'collision').data },
    ]);

    // All-open: real building collision is not yet derived.
    expect(Array.from(parsed.collision)).toEqual(new Array(128 * 128).fill(0));
  });
});
