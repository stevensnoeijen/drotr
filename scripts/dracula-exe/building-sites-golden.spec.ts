import { describe, expect, it } from 'vitest';

import { hasCdFile, readCdFile } from '~/test/cd-assets';

import { parseBuildingSites, type BuildingSiteCounty } from './building-sites';

/**
 * Golden tests against the real `DRACULA.EXE`.
 *
 * It's original game data and is not committed, so the suite skips itself
 * wherever `.cd/` is absent (CI included). The figures pinned here are the
 * ones recorded in `docs/MAP_FORMAT.md`.
 */
const SOURCE = 'DRACULA.EXE';
const available = hasCdFile(SOURCE);

/** Sites per county: bridges, towers, castles. */
const EXPECTED_COUNTS: Record<BuildingSiteCounty, [number, number, number]> = {
  BRAILA: [11, 21, 9],
  BRASOV: [0, 25, 5],
  CUERTA: [15, 28, 7],
  FAGARAS: [12, 49, 7],
  GIURGIU: [7, 20, 6],
  HIRSOVA: [12, 23, 4],
  OSTROV: [4, 23, 7],
  PITESTI: [6, 26, 7],
  RASOVA: [6, 19, 3],
  SIBIU: [6, 26, 4],
  SNAGOV: [4, 24, 8],
  TIRGO: [6, 23, 6],
};

describe.skipIf(!available)('DRACULA.EXE building sites', () => {
  const sites = available
    ? parseBuildingSites(readCdFile(SOURCE))
    : (undefined as never);

  it('has the recorded number of sites per county and category', () => {
    const counts = Object.fromEntries(
      Object.entries(sites).map(([county, list]) => [
        county,
        (['bridge', 'tower', 'castle'] as const).map(
          (category) => list.filter((site) => site.category === category).length
        ),
      ])
    );
    expect(counts).toEqual(EXPECTED_COUNTS);
  });

  it('starts every castle site at its base level: 1, or rock-1 on rock ground', () => {
    const firsts = new Set(
      Object.values(sites).flatMap((list) =>
        list
          .filter((site) => site.category === 'castle')
          .map((site) => site.levels[0].level)
      )
    );
    expect([...firsts].sort()).toEqual(['1', 'rock-1']);
  });

  it('pins Brasov’s largest castle site, every level centred near one point', () => {
    const castle = sites.BRASOV.find(
      (site) => site.category === 'castle' && site.levels.length === 7
    );
    expect(castle?.levels.map(({ level, footprint: f }) => `${level}@${f.x},${f.y},${f.width}x${f.height}`)).toEqual([
      '1@79,21,11x11',
      '2@77,19,15x15',
      '3@76,18,18x19',
      '4@74,16,21x21',
      '5-unmoated@72,15,31x27',
      '5-moated@70,14,30x29',
      '6-moated@65,12,39x34',
    ]);
  });

  it('builds wood bridges one tile wide and stone ones two or three', () => {
    const widths = new Map<string, Set<number>>();
    for (const list of Object.values(sites)) {
      for (const site of list.filter((s) => s.category === 'bridge')) {
        for (const { level, footprint } of site.levels) {
          const across = Math.min(footprint.width, footprint.height);
          widths.set(level, (widths.get(level) ?? new Set()).add(across));
        }
      }
    }
    expect(Object.fromEntries([...widths].map(([k, v]) => [k, [...v]]))).toEqual({
      wood: [1],
      stone: [2],
      'stone-wide': [3],
    });
  });
});
