import type { EventSystem } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { applyViewportBounds, createGameViewport } from '~/game/render/create-game-viewport';
import { applyPan, computePanDirection, EDGE_PAN_MARGIN, PAN_SPEED } from './camera-pan-system';

/** Minimal stand-in for Pixi's EventSystem, matching create-game-viewport.spec.ts. */
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

const NO_KEYS = { up: false, down: false, left: false, right: false };

describe('computePanDirection', () => {
  it('returns zero when nothing is held and the pointer is centered', () => {
    const direction = computePanDirection(NO_KEYS, { x: 400, y: 300 }, SCREEN_WIDTH, SCREEN_HEIGHT);
    expect(direction).toEqual({ x: 0, y: 0 });
  });

  it('pans in the direction of a held arrow key', () => {
    const direction = computePanDirection(
      { ...NO_KEYS, right: true },
      undefined,
      SCREEN_WIDTH,
      SCREEN_HEIGHT
    );
    expect(direction).toEqual({ x: 1, y: 0 });
  });

  it('combines two held arrow keys diagonally', () => {
    const direction = computePanDirection(
      { ...NO_KEYS, up: true, left: true },
      undefined,
      SCREEN_WIDTH,
      SCREEN_HEIGHT
    );
    expect(direction).toEqual({ x: -1, y: -1 });
  });

  it('pans when the pointer is within the edge margin', () => {
    const direction = computePanDirection(
      NO_KEYS,
      { x: EDGE_PAN_MARGIN - 1, y: 300 },
      SCREEN_WIDTH,
      SCREEN_HEIGHT
    );
    expect(direction).toEqual({ x: -1, y: 0 });
  });

  it('pans toward the opposite edge when near the right/bottom margin', () => {
    const direction = computePanDirection(
      NO_KEYS,
      { x: SCREEN_WIDTH - EDGE_PAN_MARGIN + 1, y: SCREEN_HEIGHT - EDGE_PAN_MARGIN + 1 },
      SCREEN_WIDTH,
      SCREEN_HEIGHT
    );
    expect(direction).toEqual({ x: 1, y: 1 });
  });

  it('does not pan just outside the margin', () => {
    const direction = computePanDirection(
      NO_KEYS,
      { x: EDGE_PAN_MARGIN + 1, y: 300 },
      SCREEN_WIDTH,
      SCREEN_HEIGHT
    );
    expect(direction).toEqual({ x: 0, y: 0 });
  });

  it('still reports an edge pan with no pointer position given (e.g. mid selection-box drag elsewhere)', () => {
    // Regression guard: omitting the pointer must not throw, and simply
    // yields keyboard-only panning.
    const direction = computePanDirection(
      { ...NO_KEYS, down: true },
      undefined,
      SCREEN_WIDTH,
      SCREEN_HEIGHT
    );
    expect(direction).toEqual({ x: 0, y: 1 });
  });

  it('does not double the magnitude when a key and the matching edge agree', () => {
    const direction = computePanDirection(
      { ...NO_KEYS, right: true },
      { x: SCREEN_WIDTH - 1, y: 300 },
      SCREEN_WIDTH,
      SCREEN_HEIGHT
    );
    expect(direction).toEqual({ x: 1, y: 0 });
  });
});

describe('applyPan', () => {
  it('moves the viewport in the given direction, scaled by speed and dt', () => {
    const viewport = buildViewport();
    const before = { x: viewport.x, y: viewport.y };

    applyPan(viewport, { x: 1, y: 0 }, PAN_SPEED, 1);

    // Panning right moves the camera right, which moves the world container left.
    expect(viewport.x).toBeLessThan(before.x);
    expect(viewport.y).toBe(before.y);
  });

  it('normalizes a diagonal direction so it is not faster than an axis-aligned one', () => {
    const straight = buildViewport();
    const diagonal = buildViewport();
    const straightStart = { x: straight.x, y: straight.y };
    const diagonalStart = { x: diagonal.x, y: diagonal.y };

    applyPan(straight, { x: 1, y: 0 }, PAN_SPEED, 1);
    applyPan(diagonal, { x: 1, y: 1 }, PAN_SPEED, 1);

    const straightStep = Math.hypot(straight.x - straightStart.x, straight.y - straightStart.y);
    const diagonalStep = Math.hypot(diagonal.x - diagonalStart.x, diagonal.y - diagonalStart.y);
    expect(diagonalStep).toBeCloseTo(straightStep);
  });

  it('does nothing for a zero direction', () => {
    const viewport = buildViewport();
    const before = { x: viewport.x, y: viewport.y };

    applyPan(viewport, { x: 0, y: 0 }, PAN_SPEED, 1);

    expect(viewport.x).toBe(before.x);
    expect(viewport.y).toBe(before.y);
  });

  it('respects the existing viewport clamp when panning past the map edge', () => {
    const viewport = buildViewport();

    applyPan(viewport, { x: -1, y: -1 }, 100000, 1);

    expect(viewport.left).toBe(0);
    expect(viewport.top).toBe(0);
  });
});
