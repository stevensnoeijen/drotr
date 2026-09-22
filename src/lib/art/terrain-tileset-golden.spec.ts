import * as fs from 'node:fs';
import * as path from 'node:path';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { hasCdFile, readCdFile, cdPath } from '~/test/cd-assets';

import { decodePcx } from './pcx';
import { extractTileRgba } from './atlas';
import {
  atlasIndexToTileId,
  buildTerrainTilesetImage,
  type TerrainTilesetImage,
} from './terrain-tileset';

function readTilesetTile(
  tileset: TerrainTilesetImage,
  id: number
): Uint8ClampedArray {
  const x = (id % 16) * 40;
  const y = Math.floor(id / 16) * 40;
  const out = new Uint8ClampedArray(40 * 40 * 4);
  for (let row = 0; row < 40; row++) {
    const src = ((y + row) * tileset.width + x) * 4;
    out.set(tileset.rgba.subarray(src, src + 40 * 4), row * 40 * 4);
  }
  return out;
}

/**
 * Golden tests against the real `ART/BATTLE.ART` and `COUNTIES/*.MAP`
 * files.
 *
 * These are original game data and are not committed, so the suite skips
 * itself wherever `.cd/` is absent (CI included), the same convention as
 * `battle-art.spec.ts`.
 */
const BATTLE_ART = 'ART/BATTLE.ART';
const available = hasCdFile(BATTLE_ART);

const COUNTY_FILES = [
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
].map((name) => `COUNTIES/${name}.MAP`);
const BUILDING_MAP = 'COUNTIES/BUILDING.MAP';

const SECTION_A_CELLS = 128 * 128;
const SECTION_B_OFFSET = 0x10000;
const SECTION_B_CELLS = 256 * 256;

/**
 * Reads every `lo` tile index out of one 327,680-byte county-shaped
 * section: Section A (`sectionOffset = 0`) or, for `BUILDING.MAP`, Section
 * B's `lo` field (`sectionOffset = 0x10000`) — see `docs/MAP_FORMAT.md`.
 * Each cell is a 4-byte little-endian record, `u16 lo` then `u16 hi`.
 */
function readSectionLo(
  bytes: Uint8Array,
  sectionOffset: number,
  cellCount: number
): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lo: number[] = [];
  for (let i = 0; i < cellCount; i++) {
    lo.push(view.getUint16(sectionOffset + i * 4, true));
  }
  return lo;
}

describe.skipIf(!available)('terrain tileset against BATTLE.ART', () => {
  const image = available
    ? decodePcx(readCdFile(BATTLE_ART))
    : (undefined as never);

  it('matches atlas tile 1437 (a known shoreline tile) at id 1437', () => {
    const id = atlasIndexToTileId(1437);
    expect(id).toEqual(1437);
    const tileset = buildTerrainTilesetImage(image);
    expect(readTilesetTile(tileset, id)).toEqual(extractTileRgba(image, 1437));
  });

  it('matches atlas tile 1578 (the drawbridge) at id 1482', () => {
    const id = atlasIndexToTileId(1578);
    expect(id).toEqual(1482);
    const tileset = buildTerrainTilesetImage(image);
    expect(readTilesetTile(tileset, id)).toEqual(extractTileRgba(image, 1578));
  });

  it('matches the decoded pixels of the committed terrain.png (catches a stale committed file)', () => {
    const fresh = buildTerrainTilesetImage(image);
    const committed = PNG.sync.read(
      fs.readFileSync(path.join(process.cwd(), 'public', 'maps', 'terrain.png'))
    );
    expect(committed.width).toEqual(fresh.width);
    expect(committed.height).toEqual(fresh.height);

    // A manual byte compare rather than `expect(...).toEqual(...)`: these
    // buffers are ~10M bytes each, and building a mismatch diff over
    // arrays that size is what actually blows the heap, not the compare.
    let firstMismatch = -1;
    for (let i = 0; i < fresh.rgba.length; i++) {
      if (committed.data[i] !== fresh.rgba[i]) {
        firstMismatch = i;
        break;
      }
    }
    expect(firstMismatch).toEqual(-1);
  });

  it('maps every tile index the county maps and BUILDING.MAP reference to a non-empty tile', () => {
    const referenced = new Set<number>();

    for (const file of COUNTY_FILES) {
      if (!hasCdFile(file)) {
        console.warn(`skipping ${cdPath(file)}: not present`);
        continue;
      }
      const bytes = readCdFile(file);
      for (const lo of readSectionLo(bytes, 0, SECTION_A_CELLS)) {
        referenced.add(lo);
      }
    }

    if (hasCdFile(BUILDING_MAP)) {
      const bytes = readCdFile(BUILDING_MAP);
      // Block 0's Section A `lo` (prefab tile data) and Section B `lo`
      // (documented in docs/MAP_FORMAT.md) both carry real tile indices.
      for (const lo of readSectionLo(bytes, 0, SECTION_A_CELLS)) {
        referenced.add(lo);
      }
      for (const lo of readSectionLo(
        bytes,
        SECTION_B_OFFSET,
        SECTION_B_CELLS
      )) {
        referenced.add(lo);
      }
    } else {
      console.warn(`skipping ${cdPath(BUILDING_MAP)}: not present`);
    }

    // Index 0 is a real, opaque ground tile (see docs/MAP_FORMAT.md); it is
    // not a "no tile" sentinel and is expected among the referenced set.
    expect(referenced.size).toBeGreaterThan(0);

    const tileset = buildTerrainTilesetImage(image);
    const emptyIndices: number[] = [];
    for (const index of referenced) {
      let id: number;
      try {
        id = atlasIndexToTileId(index);
      } catch {
        emptyIndices.push(index);
        continue;
      }
      const x = (id % 16) * 40;
      const y = Math.floor(id / 16) * 40;
      let opaquePixels = 0;
      for (let row = 0; row < 40 && opaquePixels === 0; row++) {
        const rowOffset = ((y + row) * tileset.width + x) * 4;
        for (let col = 0; col < 40; col++) {
          if (tileset.rgba[rowOffset + col * 4 + 3] !== 0) {
            opaquePixels++;
            break;
          }
        }
      }
      if (opaquePixels === 0) {
        emptyIndices.push(index);
      }
    }

    expect(emptyIndices).toEqual([]);
  });
});
