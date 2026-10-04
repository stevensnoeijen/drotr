import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TiledMap } from 'tiled-types';

import { stampBuildings } from '~/game/map/building-placement';
import { parseTiledMap } from '~/game/map/load-tiled-map';

import type { ParsedMap } from '~/game/map/load-tiled-map';
import { testBuildingsScenario } from './test-buildings';

function site(
  name: string,
  type: string,
  levels: string,
  level: string
): ParsedMap['objectLayers'][number]['objects'][number] {
  return {
    name,
    type,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    point: true,
    properties: {
      levels,
      [`footprint:${level}`]: '1,1,2,2',
      ...(type === 'bridge' ? { orientation: 'vertical' } : {}),
    },
  };
}

function mapWith(objects: ReturnType<typeof site>[]): ParsedMap {
  return {
    width: 10,
    height: 10,
    tileSize: 40,
    collision: new Uint8Array(100),
    spawns: [],
    tileset: {
      firstgid: 1,
      tileWidth: 40,
      tileHeight: 40,
      tileCount: 1,
      columns: 1,
      imageUrl: '',
    },
    tileLayers: [],
    objectLayers: [{ name: 'constructions', visible: true, objects }],
  };
}

describe('test-buildings scenario', () => {
  it('accepts a map with the three sites and levels', () => {
    const map = mapWith([
      site('castle-1', 'castle', '1,4', '4'),
      site('tower-1', 'tower', 'grass', 'grass'),
      site('bridge-2', 'bridge', 'wood,stone', 'stone'),
    ]);
    expect(testBuildingsScenario.validateMap?.(map)).toBeUndefined();
  });

  it('rejects, with a reason, a map lacking the sites or a level', () => {
    expect(testBuildingsScenario.validateMap?.(mapWith([]))).toMatch(
      /castle-1/
    );
    expect(testBuildingsScenario.validateMap?.(undefined)).toBeDefined();
    const noLevel = mapWith([
      site('castle-1', 'castle', '1,2', '1'),
      site('tower-1', 'tower', 'grass', 'grass'),
      site('bridge-2', 'bridge', 'stone', 'stone'),
    ]);
    expect(testBuildingsScenario.validateMap?.(noLevel)).toMatch(/level "4"/);
  });

  it('spawns nothing', () => {
    expect(() => testBuildingsScenario.setup({} as never)).not.toThrow();
  });
});

describe('test-buildings scenario on the real maps', () => {
  const tileset = {
    firstgid: 1,
    tileWidth: 40,
    tileHeight: 40,
    tileCount: 1,
    columns: 1,
    imageUrl: '',
  };
  const load = (name: string) =>
    parseTiledMap(
      JSON.parse(readFileSync(`public/maps/${name}.tmj`, 'utf8')) as TiledMap,
      tileset
    );

  it('is valid on Braila and stamps all three buildings', () => {
    const braila = load('braila');
    expect(testBuildingsScenario.validateMap?.(braila)).toBeUndefined();
    const stamped = stampBuildings(
      braila,
      load('buildings'),
      testBuildingsScenario.buildings as never
    );
    const before = braila.tileLayers.find((l) => l.name === 'terrain')!.data;
    const after = stamped.tileLayers.find((l) => l.name === 'terrain')!.data;
    expect(after.filter((gid, i) => gid !== before[i]).length).toBeGreaterThan(
      0
    );
  });

  it('is invalid on a map without the sites', () => {
    expect(testBuildingsScenario.validateMap?.(load('test'))).toBeDefined();
  });
});
