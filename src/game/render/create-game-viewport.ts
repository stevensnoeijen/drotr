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
 * to: drag/pinch/wheel to pan and zoom, clamped once real map bounds are
 * known via {@link applyViewportBounds}. World size starts equal to screen
 * size (an effective no-op clamp) until then.
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

  viewport.drag().pinch().wheel();
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
