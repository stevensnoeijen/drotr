/**
 * Converts one `.MAP` file into a Tiled map under `public/maps/`; shared by
 * `./main.ts` (`npm run convert:map`) and `./convert-all.ts`
 * (`npm run convert:maps`).
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

export const VALID_NAMES = `${COUNTY_NAMES.join(', ')} (counties), or ${BUILDING_MAP_NAME}`;

function fail(message: string): false {
  console.error(message);
  process.exitCode = 1;
  return false;
}

function readExisting(destination: string): TiledMap | undefined {
  if (!fs.existsSync(destination)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(destination, 'utf-8')) as TiledMap;
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

/**
 * Converts the map called `name` (case-insensitive) and writes it under
 * `public/maps/`. Hand-placed spawn points already in its `.tmj`
 * are kept (see `withPreviousSpawns`). Reports failures on stderr, sets
 * a non-zero exit code, and returns whether the conversion succeeded.
 */
export function convertMap(name: string): boolean {
  const conversion = conversionFor(name.toUpperCase());
  if (!conversion) {
    return fail(`Unknown map "${name}". Expected one of: ${VALID_NAMES}.`);
  }

  const { source, fileName, convert } = conversion;
  if (!hasCdFile(source)) {
    return fail(
      `Cannot find ${cdPath(source)}.\n` +
        'The CD data is not committed to this repository; ' +
        'place a local copy under .cd/ (or point DROTR_CD_DIR at it) before running this script.'
    );
  }

  const destination = path.join(OUTPUT_DIR, fileName);
  let output: string;
  try {
    output = serializeTiledMap(
      withPreviousSpawns(convert(readCdFile(source)), readExisting(destination))
    );
  } catch (error) {
    return fail(
      `Failed to convert ${cdPath(source)}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(destination, output);
  console.log(`Wrote ${destination} from ${cdPath(source)}.`);
  return true;
}
