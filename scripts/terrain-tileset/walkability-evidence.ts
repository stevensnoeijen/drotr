/**
 * Compares the terrain tileset's per-tile walkability (its `blocked`
 * property, set on every tile that isn't walkable) against the
 * original county maps' own per-cell impassable mask, so how far the two
 * disagree is measured rather than guessed. See `docs/MAP_FORMAT.md` for the
 * `.MAP` layout this reads: Section A holds the ground tile of each of
 * 128x128 cells, Section B a 256x256 mask (2x2 subcells per tile) whose
 * `hi` bit 2 marks a subcell impassable. Both are column-major.
 */

import type { TileCategory } from './tile-categories';

/** Every county `.MAP` file is exactly this long. */
export const COUNTY_MAP_BYTES = 327_680;

const SECTION_A_SIZE = 128;
const SECTION_B_OFFSET = 0x10000;
const SECTION_B_SIZE = 256;
/** Section B `hi` bit that marks a subcell impassable. */
export const IMPASSABLE_BIT = 4;

/** Atlas tile index drawn at county cell `(x, y)` (Section A `lo`). */
export function countyGroundTile(map: Uint8Array, x: number, y: number): number {
  const offset = (x * SECTION_A_SIZE + y) * 4;
  return map[offset] | (map[offset + 1] << 8);
}

/** Whether mask subcell `(sx, sy)` is impassable (Section B `hi` bit 2). */
export function isCountySubcellBlocked(map: Uint8Array, sx: number, sy: number): boolean {
  const offset = SECTION_B_OFFSET + (sx * SECTION_B_SIZE + sy) * 4;
  const hi = map[offset + 2] | (map[offset + 3] << 8);
  return (hi & IMPASSABLE_BIT) !== 0;
}

/** Subcell counts where the per-tile property and the original mask disagree. */
export interface MaskDisagreement {
  /** Mask subcells examined. */
  subcells: number;
  /** Mask says impassable; the tile under it is walkable (not `blocked`). */
  blockedButWalkable: number;
  /** Mask says passable; the tile under it is `blocked`. */
  openButNotWalkable: number;
}

export interface CountyMaskComparison extends MaskDisagreement {
  /** The same counts, split by the category of the tile each subcell lies on. */
  byCategory: Partial<Record<TileCategory, MaskDisagreement>>;
}

function emptyDisagreement(): MaskDisagreement {
  return { subcells: 0, blockedButWalkable: 0, openButNotWalkable: 0 };
}

/**
 * Walks every Section A cell of a county map and compares its tile's
 * walkability with each of the four mask subcells beneath it. Tiles
 * are looked up by atlas index, which equals the tileset id for every
 * index a county uses (0–1471).
 */
export function compareWithCountyMask(
  map: Uint8Array,
  isWalkable: (tileId: number) => boolean,
  categoryOf: (tileId: number) => TileCategory
): CountyMaskComparison {
  if (map.length !== COUNTY_MAP_BYTES) {
    throw new RangeError(`expected a ${COUNTY_MAP_BYTES}-byte county map, got ${map.length} bytes`);
  }

  const total = emptyDisagreement();
  const byCategory: Partial<Record<TileCategory, MaskDisagreement>> = {};

  for (let x = 0; x < SECTION_A_SIZE; x++) {
    for (let y = 0; y < SECTION_A_SIZE; y++) {
      const tile = countyGroundTile(map, x, y);
      const walkable = isWalkable(tile);
      const category = categoryOf(tile);
      const bucket = (byCategory[category] ??= emptyDisagreement());

      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          const blocked = isCountySubcellBlocked(map, x * 2 + dx, y * 2 + dy);
          for (const counts of [total, bucket]) {
            counts.subcells++;
            if (blocked && walkable) counts.blockedButWalkable++;
            if (!blocked && !walkable) counts.openButNotWalkable++;
          }
        }
      }
    }
  }

  return { ...total, byCategory };
}
