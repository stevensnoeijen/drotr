import type { PcxImage } from '../../src/lib/art/pcx';
import {
  extractTileRgba,
  tileRect,
  ATLAS_TILE_SIZE,
} from '../../src/lib/art/atlas';
import type { RgbaPixels } from '../../src/lib/art/rgba';
import { BLOCKED_TILE_PROPERTY } from '../../src/game/map/tile-properties';
import { isWalkableTile } from './tile-categories';

/**
 * Builds the `terrain` Tiled tileset out of `ART/BATTLE.ART`'s decoded
 * atlas: only the map-art tiles, in a layout a `.MAP` converter can
 * reference by index unchanged and that opens cleanly in the Tiled editor.
 *
 * The atlas is one flat index space shared by terrain, unit frames, a
 * bitmap font and UI furniture (see `docs/ART_FORMAT.md`). Atlas rows
 * 0–91 (indices 0–1471) are all map art and are kept verbatim, `id =
 * index`. Two small exceptions live further down the sheet, among the UI
 * rows: a 24-tile drawbridge (atlas rows 98–101, columns 10–15) and a
 * 5-tile rubble set (atlas row 102, columns 10–14) — both real map art
 * with no other home. They're appended after row 91, at their original
 * columns, so multi-tile pieces stay adjacent and stampable as a block,
 * and so the whole extras region maps to tile ids with one constant
 * offset.
 */

/** How many tile columns the tileset (and the source atlas) is wide. */
export const TERRAIN_TILESET_COLUMNS = 16;

/** Tileset width/height in pixels. */
export const TERRAIN_TILESET_WIDTH = TERRAIN_TILESET_COLUMNS * ATLAS_TILE_SIZE;
export const TERRAIN_TILESET_ROWS = 97;
export const TERRAIN_TILESET_HEIGHT = TERRAIN_TILESET_ROWS * ATLAS_TILE_SIZE;

/** Total tile slots in the tileset, including unused filler padding. */
export const TERRAIN_TILE_COUNT =
  TERRAIN_TILESET_COLUMNS * TERRAIN_TILESET_ROWS;

/** Highest atlas index (inclusive) copied into the tileset verbatim, `id = index`. */
export const VERBATIM_ATLAS_INDEX_MAX = 1471;

/**
 * Constant offset between an extra tile's atlas index and its tileset id:
 * atlas row 98 (index 1568) becomes tileset row 92 (id 1472) — 6 rows,
 * i.e. 96 tile ids, earlier.
 */
export const EXTRA_TILE_ID_OFFSET = 96;

/** Atlas rows holding the drawbridge, at columns 10–15 only. */
const DRAWBRIDGE_ATLAS_ROWS = [98, 99, 100, 101];
const DRAWBRIDGE_COLUMNS = { first: 10, last: 15 };

/** Atlas row holding the rubble set, at columns 10–14 only. */
const RUBBLE_ATLAS_ROW = 102;
const RUBBLE_COLUMNS = { first: 10, last: 14 };

function atlasIndicesInRow(
  row: number,
  columns: { first: number; last: number }
): number[] {
  const indices: number[] = [];
  for (let col = columns.first; col <= columns.last; col++) {
    indices.push(row * TERRAIN_TILESET_COLUMNS + col);
  }
  return indices;
}

/**
 * Atlas indices of every "extra" tile (drawbridge + rubble), in tileset
 * order.
 */
const EXTRA_ATLAS_INDICES: readonly number[] = [
  ...DRAWBRIDGE_ATLAS_ROWS.flatMap((row) =>
    atlasIndicesInRow(row, DRAWBRIDGE_COLUMNS)
  ),
  ...atlasIndicesInRow(RUBBLE_ATLAS_ROW, RUBBLE_COLUMNS),
];

/** Extra atlas index -> tileset id, and its inverse. */
const EXTRA_ATLAS_INDEX_TO_ID = new Map<number, number>(
  EXTRA_ATLAS_INDICES.map((index) => [index, index - EXTRA_TILE_ID_OFFSET])
);
const EXTRA_ID_TO_ATLAS_INDEX = new Map<number, number>(
  [...EXTRA_ATLAS_INDEX_TO_ID].map(([index, id]) => [id, index])
);

/**
 * Converts an atlas tile index to its tileset id.
 *
 * @throws {RangeError} for an atlas index this tileset doesn't include
 * (e.g. UI, unit frames, or the unused rows around the extras).
 */
