import type { TiledLayerObjectgroup, TiledLayerTilelayer, TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import { withPreviousSpawns } from './spawns-layer-merge';

function terrainLayer(): TiledLayerTilelayer {
  return {
    id: 1,
    name: 'terrain',
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    opacity: 1,
    visible: true,
    data: [1],
  };
}

function emptySpawnsLayer(id = 2): TiledLayerObjectgroup {
  return {
    id,
    name: 'spawns',
    type: 'objectgroup',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    opacity: 1,
    visible: true,
    draworder: 'topdown',
    objects: [],
  };
}

function handPlacedSpawnsLayer(id = 2): TiledLayerObjectgroup {
  return {
    ...emptySpawnsLayer(id),
    objects: [
      {
        id: 1,
        name: 'red',
        type: '',
        x: 100,
        y: 200,
        width: 0,
        height: 0,
        rotation: 0,
        visible: true,
        point: true,
        properties: [],
      },
    ],
  };
}

function mapWithLayers(layers: TiledMap['layers']): TiledMap {
  return {
    type: 'map',
    version: 1.1,
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: 1,
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

describe('withPreviousSpawns', () => {
  it('replaces a freshly built empty spawns layer with the previous one', () => {
    const built = mapWithLayers([terrainLayer(), emptySpawnsLayer()]);
    const previous = mapWithLayers([terrainLayer(), handPlacedSpawnsLayer()]);

    const merged = withPreviousSpawns(built, previous);

    const spawns = merged.layers.find((layer) => layer.name === 'spawns');
    expect(spawns).toEqual(handPlacedSpawnsLayer());
  });

  it('leaves every other layer exactly as freshly built', () => {
    const built = mapWithLayers([terrainLayer(), emptySpawnsLayer()]);
    const previous = mapWithLayers([terrainLayer(), handPlacedSpawnsLayer()]);

    const merged = withPreviousSpawns(built, previous);

    const terrain = merged.layers.find((layer) => layer.name === 'terrain');
    expect(terrain).toEqual(terrainLayer());
  });

  it('returns the map unchanged when there is no previous map', () => {
    const built = mapWithLayers([terrainLayer(), emptySpawnsLayer()]);

    expect(withPreviousSpawns(built, undefined)).toBe(built);
  });

  it('returns the map unchanged when the previous map has no spawns layer', () => {
    const built = mapWithLayers([terrainLayer(), emptySpawnsLayer()]);
    const previous = mapWithLayers([terrainLayer()]);

    expect(withPreviousSpawns(built, previous)).toBe(built);
  });

  it('returns the map unchanged when the built map has no spawns layer', () => {
    const built = mapWithLayers([terrainLayer()]);
    const previous = mapWithLayers([terrainLayer(), handPlacedSpawnsLayer()]);

    expect(withPreviousSpawns(built, previous)).toBe(built);
  });
});
