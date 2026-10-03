/**
 * Reads the per-county building sites out of the original game's
 * `DRACULA.EXE`: where a bridge, tower or castle can be built in each
 * county, and the footprint every building level needs. None of this is in
 * the county `.MAP` files. See `docs/MAP_FORMAT.md`, "Building sites:
 * extracting them from `DRACULA.EXE`", for how the tables were found and
 * what each field means.
 *
 * The raw tables list one entry per `(county, type, slot)`, where `type` is
 * bridge, tower, fortification or stronghold and `slot` is one prefab of
 * that type. A physical site appears once per level it can hold, each entry
 * with that level's own footprint origin. {@link parseBuildingSites} groups
 * those entries back into sites, each with its levels in upgrade order.
 */
import { parsePe, readVa, type PeImage } from './pe';

/** Counties in the table, in table order: alphabetical `.MAP` file order. */
export const BUILDING_SITE_COUNTIES = [
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

export type BuildingSiteCounty = (typeof BUILDING_SITE_COUNTIES)[number];

/** Building types as the executable numbers them. */
export const BuildingType = {
  Bridge: 0,
  Tower: 1,
  Fortification: 2,
  Stronghold: 3,
} as const;
export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];

const TYPE_COUNT = 4;
/** Prefab slots per type. */
export const SLOTS_PER_TYPE = 42;
/** Site entries per `(county, type, slot)`. */
export const SITES_PER_SLOT = 30;

/**
 * Virtual addresses of the tables in the English build (see
 * `docs/MAP_FORMAT.md`). All are `u8` arrays in `.data`.
 */
export const BUILDING_SITE_TABLE_VAS = {
  /** `[12][4][42]`: how many sites each `(county, type, slot)` has. */
  siteCount: 0x470900,
  /** `[12][4][42][30]`: site x, in tiles. */
  siteX: 0x4710e0,
  /** `[12][4][42][30]`: site y, in tiles. */
  siteY: 0x47fd20,
  /** `[4][42]`: prefab rectangle in `BUILDING.MAP`, x0 (inclusive). */
  prefabX0: 0x46b1a0,
  /** `[4][42]`: prefab rectangle, y0 (inclusive). */
  prefabY0: 0x46b248,
  /** `[4][42]`: prefab rectangle, x1 (exclusive). */
  prefabX1: 0x46b2f0,
  /** `[4][42]`: prefab rectangle, y1 (exclusive). */
  prefabY1: 0x46b398,
} as const;

/** A rectangle of tiles on a county's 128×128 grid. */
export interface TileRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One level a site can hold. */
export interface BuildingSiteLevel {
  /** Level id, unique within the category, e.g. `4` or `5-moated`. */
  readonly level: string;
  readonly type: BuildingType;
  readonly slot: number;
  /** The space this level occupies on the county map. */
  readonly footprint: TileRect;
}

export type BuildingCategory = 'bridge' | 'tower' | 'castle';

/** A place in a county where one building can stand. */
export interface BuildingSite {
  readonly category: BuildingCategory;
  /** Every level the site can hold, in upgrade order (lowest first). */
  readonly levels: readonly BuildingSiteLevel[];
  /** Bridges only: which way the bridge spans the water. */
  readonly orientation?: 'vertical' | 'horizontal';
}

/** Thrown when the tables don't hold what this reader expects. */
export class BuildingSitesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildingSitesError';
  }
}

/** One `(county, type, slot)` entry, before grouping. */
interface RawSite {
  readonly type: BuildingType;
  readonly slot: number;
  readonly footprint: TileRect;
}

/**
 * Castle levels by `(type, slot)`. Levels 1–4 are one chain; after level 4
 * a castle becomes either unmoated (5, 6) or moated (5, 6, 7). The three
 * `rock` levels are the castles built on rock ground instead of grass.
 */
