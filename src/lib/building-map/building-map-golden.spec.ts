import { describe, expect, it } from 'vitest';

import { hasCdFile, readCdFile } from '~/test/cd-assets';

import { BUILDING_MAP_BYTES, parseBuildingMap } from './building-map';

/**
 * Golden tests against the real `COUNTIES/BUILDING.MAP`.
 *
 * It's original game data and is not committed, so the suite skips itself
 * wherever `.cd/` is absent (CI included). The figures pinned here are the
 * ones recorded in `docs/MAP_FORMAT.md`.
 */
const SOURCE = 'COUNTIES/BUILDING.MAP';
const available = hasCdFile(SOURCE);

function nonZeroCount(grid: Uint16Array): number {
  return grid.reduce((count, tile) => count + (tile !== 0 ? 1 : 0), 0);
}

function maxTile(grid: Uint16Array): number {
  return grid.reduce((max, tile) => Math.max(max, tile), 0);
}

describe.skipIf(!available)('BUILDING.MAP', () => {
  const bytes = available ? readCdFile(SOURCE) : (undefined as never);
  const building = available ? parseBuildingMap(bytes) : (undefined as never);

  it('is exactly 983,040 bytes', () => {
    expect(bytes.length).toEqual(BUILDING_MAP_BYTES);
  });

  it('has the recorded non-zero cell counts per grid', () => {
    // Every interior cell is a real tile: the 471 zeros are atlas index 0,
    // the plain ground tile, not holes.
    expect(nonZeroCount(building.interior)).toEqual(15913);
    expect(nonZeroCount(building.intact)).toEqual(4940);
    expect(nonZeroCount(building.ruined)).toEqual(2767);
  });

  it('uses atlas indices up to 1451, inside the verbatim tileset range', () => {
    expect(maxTile(building.interior)).toEqual(1447);
    expect(maxTile(building.intact)).toEqual(1449);
    expect(maxTile(building.ruined)).toEqual(1451);
  });

  it('keeps the 121 overlay cells that spill onto the grass fill', () => {
    // Grass fill is atlas tiles 1382-1387; the hedge/rubble spill just
    // outside the walls has an overlay in both states.
    const isGrass = (tile: number) => tile >= 1382 && tile <= 1387;
    const spill = (overlay: Uint16Array) =>
      overlay.reduce(
        (count, tile, i) =>
          count + (tile !== 0 && isGrass(building.interior[i]) ? 1 : 0),
        0
      );
    expect(spill(building.intact)).toEqual(121);
    expect(spill(building.ruined)).toEqual(121);
  });
});
