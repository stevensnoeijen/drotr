import type {
  TiledLayerObjectgroup,
  TiledLayerTilelayer,
  TiledMap,
  TiledObject,
} from 'tiled-types';
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

function point(id: number, name: string, x = 0, y = 0): TiledObject {
  return {
    id,
    name,
    type: '',
    x,
    y,
    width: 0,
    height: 0,
    rotation: 0,
    visible: true,
    point: true,
    properties: [],
  };
}

function spawnsWith(objects: TiledObject[]): TiledLayerObjectgroup {
  return { ...emptySpawnsLayer(), objects };
}

function spawnObjects(map: TiledMap): TiledObject[] {
  const spawns = map.layers.find((layer) => layer.name === 'spawns');
  if (spawns?.type !== 'objectgroup') throw new Error('no spawns layer');
  return spawns.objects;
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

  describe('with generated edge-* spawns', () => {
    it('rebuilds generated spawns from the fresh map and keeps hand-placed ones after them', () => {
      const built = {
        ...mapWithLayers([
          terrainLayer(),
          spawnsWith([point(1, 'edge-1', 20, 20), point(2, 'edge-2', 60, 60)]),
        ]),
        nextobjectid: 3,
      };
      const previous = {
        ...mapWithLayers([
          terrainLayer(),
          spawnsWith([
            point(1, 'edge-1', 999, 999),
            point(2, 'edge-2', 999, 999),
            point(3, 'edge-3', 999, 999),
            point(7, 'castle', 400, 400),
          ]),
        ]),
        nextobjectid: 8,
      };

      const merged = withPreviousSpawns(built, previous);

      expect(spawnObjects(merged)).toEqual([
        point(1, 'edge-1', 20, 20),
        point(2, 'edge-2', 60, 60),
        point(7, 'castle', 400, 400),
      ]);
      expect(merged.nextobjectid).toBe(8);
    });

    it('gives a hand-placed spawn whose id clashes with a generated one the next free id', () => {
      const built = {
        ...mapWithLayers([
          terrainLayer(),
          spawnsWith([point(1, 'edge-1'), point(2, 'edge-2'), point(3, 'edge-3')]),
        ]),
        nextobjectid: 4,
      };
      const previous = mapWithLayers([
        terrainLayer(),
        spawnsWith([point(1, 'red', 100, 200), point(2, 'blue', 300, 400)]),
      ]);

      const merged = withPreviousSpawns(built, previous);

      expect(spawnObjects(merged)).toEqual([
        point(1, 'edge-1'),
        point(2, 'edge-2'),
        point(3, 'edge-3'),
        point(4, 'red', 100, 200),
        point(5, 'blue', 300, 400),
      ]);
      const ids = spawnObjects(merged).map((object) => object.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(merged.nextobjectid).toBe(6);
    });

    it('is stable when rerun over its own output', () => {
      const built = {
        ...mapWithLayers([
          terrainLayer(),
          spawnsWith([point(1, 'edge-1'), point(2, 'edge-2')]),
        ]),
        nextobjectid: 3,
      };
      const previous = mapWithLayers([
        terrainLayer(),
        spawnsWith([point(1, 'red', 100, 200)]),
      ]);

      const once = withPreviousSpawns(built, previous);
      const twice = withPreviousSpawns(built, once);

      expect(twice).toEqual(once);
    });
  });
});
