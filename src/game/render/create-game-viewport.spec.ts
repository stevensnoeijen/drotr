import type { EventSystem } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import {
  MAX_ZOOM_SCALE,
  applyViewportBounds,
  createGameViewport,
} from './create-game-viewport';

/** Minimal stand-in for Pixi's EventSystem — enough for the drag/pinch/wheel
 * plugins to mount without a real renderer. */
function fakeEvents(): EventSystem {
  return {
    domElement: document.createElement('div'),
    mapPositionToPoint: () => {},
  } as unknown as EventSystem;
}

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1600;

function buildViewport() {
  const viewport = createGameViewport({
    events: fakeEvents(),
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
  });
  applyViewportBounds(viewport, WORLD_WIDTH, WORLD_HEIGHT);
  return viewport;
}

describe('createGameViewport clamping', () => {
  it('settles panning past the left/top edge at the map origin', () => {
    const viewport = buildViewport();

    viewport.moveCorner(-500, -500);
    viewport.plugins.get('clamp')?.update();

    expect(viewport.left).toBe(0);
    expect(viewport.top).toBe(0);
  });

  it('settles panning past the right/bottom edge at the map bounds', () => {
    const viewport = buildViewport();

    viewport.moveCorner(WORLD_WIDTH, WORLD_HEIGHT);
    viewport.plugins.get('clamp')?.update();

    expect(viewport.right).toBe(WORLD_WIDTH);
    expect(viewport.bottom).toBe(WORLD_HEIGHT);
  });

  it('clamps zooming out at the fit-to-screen scale', () => {
    const viewport = buildViewport();
    const expectedMinScale = Math.min(
      SCREEN_WIDTH / WORLD_WIDTH,
      SCREEN_HEIGHT / WORLD_HEIGHT
    );

    viewport.setZoom(0.001);
    viewport.plugins.get('clamp-zoom')?.clamp();

    expect(viewport.scale.x).toBeCloseTo(expectedMinScale);
  });

  it('clamps zooming in at MAX_ZOOM_SCALE', () => {
    const viewport = buildViewport();

    viewport.setZoom(1000);
    viewport.plugins.get('clamp-zoom')?.clamp();

    expect(viewport.scale.x).toBeCloseTo(MAX_ZOOM_SCALE);
  });
});
