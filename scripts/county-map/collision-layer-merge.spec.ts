import type { TiledLayerTilelayer, TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import { withPreviousCollision } from './collision-layer-merge';

function tileLayer(name: string, data: number[]): TiledLayerTilelayer {
  return {
    id: 1,
    name,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: data.length,
    height: 1,
    opacity: 1,
    visible: true,
    data,
  };
}

function mapWith(...layers: TiledLayerTilelayer[]): TiledMap {
  return {
    type: 'map',
    version: 1.1,
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: 4,
    height: 1,
    tilewidth: 1,
    tileheight: 1,
    infinite: false,
    nextlayerid: layers.length + 1,
    nextobjectid: 1,
    compressionlevel: -1,
    properties: [],
    tilesets: [],
    layers,
  };
}

function collisionData(map: TiledMap): number[] {
  const layer = map.layers.find((l) => l.name === 'collision');
  if (layer?.type !== 'tilelayer') throw new Error('no collision layer');
  return layer.data as number[];
}

describe('withPreviousCollision', () => {
  it('carries over cells blocked only in the previous layer', () => {
    const built = mapWith(tileLayer('collision', [0, 5, 0, 0]));
    const previous = mapWith(tileLayer('collision', [0, 5, 5, 0]));
    expect(collisionData(withPreviousCollision(built, previous))).toEqual([
      0, 5, 5, 0,
    ]);
  });

  it('keeps freshly built blocks that are open in the previous layer', () => {
    const built = mapWith(tileLayer('collision', [5, 0, 0, 0]));
    const previous = mapWith(tileLayer('collision', [0, 0, 5, 0]));
    expect(collisionData(withPreviousCollision(built, previous))).toEqual([
      5, 0, 5, 0,
    ]);
  });

  it('leaves other layers untouched', () => {
    const terrain = tileLayer('terrain', [1, 1, 1, 1]);
    const built = mapWith(terrain, tileLayer('collision', [0, 0, 0, 0]));
    const previous = mapWith(
      tileLayer('terrain', [2, 2, 2, 2]),
      tileLayer('collision', [5, 0, 0, 0])
    );
    const merged = withPreviousCollision(built, previous);
    expect(merged.layers[0]).toBe(terrain);
    expect(collisionData(merged)).toEqual([5, 0, 0, 0]);
  });

  it('returns the map unchanged without a previous map or layer', () => {
    const built = mapWith(tileLayer('collision', [0, 0, 0, 0]));
    expect(withPreviousCollision(built, undefined)).toBe(built);
    expect(
      withPreviousCollision(built, mapWith(tileLayer('terrain', [1, 1, 1, 1])))
    ).toBe(built);
    expect(
      withPreviousCollision(mapWith(tileLayer('terrain', [1])), built)
    ).toEqual(mapWith(tileLayer('terrain', [1])));
  });

  it('returns the map unchanged when the layer sizes differ', () => {
    const built = mapWith(tileLayer('collision', [0, 0, 0, 0]));
    const previous = mapWith(tileLayer('collision', [5, 5]));
    expect(withPreviousCollision(built, previous)).toBe(built);
  });

  it('is idempotent', () => {
    const built = mapWith(tileLayer('collision', [0, 5, 0, 0]));
    const previous = mapWith(tileLayer('collision', [5, 0, 0, 5]));
    const once = withPreviousCollision(built, previous);
    expect(withPreviousCollision(built, once)).toEqual(once);
  });
});
