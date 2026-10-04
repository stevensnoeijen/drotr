import { describe, expect, it } from 'vitest';

import { resolvePlacement, validatePlacements } from './building-placement';
import type { BuildingPrefab, ConstructionSite } from './construction-sites';
import type { ParsedMap } from './load-tiled-map';

const sites: ConstructionSite[] = [
  {
    name: 'castle-1',
    category: 'castle',
    levels: ['1', '4'],
    footprints: {
      '1': { x: 99, y: 21, width: 11, height: 11 },
      '4': { x: 95, y: 17, width: 21, height: 21 },
    },
  },
  {
    name: 'tower-1',
    category: 'tower',
    levels: ['grass'],
    footprints: { grass: { x: 5, y: 5, width: 2, height: 2 } },
  },
  {
    name: 'bridge-2',
    category: 'bridge',
    levels: ['stone'],
    orientation: 'vertical',
    footprints: { stone: { x: 69, y: 9, width: 2, height: 4 } },
  },
];

function prefab(overrides: Partial<BuildingPrefab>): BuildingPrefab {
  return {
    name: 'p',
    category: 'castle',
    level: '4',
    rect: { x: 0, y: 0, width: 21, height: 21 },
    ...overrides,
  };
}

const prefabs: BuildingPrefab[] = [
  prefab({ name: 'castle-4' }),
  prefab({ name: 'castle-1', level: '1', rect: { x: 0, y: 0, width: 11, height: 11 } }),
  prefab({ name: 'tower', category: 'tower', level: 'grass', rect: { x: 0, y: 0, width: 2, height: 2 } }),
  prefab({
    name: 'bridge-grass',
    category: 'bridge',
    level: 'stone',
    orientation: 'vertical',
    bank: 'grass',
    rect: { x: 0, y: 0, width: 2, height: 4 },
  }),
  prefab({
    name: 'bridge-rock',
    category: 'bridge',
    level: 'stone',
    orientation: 'vertical',
    bank: 'rock',
    rect: { x: 4, y: 0, width: 2, height: 4 },
  }),
  prefab({
    name: 'bridge-horizontal',
    category: 'bridge',
    level: 'stone',
    orientation: 'horizontal',
    bank: 'grass',
    rect: { x: 8, y: 0, width: 4, height: 2 },
  }),
];

function prefabName(result: ReturnType<typeof resolvePlacement>): string | undefined {
  return result.prefab?.name;
}

describe('resolvePlacement', () => {
  it('resolves a valid castle, tower and bridge', () => {
    expect(prefabName(resolvePlacement(sites, prefabs, { site: 'castle-1', level: '4' }))).toBe(
      'castle-4'
    );
    expect(prefabName(resolvePlacement(sites, prefabs, { site: 'tower-1', level: 'grass' }))).toBe(
      'tower'
    );
    expect(prefabName(resolvePlacement(sites, prefabs, { site: 'bridge-2', level: 'stone' }))).toBe(
      'bridge-grass'
    );
  });

  it('returns the footprint of the requested level', () => {
    const result = resolvePlacement(sites, prefabs, { site: 'castle-1', level: '1' });
    expect(result.footprint).toEqual({
      x: 99,
      y: 21,
      width: 11,
      height: 11,
    });
  });

  it('picks the rock bank when asked, and the grass bank by default', () => {
    expect(
      prefabName(resolvePlacement(sites, prefabs, { site: 'bridge-2', level: 'stone', bank: 'rock' }))
    ).toBe('bridge-rock');
    expect(
      prefabName(resolvePlacement(sites, prefabs, { site: 'bridge-2', level: 'stone', bank: 'grass' }))
    ).toBe('bridge-grass');
  });

  it('rejects an unknown site', () => {
    expect(resolvePlacement(sites, prefabs, { site: 'castle-9', level: '1' }).error).toMatch(
      /no construction site "castle-9"/
    );
  });

  it('rejects a level the site does not allow', () => {
    expect(resolvePlacement(sites, prefabs, { site: 'tower-1', level: '4' }).error).toMatch(
      /does not allow level "4".*grass/
    );
  });

  it('rejects a site with no prefab of the footprint size', () => {
    const small = prefabs.filter((p) => p.name !== 'castle-4');
    expect(resolvePlacement(sites, small, { site: 'castle-1', level: '4' }).error).toMatch(
      /No castle prefab/
    );
    const wrongSize = [prefab({ rect: { x: 0, y: 0, width: 20, height: 21 } })];
    expect(resolvePlacement(sites, wrongSize, { site: 'castle-1', level: '4' }).error).toMatch(
      /No castle prefab/
    );
  });

  it('checks only the site when no prefabs are given', () => {
    const result = resolvePlacement(sites, undefined, { site: 'castle-1', level: '4' });
    expect(result.error).toBeUndefined();
    expect(result.prefab).toBeUndefined();
    expect(resolvePlacement(sites, undefined, { site: 'castle-1', level: '9' }).error).toBeDefined();
  });
});

function county(): Pick<ParsedMap, 'objectLayers'> {
  return {
    objectLayers: [
      {
        name: 'constructions',
        visible: true,
        objects: [
          {
            name: 'tower-1',
            type: 'tower',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            point: true,
            properties: { levels: 'grass', 'footprint:grass': '5,5,2,2' },
          },
        ],
      },
    ],
  };
}

describe('validatePlacements', () => {
  it('accepts valid placements and an empty list', () => {
    expect(validatePlacements(county(), [{ site: 'tower-1', level: 'grass' }])).toBeUndefined();
    expect(validatePlacements(undefined, [])).toBeUndefined();
  });

  it('reports the first invalid placement, or a map with no sites', () => {
    expect(
      validatePlacements(county(), [
        { site: 'tower-1', level: 'grass' },
        { site: 'tower-2', level: 'grass' },
      ])
    ).toMatch(/tower-2/);
    expect(validatePlacements(undefined, [{ site: 'tower-1', level: 'grass' }])).toBeDefined();
  });
});
