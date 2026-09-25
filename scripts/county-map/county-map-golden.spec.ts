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

  it('collapses to 5,188 blocked tiles, as drawn in collision', () => {
    // A tile blocks once 2 or more of its 4 subcells are non-zero (any
    // non-zero hi counts, so the 59 subcells carrying only 256 count too).
    const collapsed = collapseCollisionMaskPerTile(county);
    expect(collapsed.reduce((sum, cell) => sum + cell, 0)).toEqual(5188);

    const map = buildCountyTiledMap(county) as TiledMap;
    const debug = map.layers.find(
      (layer): layer is TiledLayerTilelayer => layer.name === 'collision'
    );
    const drawn = (debug?.data as number[]).filter(
      (gid) => gid === COLLISION_MARKER_GID
    );
    expect(drawn).toHaveLength(5188);
  });
});

const SIBIU_SOURCE = countyMapCdPath('SIBIU');
const sibiuAvailable = hasCdFile(SIBIU_SOURCE);

describe.skipIf(!sibiuAvailable)('SIBIU.MAP', () => {
  it('converts to exactly the committed public/maps/sibiu.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(SIBIU_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('SIBIU')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const BRASOV_SOURCE = countyMapCdPath('BRASOV');
const brasovAvailable = hasCdFile(BRASOV_SOURCE);

describe.skipIf(!brasovAvailable)('BRASOV.MAP', () => {
  it('converts to exactly the committed public/maps/brasov.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(BRASOV_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('BRASOV')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const RASOVA_SOURCE = countyMapCdPath('RASOVA');
const rasovaAvailable = hasCdFile(RASOVA_SOURCE);

describe.skipIf(!rasovaAvailable)('RASOVA.MAP', () => {
  it('converts to exactly the committed public/maps/rasova.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(RASOVA_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('RASOVA')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const PITESTI_SOURCE = countyMapCdPath('PITESTI');
const pitestiAvailable = hasCdFile(PITESTI_SOURCE);

describe.skipIf(!pitestiAvailable)('PITESTI.MAP', () => {
  it('converts to exactly the committed public/maps/pitesti.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(PITESTI_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('PITESTI')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const HIRSOVA_SOURCE = countyMapCdPath('HIRSOVA');
const hirsovaAvailable = hasCdFile(HIRSOVA_SOURCE);

describe.skipIf(!hirsovaAvailable)('HIRSOVA.MAP', () => {
  it('converts to exactly the committed public/maps/hirsova.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(HIRSOVA_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('HIRSOVA')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const SNAGOV_SOURCE = countyMapCdPath('SNAGOV');
const snagovAvailable = hasCdFile(SNAGOV_SOURCE);

describe.skipIf(!snagovAvailable)('SNAGOV.MAP', () => {
  it('converts to exactly the committed public/maps/snagov.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(SNAGOV_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('SNAGOV')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const BRAILA_SOURCE = countyMapCdPath('BRAILA');
const brailaAvailable = hasCdFile(BRAILA_SOURCE);

describe.skipIf(!brailaAvailable)('BRAILA.MAP', () => {
  it('converts to exactly the committed public/maps/braila.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(BRAILA_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('BRAILA')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const GIURGIU_SOURCE = countyMapCdPath('GIURGIU');
const giurgiuAvailable = hasCdFile(GIURGIU_SOURCE);

describe.skipIf(!giurgiuAvailable)('GIURGIU.MAP', () => {
  it('converts to exactly the committed public/maps/giurgiu.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(GIURGIU_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('GIURGIU')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const TIRGO_SOURCE = countyMapCdPath('TIRGO');
const tirgoAvailable = hasCdFile(TIRGO_SOURCE);

describe.skipIf(!tirgoAvailable)('TIRGO.MAP', () => {
  it('converts to exactly the committed public/maps/tirgo.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(TIRGO_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('TIRGO')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const CUERTA_SOURCE = countyMapCdPath('CUERTA');
const cuertaAvailable = hasCdFile(CUERTA_SOURCE);

describe.skipIf(!cuertaAvailable)('CUERTA.MAP', () => {
  it('converts to exactly the committed public/maps/cuerta.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(CUERTA_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('CUERTA')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});

const OSTROV_SOURCE = countyMapCdPath('OSTROV');
const ostrovAvailable = hasCdFile(OSTROV_SOURCE);

describe.skipIf(!ostrovAvailable)('OSTROV.MAP', () => {
  it('converts to exactly the committed public/maps/ostrov.tmj (catches a stale committed file)', () => {
    const county = parseCountyMap(readCdFile(OSTROV_SOURCE));
    const committed = fs.readFileSync(
      path.join(
        process.cwd(),
        'public',
        'maps',
        countyTiledMapFileName('OSTROV')
      ),
      'utf-8'
    );
    expect(serializeTiledMap(buildCountyTiledMap(county)) === committed).toBe(
      true
    );
  });
});
