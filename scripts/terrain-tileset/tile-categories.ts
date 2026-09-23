/**
 * What every tile of the `terrain` tileset depicts, and whether a unit may
 * stand on it — the source of the tileset's per-tile `blocked` property,
 * set on every tile that isn't walkable.
 *
 * Classified by hand from the decoded atlas art, cross-checked against the
 * original county maps' per-cell impassable mask (see
 * `docs/ART_FORMAT.md`, "Tile walkability"). The rule is category-based:
 * a tile is walkable unless it shows a wall, a closed gate, water, rock or
 * cliff, rubble or other destruction, a broken bridge, a roof or a tree.
 * Open gates and intact bridges are walkable. See the docs for how often the
 * per-tile property and the original per-cell mask disagree.
 *
 * A tile often shows more than one thing (a wall strip over grass, a
 * shoreline); it gets the category of the feature that isn't ground, since
 * that's what makes it an obstacle at all.
 */

import { TERRAIN_TILE_COUNT, TERRAIN_TILESET_COLUMNS } from './terrain-tileset';

export type TileCategory =
  | 'ground'
  | 'open-gate'
  | 'closed-gate'
  | 'bridge'
  | 'rock'
  | 'wall'
  | 'water'
  | 'rubble'
  | 'broken-bridge'
  | 'roof'
  | 'tree'
  | 'filler';

/** One-character code per category, as used in {@link TILE_CATEGORY_ROWS}. */
export const CATEGORY_BY_CODE: Readonly<Record<string, TileCategory>> = {
  g: 'ground', // grass, gravel, stone, dirt, paths, cobbled paving
  o: 'open-gate', // a gateway in a wall with its doors swung open or smashed out
  G: 'closed-gate', // a gateway in a wall with its wooden doors shut
  b: 'bridge', // an intact wooden bridge deck or drawbridge
  k: 'rock', // boulders, rock piles, cliffs, cave mouths, small rocky props
  w: 'wall', // stone walls and wall faces, intact
  '~': 'water', // rivers, lakes, ponds, moats, rocks standing in water
  r: 'rubble', // damaged or destroyed walls, towers, gates and paving
  x: 'broken-bridge', // a wooden bridge deck with holes smashed through it
  R: 'roof', // tiled and wooden roofs, including tower tops
  t: 'tree', // trees and forest
  '.': 'filler', // unused tileset slot, or the black void tile
};

/** Categories a unit may stand on. Everything else blocks. */
export const WALKABLE_CATEGORIES: ReadonlySet<TileCategory> = new Set<TileCategory>([
  'ground',
  'open-gate',
  'bridge',
]);

/**
 * One string per tileset row, one code per tile, laid out exactly like the
 * tileset image (16 columns, tile id = row * 16 + column). Rows 0–91 are
 * atlas rows 0–91 verbatim; rows 92–96 hold the drawbridge and rubble
 * extras among unused filler (see `terrain-tileset.ts`).
 */