export function atlasIndexToTileId(index: number): number {
  if (
    Number.isInteger(index) &&
    index >= 0 &&
    index <= VERBATIM_ATLAS_INDEX_MAX
  ) {
    return index;
  }
  const extraId = EXTRA_ATLAS_INDEX_TO_ID.get(index);
  if (extraId !== undefined) {
    return extraId;
  }
  throw new RangeError(
    `atlas index ${index} is not part of the terrain tileset (not a map tile)`
  );
}

/**
 * Converts a tileset id back to its atlas index.
 *
 * @throws {RangeError} for an id outside the tileset, or an unused filler
 * id in the extras region (1472–1551) that no atlas tile maps to.
 */
export function tileIdToAtlasIndex(id: number): number {
  if (Number.isInteger(id) && id >= 0 && id <= VERBATIM_ATLAS_INDEX_MAX) {
    return id;
  }
  const atlasIndex = EXTRA_ID_TO_ATLAS_INDEX.get(id);
  if (atlasIndex !== undefined) {
    return atlasIndex;
  }
  throw new RangeError(
    `tileset id ${id} is unused filler or outside the terrain tileset`
  );
}

/** Tiled `firstgid` this tileset is always referenced with. */
export const TERRAIN_TILESET_FIRSTGID = 1;

/** Converts a tileset tile id to the gid a Tiled layer would store for it. */
export function tileIdToGid(id: number): number {
  return id + TERRAIN_TILESET_FIRSTGID;
}

/** Converts a Tiled layer gid back to this tileset's tile id. */
export function gidToTileId(gid: number): number {
  return gid - TERRAIN_TILESET_FIRSTGID;
}

/** A generated tileset image: straight RGBA pixels, teal already keyed to alpha. */
export interface TerrainTilesetImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: RgbaPixels;
}

/**
 * Builds the full `terrain.png` pixel buffer from a decoded `BATTLE.ART`.
 *
 * Every slot is transparent unless it's one of the 1472 verbatim tiles or
 * one of the 29 drawbridge/rubble extras; the remaining filler ids in rows
 * 92–96 are left fully transparent on purpose (see
 * {@link EXTRA_TILE_ID_OFFSET}).
 */
export function buildTerrainTilesetImage(image: PcxImage): TerrainTilesetImage {
  const rgba = new Uint8ClampedArray(
    TERRAIN_TILESET_WIDTH * TERRAIN_TILESET_HEIGHT * 4
  ) as RgbaPixels;

  for (let id = 0; id < TERRAIN_TILE_COUNT; id++) {
    let atlasIndex: number;
    try {
      atlasIndex = tileIdToAtlasIndex(id);
    } catch {
      continue; // unused filler slot; stays transparent
    }

    const tile = extractTileRgba(image, atlasIndex);
    const dest = tileRect(id, TERRAIN_TILESET_WIDTH);
    for (let row = 0; row < ATLAS_TILE_SIZE; row++) {
      const srcOffset = row * ATLAS_TILE_SIZE * 4;
      const destOffset = ((dest.y + row) * TERRAIN_TILESET_WIDTH + dest.x) * 4;
      rgba.set(
        tile.subarray(srcOffset, srcOffset + ATLAS_TILE_SIZE * 4),
        destOffset
      );
    }
  }

  return { width: TERRAIN_TILESET_WIDTH, height: TERRAIN_TILESET_HEIGHT, rgba };
}

/**
 * Builds the `terrain.tsx` Tiled tileset XML, referencing `terrain.png`,
 * with {@link BLOCKED_TILE_PROPERTY} set on every tile a unit can't stand on
 * (see `tile-categories.ts`). Formatted the way the Tiled editor writes it,
 * so re-saving the tileset in Tiled leaves it unchanged.
 */
export function buildTerrainTilesetXml(): string {
  const tiles: string[] = [];
  for (let id = 0; id < TERRAIN_TILE_COUNT; id++) {
    if (!isWalkableTile(id)) {
      tiles.push(
        ` <tile id="${id}">\n  <properties>\n   <property name="${BLOCKED_TILE_PROPERTY}" type="bool" value="true"/>\n  </properties>\n </tile>\n`
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.0" name="terrain" tilewidth="${ATLAS_TILE_SIZE}" tileheight="${ATLAS_TILE_SIZE}" tilecount="${TERRAIN_TILE_COUNT}" columns="${TERRAIN_TILESET_COLUMNS}">
 <image source="terrain.png" width="${TERRAIN_TILESET_WIDTH}" height="${TERRAIN_TILESET_HEIGHT}"/>
${tiles.join('')}</tileset>
`;
}
