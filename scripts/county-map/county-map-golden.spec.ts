import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TiledLayerTilelayer, TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import {
  collapseCollisionMaskPerTile,
  COUNTY_MAP_BYTES,
  parseCountyMap,
  RECORD_BYTES,
  SECTION_A_OFFSET,
  SECTION_B_OFFSET,
} from '~/lib/county-map';
import { hasCdFile, readCdFile } from '~/test/cd-assets';

import { COLLISION_MARKER_TILE_ID } from '~/lib/art/collision-marker';

import { buildCountyTiledMap, serializeTiledMap } from './county-map-tiled';
import { countyMapCdPath, countyTiledMapFileName } from './county-names';
import { withPreviousSpawns } from './spawns-layer-merge';

const COLLISION_MARKER_GID = COLLISION_MARKER_TILE_ID + 1;

/**
 * Golden tests against the real `COUNTIES/FAGARAS.MAP`.
 *
 * It's original game data and is not committed, so the suite skips itself
 * wherever `.cd/` is absent (CI included), the same convention as
 * `terrain-tileset-golden.spec.ts`. The figures pinned here are the ones
 * recorded in `docs/MAP_FORMAT.md`.
 */
const SOURCE = countyMapCdPath('FAGARAS');
const available = hasCdFile(SOURCE);

/** Every value of one `u16` field across a section, straight from the file. */
function rawField(
  bytes: Uint8Array,
  sectionOffset: number,
  cellCount: number,
  fieldOffset: number
): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: cellCount }, (_, i) =>
    view.getUint16(sectionOffset + i * RECORD_BYTES + fieldOffset, true)
  );
}

function countValues(values: ArrayLike<number>): Record<number, number> {
  const counts: Record<number, number> = {};
  for (let i = 0; i < values.length; i++) {
    counts[values[i]] = (counts[values[i]] ?? 0) + 1;
  }
  return counts;
}

describe.skipIf(!available)('FAGARAS.MAP', () => {
  const bytes = available ? readCdFile(SOURCE) : (undefined as never);
  const county = available ? parseCountyMap(bytes) : (undefined as never);

  it('converts to exactly the committed public/maps/fagaras.tmj (catches a stale committed file)', () => {
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('FAGARAS')
      ),
      'utf-8'
    );
    // The committed file's `spawns` layer is hand-placed, not derived from
    // the source `.MAP` data, so it's spliced in before comparing — the
    // same carry-over the real converter does on a rerun. Everything else
    // (terrain, collision) is compared as freshly built, so a stale layer
    // or stale formatting still fails this test.
    const built = withPreviousSpawns(
      buildCountyTiledMap(county),
      JSON.parse(committed) as TiledMap
    );
    // A plain string compare rather than `toEqual`: a diff of two ~270 KB
    // strings is unreadable anyway, and slow to build.
    expect(serializeTiledMap(built) === committed).toBe(true);
  });

  it('has an all-zero Section A hi and Section B lo', () => {
    expect(bytes.length).toEqual(COUNTY_MAP_BYTES);
    const sectionAHi = rawField(bytes, SECTION_A_OFFSET, 128 * 128, 2);
    const sectionBLo = rawField(bytes, SECTION_B_OFFSET, 256 * 256, 0);
    expect(sectionAHi.every((value) => value === 0)).toBe(true);
    expect(sectionBLo.every((value) => value === 0)).toBe(true);
  });

  it('uses 387 distinct tile indices, up to 1471', () => {
    const distinct = new Set(county.tiles);
    expect(distinct.size).toEqual(387);
    expect(Math.max(...distinct)).toEqual(1471);
  });

  it('has the recorded Section B hi value counts', () => {
    expect(countValues(county.collisionMask)).toEqual({
      0: 47258,
      4: 18219,
      256: 59,
    });
  });

  it('collapses to 3,315 blocked tiles, as drawn in collision', () => {
    // Any non-zero hi blocks, so the 59 subcells carrying only 256 count.
    // Counting bit 2 (4) alone would give 3,307 instead.
    const collapsed = collapseCollisionMaskPerTile(county);
    expect(collapsed.reduce((sum, cell) => sum + cell, 0)).toEqual(3315);

    const map = buildCountyTiledMap(county) as TiledMap;
    const debug = map.layers.find(
      (layer): layer is TiledLayerTilelayer => layer.name === 'collision'
    );
    const drawn = (debug?.data as number[]).filter(
      (gid) => gid === COLLISION_MARKER_GID
    );
    expect(drawn).toHaveLength(3315);
  });
});
