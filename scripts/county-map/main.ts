/**
 * Converts one `.MAP` file into a Tiled map under `public/maps/`:
 *
 * - a county, `COUNTIES/<NAME>.MAP`, into `<name>.tmj`, via
 *   `src/lib/county-map` and `./county-map-tiled.ts`;
 * - the building library, `COUNTIES/BUILDING.MAP`, as-is into
 *   `buildings.tmj`, via `src/lib/building-map` and
 *   `./building-map-tiled.ts`.
 *
 * Run with `npm run convert:map -- <NAME>`, e.g. `npm run convert:map --
 * FAGARAS` or `npm run convert:map -- BUILDING` (the name is
 * case-insensitive). Requires the CD data (`DROTR_CD_DIR`, defaulting to
 * `.cd/`) locally — the raw CD data is never committed, but the converted
 * `.tmj` is.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TiledMap } from 'tiled-types';

import { parseBuildingMap } from '../../src/lib/building-map';
import { parseCountyMap } from '../../src/lib/county-map';
import { cdPath, hasCdFile, readCdFile } from '../../src/test/cd-assets';

import { buildBuildingsTiledMap } from './building-map-tiled';
import { buildCountyTiledMap, serializeTiledMap } from './county-map-tiled';
import {
  BUILDING_MAP_CD_PATH,
  BUILDING_MAP_NAME,
  BUILDINGS_TILED_MAP_FILE_NAME,
  COUNTY_NAMES,
  countyMapCdPath,
  countyTiledMapFileName,
  isCountyName,
} from './county-names';
import { withPreviousSpawns } from './spawns-layer-merge';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'maps');

/** What to read, how to convert it, and where to write it. */
interface Conversion {
  /** Source file, relative to the CD data directory. */
  readonly source: string;
  /** Output file name, under `public/maps/`. */
  readonly fileName: string;
  readonly convert: (bytes: Uint8Array) => TiledMap;
}

const VALID_NAMES = `${COUNTY_NAMES.join(', ')} (counties), or ${BUILDING_MAP_NAME}`;

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

/** The conversion for an upper-cased name, or `undefined` for an unknown one. */
function conversionFor(name: string): Conversion | undefined {
  if (name === BUILDING_MAP_NAME) {
    return {
      source: BUILDING_MAP_CD_PATH,
      fileName: BUILDINGS_TILED_MAP_FILE_NAME,
      convert: (bytes) => buildBuildingsTiledMap(parseBuildingMap(bytes)),
    };
  }
  if (isCountyName(name)) {
    return {
      source: countyMapCdPath(name),
      fileName: countyTiledMapFileName(name),
      convert: (bytes) => buildCountyTiledMap(parseCountyMap(bytes)),
    };
  }
  return undefined;
}

function main(args: readonly string[]): void {
  const [argument] = args;
  if (!argument) {
    fail(
      'Usage: npm run convert:map -- <NAME>\n' +
        `where <NAME> is one of: ${VALID_NAMES}.`
    );
    return;
  }

  const conversion = conversionFor(argument.toUpperCase());
  if (!conversion) {
    fail(`Unknown map "${argument}". Expected one of: ${VALID_NAMES}.`);
    return;
  }

  const { source, fileName, convert } = conversion;
  if (!hasCdFile(source)) {
    fail(
      `Cannot find ${cdPath(source)}.\n` +
        'The CD data is not committed to this repository; ' +
        'place a local copy under .cd/ (or point DROTR_CD_DIR at it) before running this script.'
    );
    return;
  }

  const destination = path.join(OUTPUT_DIR, fileName);
  const previous = readExistingTiledMap(destination);

  let output: string;
  try {
    output = serializeTiledMap(
      withPreviousSpawns(convert(readCdFile(source)), previous)
    );
  } catch (error) {
    fail(
      `Failed to convert ${cdPath(source)}: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(destination, output);
  console.log(`Wrote ${destination} from ${cdPath(source)}.`);
}

/**
 * The previously written map at `destination`, if any, parsed back for
 * {@link withPreviousSpawns} to carry its hand-placed `spawns` layer
 * forward. `undefined` if the file doesn't exist yet.
 */
function readExistingTiledMap(destination: string): TiledMap | undefined {
  if (!fs.existsSync(destination)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(destination, 'utf-8')) as TiledMap;
}

main(process.argv.slice(2));
