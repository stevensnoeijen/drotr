/**
 * Converts every county, `COUNTIES/<NAME>.MAP`, into `public/maps/<name>.tmj`
 * — `npm run convert:map` for each of the 12 counties in turn. Hand-placed
 * spawn points already in a county's `.tmj` (e.g. FAGARAS's) are kept.
 * `BUILDING.MAP` is not included; convert it with `npm run convert:map --
 * BUILDING`.
 *
 * Run with `npm run convert:maps`. Requires the CD data (`DROTR_CD_DIR`,
 * defaulting to `.cd/`) locally. Keeps going past a failing county and
 * exits non-zero if any failed.
 */
import { convertMap } from './convert-map';
import { COUNTY_NAMES } from './county-names';

const failed = COUNTY_NAMES.filter((name) => !convertMap(name));
if (failed.length > 0) {
  console.error(`Failed to convert: ${failed.join(', ')}.`);
  process.exitCode = 1;
} else {
  console.log(`Converted all ${COUNTY_NAMES.length} counties.`);
}