const CASTLE_LEVELS: Readonly<Record<string, string>> = {
  [`${BuildingType.Fortification}:0`]: '1',
  [`${BuildingType.Fortification}:1`]: '2',
  [`${BuildingType.Fortification}:2`]: '3',
  [`${BuildingType.Stronghold}:0`]: '4',
  [`${BuildingType.Stronghold}:1`]: '5-unmoated',
  [`${BuildingType.Stronghold}:2`]: '6-unmoated',
  [`${BuildingType.Stronghold}:3`]: '5-moated',
  [`${BuildingType.Stronghold}:4`]: '6-moated',
  [`${BuildingType.Stronghold}:5`]: '7-moated',
  [`${BuildingType.Fortification}:3`]: 'rock-1',
  [`${BuildingType.Fortification}:4`]: 'rock-2',
  [`${BuildingType.Fortification}:5`]: 'rock-3',
};

/** Castle level ids in upgrade order, for sorting a site's levels. */
const CASTLE_LEVEL_ORDER = [
  '1',
  '2',
  '3',
  '4',
  '5-unmoated',
  '6-unmoated',
  '5-moated',
  '6-moated',
  '7-moated',
  'rock-1',
  'rock-2',
  'rock-3',
];

/** Tower slot → level id. The slots are ground variants, not upgrades. */
const TOWER_LEVELS = ['grass', 'rock-1', 'rock-2'];

/**
 * Bridge level id by width across the span: wood is one tile wide (one
 * small unit at a time), stone two or three.
 */
const BRIDGE_LEVELS: Readonly<Record<number, string>> = {
  1: 'wood',
  2: 'stone',
  3: 'stone-wide',
};

/** Reads the executable's tables into per-county raw entries. */
function readRawSites(image: PeImage): RawSite[][] {
  const countyCount = BUILDING_SITE_COUNTIES.length;
  const slotCount = countyCount * TYPE_COUNT * SLOTS_PER_TYPE;
  const prefabCount = TYPE_COUNT * SLOTS_PER_TYPE;
  const vas = BUILDING_SITE_TABLE_VAS;
  const counts = readVa(image, vas.siteCount, slotCount);
  const xs = readVa(image, vas.siteX, slotCount * SITES_PER_SLOT);
  const ys = readVa(image, vas.siteY, slotCount * SITES_PER_SLOT);
  const x0 = readVa(image, vas.prefabX0, prefabCount);
  const y0 = readVa(image, vas.prefabY0, prefabCount);
  const x1 = readVa(image, vas.prefabX1, prefabCount);
  const y1 = readVa(image, vas.prefabY1, prefabCount);

  return BUILDING_SITE_COUNTIES.map((county, c) => {
    const sites: RawSite[] = [];
    for (let type = 0; type < TYPE_COUNT; type++) {
      for (let slot = 0; slot < SLOTS_PER_TYPE; slot++) {
        const index = (c * TYPE_COUNT + type) * SLOTS_PER_TYPE + slot;
        const count = counts[index];
        if (count === 0) {
          continue;
        }
        if (count > SITES_PER_SLOT) {
          throw new BuildingSitesError(
            `${county} type ${type} slot ${slot} claims ${count} sites; at most ${SITES_PER_SLOT} fit`
          );
        }
        const prefab = type * SLOTS_PER_TYPE + slot;
        const width = x1[prefab] - x0[prefab];
        const height = y1[prefab] - y0[prefab];
        if (width <= 0 || height <= 0) {
          throw new BuildingSitesError(
            `${county} places type ${type} slot ${slot}, which has no prefab footprint`
          );
        }
        for (let k = 0; k < count; k++) {
          sites.push({
            type: type as BuildingType,
            slot,
            footprint: {
              x: xs[index * SITES_PER_SLOT + k],
              y: ys[index * SITES_PER_SLOT + k],
              width,
              height,
            },
          });
        }
      }
    }
    return sites;
  });
}

