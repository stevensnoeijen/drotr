import { describe, expect, it } from 'vitest';

import { hasCdFile, readCdFile } from '~/test/cd-assets';

import { isWalkableTile, tileCategory } from './tile-categories';
import { compareWithCountyMask, type MaskDisagreement } from './walkability-evidence';

/**
 * Pins how far the tileset's per-tile walkability disagrees with the
 * original per-cell impassable mask of every county map, so a change to the
 * tile classification that shifts the agreement shows up here. The numbers
 * are documented in `docs/ART_FORMAT.md`, "Tile walkability".
 *
 * Needs the original `.MAP` files, which are never committed, so it skips
 * without `.cd/` (CI included), like the other golden suites.
 */
const COUNTIES = [
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
const available = COUNTIES.every((county) => hasCdFile(`COUNTIES/${county}.MAP`));

describe.skipIf(!available)('tile walkability against the county impassable masks', () => {
  const total: MaskDisagreement = { subcells: 0, blockedButWalkable: 0, openButNotWalkable: 0 };
  const byCategory: Record<string, MaskDisagreement> = {};
  if (available) {
    for (const county of COUNTIES) {
      const result = compareWithCountyMask(readCdFile(`COUNTIES/${county}.MAP`), isWalkableTile, tileCategory);
      total.subcells += result.subcells;
      total.blockedButWalkable += result.blockedButWalkable;
      total.openButNotWalkable += result.openButNotWalkable;
      for (const [category, counts] of Object.entries(result.byCategory)) {
        const bucket = (byCategory[category] ??= { subcells: 0, blockedButWalkable: 0, openButNotWalkable: 0 });
        bucket.subcells += counts.subcells;
        bucket.blockedButWalkable += counts.blockedButWalkable;
        bucket.openButNotWalkable += counts.openButNotWalkable;
      }
    }
  }

  it('disagrees on the recorded number of subcells across all twelve counties', () => {
    expect(total).toEqual({ subcells: 786_432, blockedButWalkable: 3_673, openButNotWalkable: 17_954 });
  });

  it('disagrees on the recorded number of subcells per tile category', () => {
    expect(byCategory).toEqual({
      ground: { subcells: 601_044, blockedButWalkable: 3_673, openButNotWalkable: 0 },
      rock: { subcells: 40_196, blockedButWalkable: 0, openButNotWalkable: 9_776 },
      tree: { subcells: 77_492, blockedButWalkable: 0, openButNotWalkable: 6_203 },
      water: { subcells: 67_700, blockedButWalkable: 0, openButNotWalkable: 1_975 },
    });
  });
});
