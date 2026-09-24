import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseBuildingMap } from '~/lib/building-map';
import { hasCdFile, readCdFile } from '~/test/cd-assets';

import { buildBuildingsTiledMap } from './building-map-tiled';
import { serializeTiledMap } from './county-map-tiled';
import {
  BUILDING_MAP_CD_PATH,
  BUILDINGS_TILED_MAP_FILE_NAME,
} from './county-names';

/**
 * Golden test of the `BUILDING` conversion against the real
 * `COUNTIES/BUILDING.MAP`. It's original game data and is not committed, so
 * the suite skips itself wherever `.cd/` is absent (CI included). The
 * parser's own figures are pinned in
 * `src/lib/building-map/building-map-golden.spec.ts`.
 */
const available = hasCdFile(BUILDING_MAP_CD_PATH);

describe.skipIf(!available)('BUILDING.MAP conversion', () => {
  it('converts to exactly the committed public/maps/buildings.tmj (catches a stale committed file)', () => {
    const committed = fs.readFileSync(
      path.join(process.cwd(), 'public', 'maps', BUILDINGS_TILED_MAP_FILE_NAME),
      'utf-8'
    );
    const converted = serializeTiledMap(
      buildBuildingsTiledMap(parseBuildingMap(readCdFile(BUILDING_MAP_CD_PATH)))
    );
    // A plain string compare rather than `toEqual`: a diff of two ~400 KB
    // strings is unreadable anyway, and slow to build.
    expect(converted === committed).toBe(true);
  });
});
