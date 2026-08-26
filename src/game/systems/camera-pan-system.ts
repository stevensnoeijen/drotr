import type { Viewport } from 'pixi-viewport';

import type { Point } from '~/lib/math/types';

/** Camera pan speed, in screen pixels per second at any zoom level. */
export const PAN_SPEED = 480;

/** Distance, in screen pixels, from the canvas edge that triggers edge panning. */
export const EDGE_PAN_MARGIN = 24;

export interface PanKeys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const ARROW_KEY_DIRECTION: Partial<Record<string, keyof PanKeys>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * Combines held arrow keys with the pointer's proximity to the canvas edge
 * into a single pan direction, each axis clamped to [-1, 1] so pushing both
 * a key and the matching edge doesn't pan faster than either alone. `pointer`
 * is canvas-relative screen space; omit it (e.g. the pointer has left the
 * canvas) to skip edge panning entirely.
 */
export function computePanDirection(
  keys: PanKeys,
  pointer: Point | undefined,
  canvasWidth: number,
  canvasHeight: number,
  edgeMargin = EDGE_PAN_MARGIN
): Point {
  let x = 0;
  let y = 0;

  if (keys.left) x -= 1;
  if (keys.right) x += 1;
  if (keys.up) y -= 1;
  if (keys.down) y += 1;

  if (pointer) {
    if (pointer.x <= edgeMargin) x -= 1;
    else if (pointer.x >= canvasWidth - edgeMargin) x += 1;
    if (pointer.y <= edgeMargin) y -= 1;
    else if (pointer.y >= canvasHeight - edgeMargin) y += 1;
  }

  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}

/**
 * Pans `viewport` by `direction` (normalized so diagonal panning isn't
 * faster than axis-aligned) at `speed` screen pixels/second, then re-runs
 * the viewport's own clamp plugin so panning still respects the existing
 * bounds — the same API `viewport.drag()` relies on to stay in bounds.
 */
export function applyPan(viewport: Viewport, direction: Point, speed: number, dt: number): void {
  if (direction.x === 0 && direction.y === 0) {
    return;
  }

  const length = Math.hypot(direction.x, direction.y);
  viewport.x -= (direction.x / length) * speed * dt;
  viewport.y -= (direction.y / length) * speed * dt;
  viewport.plugins.get('clamp')?.update();
}

/**
 * Owns the DOM listeners for keyboard and edge-of-screen camera panning:
 * held arrow keys, plus the pointer's position relative to the canvas
 * (tracked independently of any selection-box drag in progress, so edge
 * panning still fires while one is active). Call {@link update} once per
 * rendered frame to apply the pan.
 */
export class CameraPanSystem {
  private readonly keys: PanKeys = { up: false, down: false, left: false, right: false };
  private pointer: Point | undefined;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const direction = ARROW_KEY_DIRECTION[event.key];
    if (direction) {
      this.keys[direction] = true;
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const direction = ARROW_KEY_DIRECTION[event.key];
    if (direction) {
      this.keys[direction] = false;
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  private readonly handlePointerLeave = (): void => {
    this.pointer = undefined;
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    // Window rather than the canvas: the pointer position must keep updating
    // during a selection-box drag, which pixi-viewport-style drags can carry
    // outside the canvas bounds momentarily.
    window.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
  }

  public update(viewport: Viewport, dt: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const direction = computePanDirection(this.keys, this.pointer, rect.width, rect.height);
    applyPan(viewport, direction, PAN_SPEED, dt);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.keys.up = false;
    this.keys.down = false;
    this.keys.left = false;
    this.keys.right = false;
    this.pointer = undefined;
  }
}
