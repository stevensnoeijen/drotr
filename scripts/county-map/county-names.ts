/**
 * The 12 county maps on the CD, as their `COUNTIES/<NAME>.MAP` file names.
 * `COUNTIES/BUILDING.MAP` shares the directory but isn't one: it holds
 * building prefabs in a different layout (see `docs/MAP_FORMAT.md`), and
 * converts separately, see {@link BUILDING_MAP_NAME}.
 */
export const COUNTY_NAMES = [
  'BRAILA',
  'BRASOV',
  'CUERTA',
  'FAGARAS',
  'GIURGIU',
  'HIRSOVA',
  'OSTROV',
  'PITESTI',
  'RASOVA',
  'SIBIU',
  'SNAGOV',
  'TIRGO',
] as const;

export type CountyName = (typeof COUNTY_NAMES)[number];

/** Whether `name` (already upper-cased) is one of the {@link COUNTY_NAMES}. */
export function isCountyName(name: string): name is CountyName {
  return (COUNTY_NAMES as readonly string[]).includes(name);
}

/** A county's source file, relative to the CD data directory. */
export function countyMapCdPath(name: CountyName): string {
  return `COUNTIES/${name}.MAP`;
}

/** File name of a county's converted Tiled map, under `public/maps/`. */
export function countyTiledMapFileName(name: CountyName): string {
  return `${name.toLowerCase()}.tmj`;
}

/**
 * The name `npm run convert:map` takes (case-insensitively) for
 * `COUNTIES/BUILDING.MAP`, which isn't a county.
 */
export const BUILDING_MAP_NAME = 'BUILDING';

/** `BUILDING.MAP`'s source file, relative to the CD data directory. */
export const BUILDING_MAP_CD_PATH = 'COUNTIES/BUILDING.MAP';

/** File name of `BUILDING.MAP`'s converted Tiled map, under `public/maps/`. */
export const BUILDINGS_TILED_MAP_FILE_NAME = 'buildings.tmj';
