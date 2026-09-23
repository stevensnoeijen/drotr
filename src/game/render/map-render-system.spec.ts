import { Container, Sprite, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { MapTileset, ParsedMap } from '~/game/map/load-tiled-map';
import { MapRenderSystem, TileTextureCache } from './map-render-system';

const TERRAIN_URL = 'http://host/maps/terrain.png';

/** The committed `terrain` tileset's geometry, referenced at `firstgid`. */
function terrainTileset(firstgid = 1): MapTileset {
  return {
    name: 'terrain',
    firstgid,
    tileWidth: 40,
    tileHeight: 40,
    tileCount: 1552,
    columns: 16,
    margin: 0,
    spacing: 0,
    imageUrl: TERRAIN_URL,
    imageWidth: 640,
    imageHeight: 3880,
    blockedTileIds: new Set(),
  };
}

function terrainSources(): Map<string, TextureSource> {
  return new Map([[TERRAIN_URL, new TextureSource({ width: 640, height: 3880 })]]);
}

function makeMap(overrides: Partial<ParsedMap> & { width: number; height: number }): ParsedMap {
  const { width, height } = overrides;
  return {
    tileSize: 32,
    collision: new Uint8Array(width * height),
    spawns: [],
    tilesets: [terrainTileset()],
    tileLayers: [],
    ...overrides,
  };
}

/** Every sprite across every chunk, in draw order. */
function sprites(system: MapRenderSystem): Sprite[] {
  return system.container.children.flatMap((chunk) => (chunk as Container).children as Sprite[]);
}

describe('TileTextureCache', () => {
  it('maps a gid to its tile’s frame, applying the firstgid offset', () => {
    const cache = new TileTextureCache([terrainTileset(4)], terrainSources());

    // gid 1076 at firstgid 4 is tile 1072: row 67, column 0.
    const grass = cache.get(1076)!;
    expect(grass.tileset.name).toBe('terrain');
    expect(grass.texture.frame).toMatchObject({ x: 0, y: 2680, width: 40, height: 40 });

    // gid 4 is tile 0, the sheet's top-left corner — a real ground tile.
    expect(cache.get(4)!.texture.frame).toMatchObject({ x: 0, y: 0 });
    // gid 22 is tile 18: row 1, column 2.
    expect(cache.get(22)!.texture.frame).toMatchObject({ x: 80, y: 40 });
  });

  it('reuses one texture per gid', () => {
    const cache = new TileTextureCache([terrainTileset()], terrainSources());
    expect(cache.get(5)!.texture).toBe(cache.get(5)!.texture);
  });

  it('returns undefined, never throwing, for empty, unknown or unloadable gids', () => {
    const cache = new TileTextureCache([terrainTileset(4)], terrainSources());

    expect(cache.get(0)).toBeUndefined();
    // Below the tileset's firstgid, and past its last tile.
    expect(cache.get(3)).toBeUndefined();
    expect(cache.get(4 + 1552)).toBeUndefined();
    // Repeated lookups of a miss stay a miss.
    expect(cache.get(3)).toBeUndefined();

    // A tileset whose image never loaded.
    expect(new TileTextureCache([terrainTileset()], new Map()).get(1)).toBeUndefined();
  });

  it('treats a tile whose frame falls outside its image as unknown', () => {
    const short = new Map([[TERRAIN_URL, new TextureSource({ width: 640, height: 40 })]]);
    const cache = new TileTextureCache([terrainTileset()], short);

    expect(cache.get(1)).toBeDefined();
    expect(cache.get(17)).toBeUndefined();
  });
});

describe('MapRenderSystem', () => {
  it('draws one sprite per non-empty cell per visible tile layer, skipping empty and unknown gids', () => {
    const map = makeMap({
      width: 2,
      height: 2,
      tileLayers: [
        { name: 'ground', data: [1, 2, 0, 99999]},
        { name: 'decoration', data: [0, 0, 0, 3] },
      ],
    });
    const system = new MapRenderSystem({
      map,
      tileTextures: new TileTextureCache(map.tilesets, terrainSources()),
    });

    const drawn = sprites(system);
    expect(drawn).toHaveLength(3);
    // Layer order is preserved: the decoration tile (gid 3, tile 2) draws
    // after the ground's gids 1 and 2.
    expect(drawn.map((sprite) => sprite.texture.frame.x)).toEqual([0, 40, 80]);
  });

  it('fits each tile to its map cell, whatever the tileset’s tile size', () => {
    const map = makeMap({ width: 3, height: 1, tileLayers: [{ name: 'g', data: [0, 0, 1] }] });
    const system = new MapRenderSystem({
      map,
      tileTextures: new TileTextureCache(map.tilesets, terrainSources()),
    });

    const [sprite] = sprites(system);
    // Cell (2, 0) on a 32px grid, from a 40px tile.
    expect(sprite.position.x).toBe(64);
    expect(sprite.position.y).toBe(0);
    expect(sprite.scale.x).toBeCloseTo(0.8);
    expect(sprite.scale.y).toBeCloseTo(0.8);
    expect(sprite.getBounds().width).toBeCloseTo(32);
  });

  it('draws a flipped gid as its tile, unflipped', () => {
    // gid 1 with the horizontal and diagonal flip flags set.
    const map = makeMap({ width: 2, height: 1, tileLayers: [{ name: 'g', data: [0x80000001, 0x20000001] }] });
    const system = new MapRenderSystem({
      map,
      tileTextures: new TileTextureCache(map.tilesets, terrainSources()),
    });

    for (const sprite of sprites(system)) {
      expect(sprite.texture.frame).toMatchObject({ x: 0, y: 0 });
      expect(sprite.rotation).toBe(0);
      expect(sprite.scale.x).toBeCloseTo(0.8);
      expect(sprite.scale.y).toBeCloseTo(0.8);
    }
  });

  it('groups tiles into fixed-size chunk containers covering the whole map', () => {
    const map = makeMap({ width: 20, height: 20, tileLayers: [{ name: 'g', data: new Array(400).fill(1)}] });
    const system = new MapRenderSystem({
      map,
      tileTextures: new TileTextureCache(map.tilesets, terrainSources()),
      chunkSize: 16,
    });

    expect(system.container.children).toHaveLength(4);
    const sizes = system.container.children.map((chunk) => chunk.children.length);
    expect(sizes).toEqual([16 * 16, 4 * 16, 16 * 4, 4 * 4]);
  });

  it('culls chunks outside the camera view', () => {
    // 64x64 tiles of 32px in 16-tile chunks: 4x4 chunks of 512px.
    const map = makeMap({ width: 64, height: 64, tileLayers: [{ name: 'g', data: new Array(4096).fill(1)}] });
    const system = new MapRenderSystem({
      map,
      tileTextures: new TileTextureCache(map.tilesets, terrainSources()),
      chunkSize: 16,
    });

    /** Which of the 4x4 chunk containers are shown, row-major, as a grid of 0/1. */
    const shown = () =>
      system.container.children.map((chunk) => (chunk.visible ? 1 : 0)).join('').match(/.{4}/g);

    system.cull({ x: 0, y: 0, width: 400, height: 400 });
    expect(shown()).toEqual(['1000', '0000', '0000', '0000']);

    // Panned to straddle the centre: the middle four chunks.
    system.cull({ x: 800, y: 800, width: 400, height: 400 });
    expect(shown()).toEqual(['0000', '0110', '0110', '0000']);

    // Zoomed out over the whole map.
    system.cull({ x: 0, y: 0, width: 4096, height: 4096 });
    expect(shown()).toEqual(['1111', '1111', '1111', '1111']);

    // Entirely off the map.
    system.cull({ x: 10000, y: 10000, width: 100, height: 100 });
    expect(shown()).toEqual(['0000', '0000', '0000', '0000']);
  });

  it('destroys every chunk on dispose, leaving no orphaned Pixi objects', () => {
    const map = makeMap({ width: 20, height: 20, tileLayers: [{ name: 'g', data: new Array(400).fill(1)}] });
    const system = new MapRenderSystem({
      map,
      tileTextures: new TileTextureCache(map.tilesets, terrainSources()),
    });
    const chunks = [...system.container.children];

    system.dispose();

    expect(chunks).toHaveLength(4);
    expect(chunks.every((chunk) => chunk.destroyed)).toBe(true);
    expect(system.container.destroyed).toBe(true);
  });
});
