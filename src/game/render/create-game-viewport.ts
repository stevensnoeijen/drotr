import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';

/** Upper bound on how far the camera may zoom in. */
export const MAX_ZOOM_SCALE = 4;

export interface CreateGameViewportOptions {
  events: EventSystem;
  screenWidth: number;
  screenHeight: number;
}

/**
 * Builds the camera that the world (tiles, units, debug overlays) is added
 * to: pinch/wheel to zoom, clamped once real map bounds are known via
 * {@link applyViewportBounds}. World size starts equal to screen size (an
 * effective no-op clamp) until then.
 *
 * Deliberately no `.drag()`: a pointer-drag that starts on empty ground is
 * drag-to-select (see `SelectionBoxDrag`), not drag-to-pan, and the two
 * can't coexist on the same gesture (#87). Panning instead goes through
 * `CameraPanSystem` (keyboard and edge-of-screen), which drives this same
 * `viewport.x`/`viewport.y`/clamp-plugin API rather than a second camera
 * mechanism.
 */
export function createGameViewport({
  events,
  screenWidth,
  screenHeight,
}: CreateGameViewportOptions): Viewport {
  const viewport = new Viewport({
    screenWidth,
    screenHeight,
    worldWidth: screenWidth,
    worldHeight: screenHeight,
    events,
  });

  viewport.pinch().wheel();
  applyViewportBounds(viewport, screenWidth, screenHeight);

  return viewport;
}

/**
 * Clamps panning to the map's edges and zooming to a range that can't show
 * empty space beyond them: at minimum the whole map fits on screen, at
 * maximum it's {@link MAX_ZOOM_SCALE}x.
 */
export function applyViewportBounds(
  viewport: Viewport,
  worldWidth: number,
  worldHeight: number
): void {
  viewport.worldWidth = worldWidth;
  viewport.worldHeight = worldHeight;

  const minScale = Math.min(
    viewport.screenWidth / worldWidth,
    viewport.screenHeight / worldHeight
  );

  viewport
    .clampZoom({ minScale, maxScale: MAX_ZOOM_SCALE })
    .clamp({ left: 0, top: 0, right: worldWidth, bottom: worldHeight, direction: 'all' });
}
