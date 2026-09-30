import { describe, expect, it } from 'vitest';

import { buildDraculaExeBytes } from './dracula-exe-fixture';

import {
  BUILDING_SITE_COUNTIES,
  BuildingSitesError,
  BuildingType,
  parseBuildingSites,
} from './building-sites';
import { PeError } from './pe';

const { Bridge, Tower, Fortification, Stronghold } = BuildingType;

/** The real prefab rectangles of the prefabs these tests place. */
const PREFABS = [
  { type: Bridge, slot: 1, rect: [11, 3, 12, 7] },
  { type: Bridge, slot: 8, rect: [13, 0, 15, 4] },
  { type: Bridge, slot: 11, rect: [17, 0, 20, 4] },
  { type: Bridge, slot: 26, rect: [21, 40, 24, 42] },
  { type: Tower, slot: 0, rect: [26, 0, 28, 3] },
  { type: Tower, slot: 2, rect: [26, 6, 28, 9] },
  { type: Fortification, slot: 0, rect: [0, 0, 11, 11] },
  { type: Fortification, slot: 1, rect: [0, 11, 15, 26] },
  { type: Fortification, slot: 3, rect: [94, 52, 108, 67] },
  { type: Stronghold, slot: 0, rect: [0, 45, 21, 66] },
  { type: Stronghold, slot: 3, rect: [50, 93, 80, 122] },
] as const;

describe('parseBuildingSites', () => {
  it('returns every county, with no sites where the tables are empty', () => {
    const sites = parseBuildingSites(buildDraculaExeBytes({ prefabs: PREFABS }));
    expect(Object.keys(sites)).toEqual([...BUILDING_SITE_COUNTIES]);
    expect(Object.values(sites).every((list) => list.length === 0)).toBe(true);
  });

  it('groups bridge slots sharing a top-left corner into one crossing, wood first', () => {
    const sites = parseBuildingSites(
      buildDraculaExeBytes({
        prefabs: PREFABS,
        sites: [
          // Sites come out in table (slot) order; the fixture's listing order
          // doesn't matter.
          { county: 'BRAILA', type: Bridge, slot: 11, sites: [[69, 9]] },
          { county: 'BRAILA', type: Bridge, slot: 1, sites: [[59, 11], [69, 9]] },
          { county: 'BRAILA', type: Bridge, slot: 8, sites: [[69, 9]] },
          { county: 'BRAILA', type: Bridge, slot: 26, sites: [[20, 30]] },
        ],
      })
    ).BRAILA;

    expect(sites).toEqual([
      {
        category: 'bridge',
        orientation: 'vertical',
        levels: [
          { level: 'wood', type: Bridge, slot: 1, footprint: { x: 59, y: 11, width: 1, height: 4 } },
        ],
      },
      {
        category: 'bridge',
        orientation: 'vertical',
        levels: [
          { level: 'wood', type: Bridge, slot: 1, footprint: { x: 69, y: 9, width: 1, height: 4 } },
          { level: 'stone', type: Bridge, slot: 8, footprint: { x: 69, y: 9, width: 2, height: 4 } },
          { level: 'stone-wide', type: Bridge, slot: 11, footprint: { x: 69, y: 9, width: 3, height: 4 } },
        ],
      },
      {
        category: 'bridge',
        orientation: 'horizontal',
        levels: [
          { level: 'stone', type: Bridge, slot: 26, footprint: { x: 20, y: 30, width: 3, height: 2 } },
        ],
      },
    ]);
  });

  it('keeps each tower its own site, levelled by ground variant', () => {
    const sites = parseBuildingSites(
      buildDraculaExeBytes({
        prefabs: PREFABS,
        sites: [
          { county: 'SIBIU', type: Tower, slot: 0, sites: [[1, 2], [3, 4]] },
          { county: 'SIBIU', type: Tower, slot: 2, sites: [[5, 6]] },
        ],
      })
    ).SIBIU;

    expect(sites.map((site) => [site.category, site.levels.map((l) => l.level)])).toEqual([
      ['tower', ['grass']],
      ['tower', ['grass']],
      ['tower', ['rock-2']],
    ]);
    expect(sites[2].levels[0].footprint).toEqual({ x: 5, y: 6, width: 2, height: 3 });
  });

  it('merges fortifications and strongholds into castle sites by overlap, in upgrade order', () => {
    const sites = parseBuildingSites(
      buildDraculaExeBytes({
        prefabs: PREFABS,
        sites: [
          // The larger levels are listed first, and pushed against the map
          // edge so their centres drift: grouping must still hold.
          { county: 'BRASOV', type: Stronghold, slot: 3, sites: [[1, 1]] },
          { county: 'BRASOV', type: Stronghold, slot: 0, sites: [[1, 1], [74, 16]] },
          { county: 'BRASOV', type: Fortification, slot: 0, sites: [[10, 4], [79, 21], [40, 60]] },
          { county: 'BRASOV', type: Fortification, slot: 1, sites: [[9, 2], [77, 19]] },
          { county: 'BRASOV', type: Fortification, slot: 3, sites: [[100, 100]] },
        ],
      })
    ).BRASOV;

    expect(
      sites.map((site) => [
        site.category,
        site.levels.map((l) => `${l.level}@${l.footprint.x},${l.footprint.y}`),
      ])
    ).toEqual([
      ['castle', ['1@10,4', '2@9,2', '4@1,1', '5-moated@1,1']],
      ['castle', ['1@79,21', '2@77,19', '4@74,16']],
      ['castle', ['1@40,60']],
      ['castle', ['rock-1@100,100']],
    ]);
  });

  it('rejects a placed prefab without a footprint', () => {
    const bytes = buildDraculaExeBytes({
      sites: [{ county: 'OSTROV', type: Tower, slot: 1, sites: [[1, 1]] }],
    });
    expect(() => parseBuildingSites(bytes)).toThrow(BuildingSitesError);
    expect(() => parseBuildingSites(bytes)).toThrow(/OSTROV places type 1 slot 1/);
  });

  it('rejects a buffer that is not a PE image', () => {
    expect(() => parseBuildingSites(new Uint8Array(1024))).toThrow(PeError);
  });
});
