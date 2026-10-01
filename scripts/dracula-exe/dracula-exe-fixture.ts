/**
 * Builds a synthetic byte buffer shaped like the original game's
 * `DRACULA.EXE`: a minimal PE32 image whose `.data` section sits where the
 * English build's does, so the building-site tables can be written at
 * their real virtual addresses.
 *
 * The real executable is original commercial game content and is not
 * committed to this repository (see `docs/MAP_FORMAT.md`), so the parser
 * tests exercise this instead. Everything not explicitly set is zero.
 */
import {
  BUILDING_SITE_COUNTIES,
  BUILDING_SITE_TABLE_VAS,
  SITES_PER_SLOT,
  SLOTS_PER_TYPE,
  type BuildingSiteCounty,
  type BuildingType,
} from '.';

/** Image base of the English build. */
export const FIXTURE_IMAGE_BASE = 0x400000;
/** `.data` start relative to the image base, as in the English build. */
const DATA_RVA = 0x6a000;
/** Enough raw `.data` to hold every building-site table. */
const DATA_SIZE = 0x25000;
/** Where `.data`'s bytes start in the synthetic file. */
const DATA_FILE_OFFSET = 0x400;

const PE_OFFSET = 0x80;
const OPTIONAL_HEADER_BYTES = 0xe0;

const TYPE_COUNT = 4;

/** One prefab's rectangle in `BUILDING.MAP` (x1, y1 exclusive). */
export interface PrefabRectFixture {
  readonly type: BuildingType;
  readonly slot: number;
  readonly rect: readonly [x0: number, y0: number, x1: number, y1: number];
}

/** The sites of one `(county, type, slot)`, as tile coordinates. */
export interface SiteFixture {
  readonly county: BuildingSiteCounty;
  readonly type: BuildingType;
  readonly slot: number;
  readonly sites: readonly (readonly [x: number, y: number])[];
}

export interface DraculaExeFixtureOptions {
  readonly prefabs?: readonly PrefabRectFixture[];
  readonly sites?: readonly SiteFixture[];
}

/** Builds a minimal PE32 image holding the given building-site tables. */
export function buildDraculaExeBytes({
  prefabs = [],
  sites = [],
}: DraculaExeFixtureOptions = {}): Uint8Array {
  const bytes = new Uint8Array(DATA_FILE_OFFSET + DATA_SIZE);
  const view = new DataView(bytes.buffer);

  // DOS header: "MZ" and e_lfanew.
  view.setUint16(0, 0x5a4d, true);
  view.setUint32(0x3c, PE_OFFSET, true);
  // "PE\0\0", then the COFF file header: one section.
  view.setUint32(PE_OFFSET, 0x00004550, true);
  const fileHeader = PE_OFFSET + 4;
  view.setUint16(fileHeader, 0x14c, true); // i386
  view.setUint16(fileHeader + 2, 1, true);
  view.setUint16(fileHeader + 16, OPTIONAL_HEADER_BYTES, true);
  // Optional header: PE32 magic and image base.
  const optionalHeader = fileHeader + 20;
  view.setUint16(optionalHeader, 0x10b, true);
  view.setUint32(optionalHeader + 28, FIXTURE_IMAGE_BASE, true);
  // Section table: `.data`.
  const section = optionalHeader + OPTIONAL_HEADER_BYTES;
  bytes.set([...'.data'].map((c) => c.charCodeAt(0)), section);
  view.setUint32(section + 8, DATA_SIZE, true);
  view.setUint32(section + 12, DATA_RVA, true);
  view.setUint32(section + 16, DATA_SIZE, true);
  view.setUint32(section + 20, DATA_FILE_OFFSET, true);

  const at = (va: number): number =>
    va - FIXTURE_IMAGE_BASE - DATA_RVA + DATA_FILE_OFFSET;
  const vas = BUILDING_SITE_TABLE_VAS;

  for (const { type, slot, rect } of prefabs) {
    const index = type * SLOTS_PER_TYPE + slot;
    const [x0, y0, x1, y1] = rect;
    bytes[at(vas.prefabX0) + index] = x0;
    bytes[at(vas.prefabY0) + index] = y0;
    bytes[at(vas.prefabX1) + index] = x1;
    bytes[at(vas.prefabY1) + index] = y1;
  }
  for (const { county, type, slot, sites: points } of sites) {
    const c = BUILDING_SITE_COUNTIES.indexOf(county);
    const index = (c * TYPE_COUNT + type) * SLOTS_PER_TYPE + slot;
    bytes[at(vas.siteCount) + index] = points.length;
    points.forEach(([x, y], k) => {
      bytes[at(vas.siteX) + index * SITES_PER_SLOT + k] = x;
      bytes[at(vas.siteY) + index * SITES_PER_SLOT + k] = y;
    });
  }
  return bytes;
}