/** Area, in tiles, shared by two rectangles. */
function overlapArea(a: TileRect, b: TileRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Bridges: every level of one crossing shares the footprint's top-left
 * corner (the near bank), so entries group by that corner. A site holds
 * wood, stone and/or wide stone, all spanning the same way.
 */
function bridgeSites(raw: readonly RawSite[]): BuildingSite[] {
  const groups = new Map<string, BuildingSiteLevel[]>();
  for (const { type, slot, footprint } of raw) {
    const across = Math.min(footprint.width, footprint.height);
    const level = BRIDGE_LEVELS[across];
    if (level === undefined) {
      throw new BuildingSitesError(
        `Bridge slot ${slot} is ${across} tiles wide; expected 1 to 3`
      );
    }
    const key = `${footprint.x},${footprint.y}`;
    const levels = groups.get(key) ?? [];
    levels.push({ level, type, slot, footprint });
    groups.set(key, levels);
  }
  return [...groups.values()].map((levels) => {
    const across = ({ footprint }: BuildingSiteLevel): number =>
      Math.min(footprint.width, footprint.height);
    levels.sort((a, b) => across(a) - across(b) || a.slot - b.slot);
    const { width, height } = levels[0].footprint;
    return {
      category: 'bridge',
      orientation: width < height ? 'vertical' : 'horizontal',
      levels,
    };
  });
}

/** Towers: one level per site, named after its ground variant. */
function towerSites(raw: readonly RawSite[]): BuildingSite[] {
  return raw.map(({ type, slot, footprint }) => {
    const level = TOWER_LEVELS[slot];
    if (level === undefined) {
      throw new BuildingSitesError(`Unknown tower slot ${slot}`);
    }
    return { category: 'tower', levels: [{ level, type, slot, footprint }] };
  });
}

/**
 * Castles (fortifications and strongholds together). Every level of one
 * site is roughly centred on the same point, but near the map edge a big
 * level is pushed inward, so the centres drift. What does hold is that all
 * levels of a site overlap one another, while separate sites never do.
 * Entries are taken in upgrade order, and each joins the site it overlaps
 * most that doesn't hold that level yet, or starts a new one.
 */
function castleSites(raw: readonly RawSite[]): BuildingSite[] {
  const levelOf = ({ type, slot }: RawSite): string => {
    const level = CASTLE_LEVELS[`${type}:${slot}`];
    if (level === undefined) {
      throw new BuildingSitesError(`Unknown castle type ${type} slot ${slot}`);
    }
    return level;
  };
  const rank = (site: RawSite): number => CASTLE_LEVEL_ORDER.indexOf(levelOf(site));
  const ordered = raw
    .map((site, index) => ({ site, index }))
    .sort((a, b) => rank(a.site) - rank(b.site) || a.index - b.index);

  const groups: BuildingSiteLevel[][] = [];
  for (const { site } of ordered) {
    const entry: BuildingSiteLevel = {
      level: levelOf(site),
      type: site.type,
      slot: site.slot,
      footprint: site.footprint,
    };
    let best: BuildingSiteLevel[] | undefined;
    let bestOverlap = 0;
    for (const group of groups) {
      if (group.some(({ level }) => level === entry.level)) {
        continue;
      }
      const overlap = Math.max(
        ...group.map(({ footprint }) => overlapArea(footprint, entry.footprint))
      );
      if (overlap > bestOverlap) {
        best = group;
        bestOverlap = overlap;
      }
    }
    if (best) {
      best.push(entry);
    } else {
      groups.push([entry]);
    }
  }
  return groups.map((levels) => ({ category: 'castle', levels }));
}

function groupSites(raw: readonly RawSite[]): BuildingSite[] {
  const ofType = (...types: BuildingType[]): RawSite[] =>
    raw.filter((site) => types.includes(site.type));
  return [
    ...bridgeSites(ofType(BuildingType.Bridge)),
    ...towerSites(ofType(BuildingType.Tower)),
    ...castleSites(ofType(BuildingType.Fortification, BuildingType.Stronghold)),
  ];
}

/**
 * Reads every county's building sites from `DRACULA.EXE`'s bytes: bridges,
 * then towers, then castles, each in table order.
 *
 * @throws {PeError} if the bytes aren't a PE image holding the tables.
 * @throws {BuildingSitesError} if the tables hold something unexpected.
 */
export function parseBuildingSites(
  exe: Uint8Array
): Record<BuildingSiteCounty, BuildingSite[]> {
  const raw = readRawSites(parsePe(exe));
  return Object.fromEntries(
    BUILDING_SITE_COUNTIES.map((county, c) => [county, groupSites(raw[c])])
  ) as Record<BuildingSiteCounty, BuildingSite[]>;
}

/**
 * Bridge slots whose end caps are drawn for rock ground. Every other bridge
 * slot has grass-bank caps. Each bridge shape exists twice in
 * `BUILDING.MAP`, once per bank type: the deck tiles are identical and only
 * the end caps differ (stone vertical: grass 1225/1229, rock 1064/1066; wood
 * vertical: 1207/1209 vs 920/921; wood horizontal: 1210/1212 vs 922/923;
 * stone horizontal: 1238/1254 vs 1241/1257). The county sites that use these
 * slots all meet rock or cliff terrain at both ends.
 */
const ROCK_BANK_BRIDGE_SLOTS: ReadonlySet<number> = new Set([
  3, 4, 5, 6, 17, 18, 19, 23, 24, 25, 38, 39, 40, 41,
]);

/** What a bridge's end caps sit on. */
export type BridgeBank = 'grass' | 'rock';

/** One building prefab: where its art sits in `BUILDING.MAP`. */
export interface BuildingPrefab {
  readonly category: BuildingCategory;
  /** Level id, as used by the county `constructions` layer. */
  readonly level: string;
  readonly type: BuildingType;
  readonly slot: number;
  /** The prefab's source rectangle, in `BUILDING.MAP` tiles. */
  readonly rect: TileRect;
  /** Bridges only. */
  readonly orientation?: 'vertical' | 'horizontal';
  /** Bridges only. */
  readonly bank?: BridgeBank;
}

/**
 * Reads every non-empty prefab (bridges, then towers, then castles, each in
 * table order) with its source rectangle in `BUILDING.MAP`.
 *
 * @throws {PeError} if the bytes aren't a PE image holding the tables.
 * @throws {BuildingSitesError} if a prefab has a level this reader doesn't know.
 */
export function parseBuildingPrefabs(exe: Uint8Array): BuildingPrefab[] {
  const image = parsePe(exe);
  const count = TYPE_COUNT * SLOTS_PER_TYPE;
  const vas = BUILDING_SITE_TABLE_VAS;
  const x0 = readVa(image, vas.prefabX0, count);
  const y0 = readVa(image, vas.prefabY0, count);
  const x1 = readVa(image, vas.prefabX1, count);
  const y1 = readVa(image, vas.prefabY1, count);

  const prefabs: BuildingPrefab[] = [];
  const order = [
    BuildingType.Bridge,
    BuildingType.Tower,
    BuildingType.Fortification,
    BuildingType.Stronghold,
  ];
  for (const type of order) {
    for (let slot = 0; slot < SLOTS_PER_TYPE; slot++) {
      const i = type * SLOTS_PER_TYPE + slot;
      const width = x1[i] - x0[i];
      const height = y1[i] - y0[i];
      if (width <= 0 || height <= 0) {
        continue;
      }
      const rect = { x: x0[i], y: y0[i], width, height };
      if (type === BuildingType.Bridge) {
        const across = Math.min(width, height);
        const level = BRIDGE_LEVELS[across];
        if (level === undefined) {
          throw new BuildingSitesError(
            `Bridge slot ${slot} is ${across} tiles wide; expected 1 to 3`
          );
        }
        prefabs.push({
          category: 'bridge',
          level,
          type,
          slot,
          rect,
          orientation: width < height ? 'vertical' : 'horizontal',
          bank: ROCK_BANK_BRIDGE_SLOTS.has(slot) ? 'rock' : 'grass',
        });
      } else if (type === BuildingType.Tower) {
        const level = TOWER_LEVELS[slot];
        if (level === undefined) {
          throw new BuildingSitesError(`Unknown tower slot ${slot}`);
        }
        prefabs.push({ category: 'tower', level, type, slot, rect });
      } else {
        const level = CASTLE_LEVELS[`${type}:${slot}`];
        if (level === undefined) {
          throw new BuildingSitesError(`Unknown castle type ${type} slot ${slot}`);
        }
        prefabs.push({ category: 'castle', level, type, slot, rect });
      }
    }
  }
  return prefabs;
}
