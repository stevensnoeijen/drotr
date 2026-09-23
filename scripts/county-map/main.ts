/**
 * Converts one county map, `COUNTIES/<NAME>.MAP`, into
 * `public/maps/<name>.tmj`, via `src/lib/county-map` and
 * `./county-map-tiled.ts`.
 *
 * Run with `npm run convert:map -- <NAME>`, e.g. `npm run convert:map --
 * FAGARAS` (the name is case-insensitive). Requires the CD data
 * (`DROTR_CD_DIR`, defaulting to `.cd/`) locally — the raw CD data is never
 * committed, but the converted `.tmj` is.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseCountyMap } from '../../src/lib/county-map';
import { cdPath, hasCdFile, readCdFile } from '../../src/test/cd-assets';

import { buildCountyTiledMap, serializeTiledMap } from './county-map-tiled';
import {
  COUNTY_NAMES,
  countyMapCdPath,
  countyTiledMapFileName,
  isCountyName,
} from './county-names';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'maps');

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

function main(args: readonly string[]): void {
  const [argument] = args;
  if (!argument) {
    fail(
      'Usage: npm run convert:map -- <COUNTY>\n' +
        `where <COUNTY> is one of: ${COUNTY_NAMES.join(', ')}.`
    );
    return;
  }

  const name = argument.toUpperCase();
  if (name === 'BUILDING') {
    fail(
      'BUILDING.MAP is not a county map: it holds building prefabs in a ' +
        'different layout (see docs/MAP_FORMAT.md) and cannot be converted ' +
        'with this script.'
    );
    return;
  }
  if (!isCountyName(name)) {
    fail(
      `Unknown county "${argument}". Expected one of: ${COUNTY_NAMES.join(', ')}.`
    );
    return;
  }

  const source = countyMapCdPath(name);
  if (!hasCdFile(source)) {
    fail(
      `Cannot find ${cdPath(source)}.\n` +
        'The CD data is not committed to this repository; ' +
        'place a local copy under .cd/ (or point DROTR_CD_DIR at it) before running this script.'
    );
    return;
  }

  let output: string;
  try {
    output = serializeTiledMap(
      buildCountyTiledMap(parseCountyMap(readCdFile(source)))
    );
  } catch (error) {
    fail(
      `Failed to convert ${cdPath(source)}: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }

  const destination = path.join(OUTPUT_DIR, countyTiledMapFileName(name));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(destination, output);
  console.log(`Wrote ${destination} from ${cdPath(source)}.`);
}

main(process.argv.slice(2));
