import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { tileRect, ATLAS_TILE_SIZE } from '~/lib/art/atlas';
import { GOLDEN_TILE_HASHES } from './battle-art-golden-hashes';
import {
  buildTerrainTilesetXml,
  COLLISION_MARKER_TILE_ID,
  TERRAIN_TILESET_HEIGHT,
  TERRAIN_TILESET_WIDTH,
} from './terrain-tileset';

/**
 * Tests against the **committed** `public/maps/terrain.tsx`/`terrain.png`
 * themselves, rather than a fresh build. These need no `.cd/` data, so they
 * always run (CI included). The `.tsx` is compared in full against
 * `buildTerrainTilesetXml`. The `.png` only gets spot checks: its size, a
 * handful of tiles against recorded hashes, and which slots are filled or
 * transparent. So a `.png` that has drifted elsewhere can still pass here.
 * The full pixel comparison against a fresh build off the real `BATTLE.ART`
 * lives in the golden suite (`terrain-tileset-golden.spec.ts`), which skips
 * without `.cd/`.
 */

const MAPS_DIR = path.join(process.cwd(), 'public', 'maps');

function readTerrainPng(): PNG {
  const buffer = fs.readFileSync(path.join(MAPS_DIR, 'terrain.png'));
  return PNG.sync.read(buffer);
}

function readTile(png: PNG, id: number): Uint8Array {
  const rect = tileRect(id, png.width);
  const out = new Uint8Array(ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4);
  for (let row = 0; row < ATLAS_TILE_SIZE; row++) {
    const srcOffset = ((rect.y + row) * png.width + rect.x) * 4;
    const destOffset = row * ATLAS_TILE_SIZE * 4;
    out.set(
      png.data.subarray(srcOffset, srcOffset + ATLAS_TILE_SIZE * 4),
      destOffset
    );
  }
  return out;
}

function sha256(bytes: ArrayLike<number>): string {
  return createHash('sha256').update(Uint8Array.from(bytes)).digest('hex');
}

describe('public/maps/terrain.tsx', () => {
  it('equals buildTerrainTilesetXml() exactly', () => {
    const committed = fs.readFileSync(
      path.join(MAPS_DIR, 'terrain.tsx'),
      'utf-8'
    );
    expect(committed).toEqual(buildTerrainTilesetXml());
  });
});

describe('public/maps/terrain.png', () => {
  const png = readTerrainPng();

  it('decodes to 640x3880 RGBA', () => {
    expect(png.width).toEqual(TERRAIN_TILESET_WIDTH);
    expect(png.height).toEqual(TERRAIN_TILESET_HEIGHT);
    expect(png.data).toHaveLength(
      TERRAIN_TILESET_WIDTH * TERRAIN_TILESET_HEIGHT * 4
    );
  });

  it.each(Object.entries(GOLDEN_TILE_HASHES))(
    'decodes tile id %s to its recorded pixels',
    (id, expected) => {
      expect(sha256(readTile(png, Number(id)))).toEqual(expected);
    }
  );

  const FILLER_IDS = [
    ...range(1472, 1481),
    ...range(1488, 1497),
    ...range(1504, 1513),
    ...range(1520, 1529),
    ...range(1536, 1545),
  ];

  it.each(FILLER_IDS)('leaves filler id %d fully transparent', (id) => {
    const tile = readTile(png, id);
    for (let i = 3; i < tile.length; i += 4) {
      expect(tile[i]).toEqual(0);
    }
  });

  it('draws the collision-marker id fully opaque', () => {
    const tile = readTile(png, COLLISION_MARKER_TILE_ID);
    for (let i = 3; i < tile.length; i += 4) {
      expect(tile[i]).toEqual(255);
    }
  });

  const EXTRA_IDS = [
    ...range(1482, 1487),
    ...range(1498, 1503),
    ...range(1514, 1519),
    ...range(1530, 1535),
    ...range(1546, 1550),
  ];

  it.each(EXTRA_IDS)('leaves drawbridge/rubble id %d non-empty', (id) => {
    const tile = readTile(png, id);
    let opaquePixels = 0;
    for (let i = 3; i < tile.length; i += 4) {
      if (tile[i] !== 0) opaquePixels++;
    }
    expect(opaquePixels).toBeGreaterThan(0);
  });
});

function range(first: number, last: number): number[] {
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
}
