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

/** Stripe colour: bright red. */
const STRIPE_COLOR_A: readonly [number, number, number, number] = [
  220, 20, 20, 255,
];

/** Width, in pixels, of one diagonal stripe. */
const STRIPE_WIDTH = 2;

/** Width, in pixels, of the transparent gap between two stripes. */
const STRIPE_GAP = 4;

/** Period, in pixels, of one stripe-plus-gap cycle. */
const STRIPE_PERIOD = STRIPE_WIDTH + STRIPE_GAP;

/**
 * Renders the collision-marker tile's pixels: a sparse diagonal hazard
 * stripe in opaque red, with every other pixel fully transparent
 * (alpha 0, not merely a dark fill). Tiled overlays this tile directly on
 * top of the map's normal terrain tile on the `collision` layer, so
 * anything less than true transparency between the stripes would blot out
 * the terrain underneath instead of just flagging it as blocked.
 */
export function drawCollisionMarkerTile(): RgbaPixels {
  const rgba = new Uint8ClampedArray(
    ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4
  ) as RgbaPixels;

  for (let y = 0; y < ATLAS_TILE_SIZE; y++) {
    for (let x = 0; x < ATLAS_TILE_SIZE; x++) {
      const offset = (y * ATLAS_TILE_SIZE + x) * 4;
      const onStripe = ((x + y) % STRIPE_PERIOD) < STRIPE_WIDTH;
      if (onStripe) {
        rgba[offset] = STRIPE_COLOR_A[0];
        rgba[offset + 1] = STRIPE_COLOR_A[1];
        rgba[offset + 2] = STRIPE_COLOR_A[2];
        rgba[offset + 3] = STRIPE_COLOR_A[3];
      } else {
        rgba[offset + 3] = 0;
      }
    }
  }

  return rgba;
}
