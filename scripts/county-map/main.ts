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
import { convertMap, VALID_NAMES } from './convert-map';

const [argument] = process.argv.slice(2);
if (argument) {
  convertMap(argument);
} else {
  console.error(
    'Usage: npm run convert:map -- <NAME>\n' +
      `where <NAME> is one of: ${VALID_NAMES}.`
  );
  process.exitCode = 1;
}
