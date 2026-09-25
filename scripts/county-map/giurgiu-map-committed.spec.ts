import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import {
  parseTiledMap,
  parseTilesetDescription,
} from '~/game/map/load-tiled-map';

/**
 * Tests against the **committed** `public/maps/giurgiu.tmj` itself. These need
 * no `.cd/` data, so they always run (CI included). That the file is exactly
 * what the converter produces from the real `GIURGIU.MAP` is checked by the
 * golden suite (`county-map-golden.spec.ts`), which skips without `.cd/`.
 */

const MAPS_DIR = path.join(process.cwd(), 'public', 'maps');

describe('public/maps/giurgiu.tmj', () => {
  const map = JSON.parse(
    fs.readFileSync(path.join(MAPS_DIR, 'giurgiu.tmj'), 'utf-8')
  ) as TiledMap;
  const tileset = parseTilesetDescription(
    fs.readFileSync(path.join(MAPS_DIR, 'terrain.tsx'), 'utf-8'),
    map.tilesets[0].firstgid,
    'http://host/maps/terrain.tsx'
  );

  it('references terrain.tsx as its one external tileset', () => {
    expect(map.tilesets).toEqual([{ firstgid: 1, source: 'terrain.tsx' }]);
  });

  it('passes parseTiledMap as a 128x128, 40 px map with its 2 generated edge spawns', () => {
    const parsed = parseTiledMap(map, tileset);
    expect(parsed.width).toEqual(128);
    expect(parsed.height).toEqual(128);
    expect(parsed.tileSize).toEqual(40);
    expect(parsed.spawns.map((spawn) => spawn.id)).toEqual(['edge-1', 'edge-2']);
    // collision is kept but hidden, so terrain is the only shown layer.
    expect(
      parsed.tileLayers.map((layer) => [layer.name, layer.visible])
    ).toEqual([
      ['terrain', true],
      ['collision', false],
    ]);
    expect(parsed.collision).toHaveLength(128 * 128);
  });

  it('takes engine collision from the collision layer only', () => {
    const parsed = parseTiledMap(map, tileset);
    const blocked = parsed.collision.reduce((sum, cell) => sum + cell, 0);
    expect(blocked).toEqual(3755);
  });
});
