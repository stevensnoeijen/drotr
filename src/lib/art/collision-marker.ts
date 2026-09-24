import { ATLAS_TILE_SIZE } from './atlas';
import type { RgbaPixels } from './rgba';

/**
 * Tileset id of the synthetic collision-marker tile, in the `terrain`
 * tileset's own numbering (see `scripts/terrain-tileset/terrain-tileset.ts`).
 * It occupies an otherwise-unused filler slot rather than a separate
 * tileset, so it can be dropped into any map's `collision` layer alongside
 * `terrain.tsx` with no extra tileset reference.
 *
 * Shared between the scripts that emit `collision` layers
 * (`scripts/county-map/*.ts`) and the engine code that may want to
 * recognise it (`src/game/map/*.ts`), which is why it lives under
 * `src/lib` rather than in `scripts/` — the same boundary `src/lib/art`
 * already draws for the atlas geometry the converter scripts import.
 */
export const COLLISION_MARKER_TILE_ID = 1551;

/** Stripe colours: bright red alternating with a darker red. */
const STRIPE_COLOR_A: readonly [number, number, number, number] = [
  220, 20, 20, 255,
];
const STRIPE_COLOR_B: readonly [number, number, number, number] = [
  110, 0, 0, 255,
];

/** Width, in pixels, of one diagonal stripe. */
const STRIPE_WIDTH = 5;

/**
 * Renders the collision-marker tile's pixels: opaque diagonal red/dark-red
 * stripes, chosen to be immediately recognisable as "blocked" against any
 * terrain tile it might sit next to in the Tiled editor.
 */
export function drawCollisionMarkerTile(): RgbaPixels {
  const rgba = new Uint8ClampedArray(
    ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4
  ) as RgbaPixels;

  for (let y = 0; y < ATLAS_TILE_SIZE; y++) {
    for (let x = 0; x < ATLAS_TILE_SIZE; x++) {
      const stripe = Math.floor((x + y) / STRIPE_WIDTH) % 2;
      const color = stripe === 0 ? STRIPE_COLOR_A : STRIPE_COLOR_B;
      const offset = (y * ATLAS_TILE_SIZE + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = color[3];
    }
  }

  return rgba;
}
