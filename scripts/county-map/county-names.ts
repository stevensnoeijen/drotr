/**
 * The 12 county maps on the CD, as their `COUNTIES/<NAME>.MAP` file names.
 * `COUNTIES/BUILDING.MAP` shares the directory but isn't one: it holds
 * building prefabs in a different layout (see `docs/MAP_FORMAT.md`).
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
