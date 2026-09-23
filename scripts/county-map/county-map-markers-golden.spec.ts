import { describe, expect, it } from 'vitest';

import {
  parseCountyMap,
  SECTION_A_SIZE,
  SECTION_B_SIZE,
  subcellAt,
  tileAt,
  type CountyMap,
} from '~/lib/county-map';
import { hasCdFile, readCdFile } from '~/test/cd-assets';

import { COUNTY_NAMES, countyMapCdPath, type CountyName } from './county-names';

/**
 * Golden tests pinning the evidence behind "Buildable locations: not encoded
 * in the county files" in `docs/MAP_FORMAT.md`, across all 12 real county
 * files.
 *
 * The search for buildable-location markers came up empty. These figures
 * cover the only per-map, marker-like features a county file does carry,
 * and they show why neither is a building site: bit 8 (`256`) of Section B
 * `hi` sits only on water blobs or on the cliff-rim tile 784, and tile 701
 * (a signpost) sits only on the map border. If a future reading of the
 * format changes any of this, these tests and that section of the doc must
 * change together.
 *
 * The original files aren't committed, so each county skips itself when
 * its `.MAP` is absent from `.cd/` (CI included).
 */

/** Section B `hi` bit 8, the rare modifier examined in `docs/MAP_FORMAT.md`. */
const BIT_256 = 256;

/** Water tiles that carry bit 8 across all four of their subcells. */
const WATER_TILES = new Set([702, 718, 1302, 1303, 1318, 1319]);

/** Cliff-ridge tile that carries bit 8 on its top-left subcell only. */
const CLIFF_RIM_TILE = 784;

/** The signpost-on-a-cairn tile found only on the map border. */
const SIGNPOST_TILE = 701;

interface Bit256Split {
  /** Tiles whose four subcells all carry bit 8. */
  wholeWaterTiles: number;
  /** Tile-784 subcells carrying bit 8, all top-left. */
  cliffRimSubcells: number;
  /** Bit-8 subcells matching neither shape — expected to be none. */
  other: number;
}

const EXPECTED_BIT_256: Record<CountyName, Bit256Split> = {
  BRAILA: { wholeWaterTiles: 3, cliffRimSubcells: 0, other: 0 },
  BRASOV: { wholeWaterTiles: 0, cliffRimSubcells: 0, other: 0 },
  CUERTA: { wholeWaterTiles: 52, cliffRimSubcells: 1, other: 0 },
  FAGARAS: { wholeWaterTiles: 8, cliffRimSubcells: 27, other: 0 },
  GIURGIU: { wholeWaterTiles: 34, cliffRimSubcells: 0, other: 0 },
  HIRSOVA: { wholeWaterTiles: 0, cliffRimSubcells: 0, other: 0 },
  OSTROV: { wholeWaterTiles: 0, cliffRimSubcells: 0, other: 0 },
  PITESTI: { wholeWaterTiles: 0, cliffRimSubcells: 0, other: 0 },
  RASOVA: { wholeWaterTiles: 0, cliffRimSubcells: 0, other: 0 },
  SIBIU: { wholeWaterTiles: 0, cliffRimSubcells: 0, other: 0 },
  SNAGOV: { wholeWaterTiles: 0, cliffRimSubcells: 0, other: 0 },
  TIRGO: { wholeWaterTiles: 0, cliffRimSubcells: 22, other: 0 },
};

/** Tile-701 signposts per county, as `[x, y]` tile coordinates, row by row. */
const EXPECTED_SIGNPOSTS: Record<CountyName, [number, number][]> = {
  BRAILA: [
    [0, 39],
    [0, 120],
  ],
  BRASOV: [
    [127, 44],
    [0, 69],
    [42, 127],
    [84, 127],
  ],
  CUERTA: [
    [17, 0],
    [123, 0],
  ],
  FAGARAS: [
    [0, 28],
    [127, 43],
    [87, 127],
  ],
  GIURGIU: [
    [72, 0],
    [121, 0],
  ],
  HIRSOVA: [
    [31, 0],
    [0, 78],
  ],
  OSTROV: [
    [46, 0],
    [0, 19],
  ],
  PITESTI: [
    [77, 0],
    [0, 2],
    [124, 127],
  ],
  RASOVA: [
    [47, 0],
    [0, 8],
  ],
  SIBIU: [[20, 127]],
  SNAGOV: [
    [28, 0],
    [127, 19],
    [127, 60],
    [0, 62],
    [127, 107],
    [27, 127],
  ],
  TIRGO: [
    [50, 0],
    [0, 45],
    [127, 73],
    [71, 127],
  ],
};

/** The four subcells of tile `(x, y)`: top-left, top-right, bottom-left, bottom-right. */
function tileSubcells(map: CountyMap, x: number, y: number): number[] {
  return [
    subcellAt(map, x * 2, y * 2),
    subcellAt(map, x * 2 + 1, y * 2),
    subcellAt(map, x * 2, y * 2 + 1),
    subcellAt(map, x * 2 + 1, y * 2 + 1),
  ];
}

function splitBit256(map: CountyMap): Bit256Split {
  const split: Bit256Split = {
    wholeWaterTiles: 0,
    cliffRimSubcells: 0,
    other: 0,
  };
  for (let sy = 0; sy < SECTION_B_SIZE; sy++) {
    for (let sx = 0; sx < SECTION_B_SIZE; sx++) {
      if ((subcellAt(map, sx, sy) & BIT_256) === 0) continue;

      const x = Math.floor(sx / 2);
      const y = Math.floor(sy / 2);
      const tile = tileAt(map, x, y);
      const topLeft = sx % 2 === 0 && sy % 2 === 0;
      const wholeTile = tileSubcells(map, x, y).every(
        (value) => value === BIT_256
      );

      if (WATER_TILES.has(tile) && wholeTile) {
        // Counted once per tile, from its top-left subcell.
        if (topLeft) split.wholeWaterTiles++;
      } else if (tile === CLIFF_RIM_TILE && topLeft) {
        split.cliffRimSubcells++;
      } else {
        split.other++;
      }
    }
  }
  return split;
}

function signposts(map: CountyMap): [number, number][] {
  const found: [number, number][] = [];
  for (let y = 0; y < SECTION_A_SIZE; y++) {
    for (let x = 0; x < SECTION_A_SIZE; x++) {
      if (tileAt(map, x, y) === SIGNPOST_TILE) found.push([x, y]);
    }
  }
  return found;
}

function onBorder([x, y]: [number, number]): boolean {
  const last = SECTION_A_SIZE - 1;
  return x === 0 || y === 0 || x === last || y === last;
}

describe.each(COUNTY_NAMES)('%s.MAP marker-like features', (name) => {
  const source = countyMapCdPath(name);
  const available = hasCdFile(source);

  describe.skipIf(!available)('with the CD data present', () => {
    const map = available
      ? parseCountyMap(readCdFile(source))
      : (undefined as never);

    it('carries bit 8 only as whole water tiles or top-left cliff-rim subcells', () => {
      expect(splitBit256(map)).toEqual(EXPECTED_BIT_256[name]);
    });

    it('has its signposts only on the map border', () => {
      const found = signposts(map);
      expect(found).toEqual(EXPECTED_SIGNPOSTS[name]);
      expect(found.every(onBorder)).toBe(true);
    });

    it('blocks the top half of every signpost tile', () => {
      for (const [x, y] of signposts(map)) {
        expect(tileSubcells(map, x, y)).toEqual([4, 4, 0, 0]);
      }
    });
  });
});