export const TILE_CATEGORY_ROWS: readonly string[] = [
  // 0: gravel, boulders and rock piles, gravel
  'gggggggkkkkkgggg',
  // 1-4: walls on grass/gravel, dirt, wooden roofs, trees
  'wwwwwwwwwggRRRgg',
  'wwwwwwwwgRRRRRtt',
  'wwwwwwwwwwwwwwww',
  'wwwwwwRwgwRRRRRR',
  // 5-11: damaged walls and rubble lines; roofs
  'rrrrrrrrrRRRRRRR',
  'rrrrrrrrgRRRRRRR',
  'rrrrrrrrrrRRRRRR',
  'rrrrrrRrgwwwwRRR',
  'rrrrrrrrrRRRRRRR',
  'rrrrrrrrgRRRRRRR',
  'rrrrrrrrrrgggwrr',
  // 12-14: rubble; walls around cobbled paving; roofs and castle walls
  'rrrrrgwrggRRRRRR',
  'wwwwwwwwwwRRRRRR',
  'wwwwwwwwwwwwwwww',
  // 15-24: damaged walls, rubble, a roof strip, moat water
  'rrrrrrrrrrrrrrrr',
  'rrrrrrrrrRrrrrrr',
  'rrrrrrrrrRwwrrrr',
  'rrrrrrrrrR~~~~~~',
  'wwwwwwwwwwwwwwww',
  'wwwwwgwwwwwwwgRR',
  'rrrrrrrrrrrrrrrr',
  'rrrrrrrrrrrrrr~~',
  'rrrrrrrrrrrrrr~~',
  'rrrrrrrrrrrrrr~~',
  // 25-36: walls on grass (intact, then damaged); towers (intact, damaged, ruined)
  'wwwwwwwwwwgggggg',
  'wwwwwgwwwwRRrrrr',
  'rrrrrrrrrrRRrrrr',
  'rrrrrgrrrrRRrrrr',
  'rrrrrrrrrrRRrrrr',
  'rrrrrgrrrrRRrrrr',
  'wwwwwwwwwwRRrrrr',
  'wwwwwwwgwwRRrrrr',
  'rrrrrrrrrrRRrrrr',
  'rrrrrrrgrrRRrrrr',
  'rrrrrrrrrrrrrrrr',
  'rrrrrrrgrrRRrrrr',
  // 37-48: walls in water (intact, then damaged); towers in water; props
  'wwwwwwwwwwRRrrrr',
  'wwwwwwwwwwRRrrrr',
  'rrrrrrrrrr~~~~~~',
  'rrrrrrrrrrRRrrrr',
  'rrrrrrrrrrRRrrrr',
  'rrrrrrrrrr~~~~~~',
  'wwwwwwwwwwwwwk~w',
  'wwwwwwwwwwwwtk~.',
  'rrrrrrrrrrtttkgg',
  'rrrrrrrrrrttwwww',
  'rrrrrrrrrrrgrrrw',
  'rrrrrrrrrrggrrrw',
  // 49-66: cliffs and rocky ground, a river with rocky banks, bridge decks
  'kkgggkggkkkkgkkw',
  'kkggkkkkkkkkgkkw',
  'kkggkgkggggggkkw',
  'gkggkgkgkgkkkkgw',
  'gkkggkgkgkgggggg',
  'ggkggkgkkggggggk',
  'gkkkkggkkgkkgggk',
  'kkggggggkkgkkgkk',
  'gggbbbbxxxxgkktt',
  'k~ggkkkkkkk~~k~~',
  'kkgkkkkkkkk~~k~k',
  'k~kk~~~~~~~~~k~~',
  'g~~g~~~~~~~~~kg~',
  'gk~gg~k~gkkgkgg~',
  'ggk~~~~~ggkgggkg',
  'kkk~kg~~kgkkggkg',
  'k~~kgg~~~k~~kkkk',
  '~~~wwwwrrrr~~krr',
  // 67-74: grass, dirt and gravel transitions; ponds; trees
  'gggggggggggggggg',
  'gggggggggggggggg',
  'gggggggggggggggg',
  'gggggggggggggggg',
  'ggggggggggtttttg',
  '~~~~~~~~~~gggtt.',
  'g~~~g~~~~~~gtt..',
  '~~~~~~~~~~gttttt',
  // 75: bridge decks (intact, then broken); trees
  'bbbbbbxxxxxxtttt',
  // 76-80: walls around cobbled paving (intact, then damaged); towers; moat
  'wwwwwwggrrrrrrrr',
  'wwwggrrrrrRRRRRR',
  'wwwrrrrrrrRRRRRR',
  'ggggggggggRRRRRR',
  '~~~~~~~gggRRRRRR',
  // 81-91: gatehouses (wall top, closed gate, road, splintered gate, gate
  // smashed out, open gate);
  // towers; rocks, caves, paths and rocks in water
  'wwwwww~~RRrrrrrr',
  'GGGGGG~~RRrrrrrr',
  'gggggg~~rrrrrrrr',
  'wwwwww~~~~rrrrrr',
  'rrrrrrggrrrrrrrr',
  'ggggggggggggkkkk',
  'wgwwgwRRrrrrkgkk',
  'ooooooRRrrrrgggg',
  'ggggggRRrrrrg~~~',
  'ooooooggggggg~~~',
  'ggggggggggggg~~~',
  // 92-95: unused filler; the drawbridge at columns 10-15, intact in rows
  // 92-93 and broken (darker, splintered planks) in rows 94-95
  '..........bbbbbb',
  '..........bbbbbb',
  '..........xxxxxx',
  '..........xxxxxx',
  // 96: unused filler; rubble at columns 10-14
  '..........rrrrr.',
];

/** The category of a tileset tile id. */
export function tileCategory(id: number): TileCategory {
  if (!Number.isInteger(id) || id < 0 || id >= TERRAIN_TILE_COUNT) {
    throw new RangeError(`tileset id ${id} is outside the terrain tileset`);
  }
  const code = TILE_CATEGORY_ROWS[Math.floor(id / TERRAIN_TILESET_COLUMNS)][id % TERRAIN_TILESET_COLUMNS];
  return CATEGORY_BY_CODE[code];
}

/** Whether a unit may stand on a tileset tile id. */
export function isWalkableTile(id: number): boolean {
  return WALKABLE_CATEGORIES.has(tileCategory(id));
}
