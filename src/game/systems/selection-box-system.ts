import type { World } from 'miniplex';
import { Container, Graphics } from 'pixi.js';

import type { Entity } from '~/game/ecs/types';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { screenToWorld, type ViewportTransform } from '~/lib/grid';
import type { Point } from '~/lib/math/types';
import { CLICK_MOVE_THRESHOLD } from './input-system';

/** A queued, screen-space (canvas-relative) drag-select box ready to be hit-tested. */
export interface QueuedBox {
  topLeft: Point;
  bottomRight: Point;
  /** Whether shift was held on release — unions with the existing selection instead of replacing it. */
  shiftKey: boolean;
}

const STROKE_COLOR = 0xffffff;
const STROKE_WIDTH = 1;
const SHADOW_COLOR = 0x000000;
const SHADOW_ALPHA = 0.6;
const SHADOW_OFFSET = 1;

/**
 * Attaches pointer listeners to the Pixi canvas, draws a screen-space
 * drag-select rectangle (an unfilled white outline with a drop shadow behind
 * the line, so it reads over any terrain) into `overlay` while the drag is
 * in progress, and buffers the
 * finished box — once it clears {@link CLICK_MOVE_THRESHOLD} — into a queue.
 * Mirrors {@link InputSystem}: this class only owns DOM listeners and
 * drawing, {@link createSelectionBoxSystem} does the ECS hit-testing once per
 * fixed step.
 */
export class SelectionBoxDrag {
  private readonly graphics = new Graphics();
  private startScreen: Point | undefined;
  private lastScreen: Point | undefined;
  private queue: QueuedBox[] = [];

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.startScreen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.lastScreen = this.startScreen;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.startScreen) {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    this.lastScreen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.redraw();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.startScreen;
    const last = this.lastScreen;
    this.startScreen = undefined;
    this.lastScreen = undefined;
    this.graphics.clear();

    if (!start || !last || !this.isPastThreshold(start, last)) {
      // Below-threshold drags are treated as clicks, handled by InputSystem.
      return;
    }

    this.queue.push({
      topLeft: { x: Math.min(start.x, last.x), y: Math.min(start.y, last.y) },
      bottomRight: { x: Math.max(start.x, last.x), y: Math.max(start.y, last.y) },
      shiftKey: event.shiftKey,
    });
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    overlay: Container
  ) {
    overlay.addChild(this.graphics);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    // Listened on window, like InputSystem: a drag that ends (or continues)
    // outside the canvas must still be tracked and resolved.
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  /** True while a drag past the click threshold is in progress. */
  public get isActive(): boolean {
    return (
      this.startScreen !== undefined &&
      this.lastScreen !== undefined &&
      this.isPastThreshold(this.startScreen, this.lastScreen)
    );
  }

  private isPastThreshold(a: Point, b: Point): boolean {
    return Math.hypot(b.x - a.x, b.y - a.y) > CLICK_MOVE_THRESHOLD;
  }

  private redraw(): void {
    this.graphics.clear();
    if (!this.startScreen || !this.lastScreen || !this.isActive) {
      return;
    }

    const x = Math.min(this.startScreen.x, this.lastScreen.x);
    const y = Math.min(this.startScreen.y, this.lastScreen.y);
    const width = Math.abs(this.lastScreen.x - this.startScreen.x);
    const height = Math.abs(this.lastScreen.y - this.startScreen.y);

    this.graphics
      .rect(x + SHADOW_OFFSET, y + SHADOW_OFFSET, width, height)
      .stroke({ width: STROKE_WIDTH, color: SHADOW_COLOR, alpha: SHADOW_ALPHA })
      .rect(x, y, width, height)
      .stroke({ width: STROKE_WIDTH, color: STROKE_COLOR, alpha: 0.9 });
  }

  /** Removes every queued box and returns them, oldest first. */
  public drain(): QueuedBox[] {
    const events = this.queue;
    this.queue = [];
    return events;
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.graphics.destroy();
    this.queue = [];
    this.startScreen = undefined;
    this.lastScreen = undefined;
  }
}

/**
 * Selects every `blue`-team unit whose square bounding box (position +/-
 * `renderable.size`) overlaps the world-space box `[topLeft, bottomRight]` —
 * an AABB-vs-AABB overlap test, so units only partially inside the box are
 * still included. Red-team units are never selectable, even fully inside
 * the box.
 *
 * Shift held: unions the hits into the existing selection. Otherwise:
 * replaces the selection with exactly the hits (a box with no hits clears
 * the existing selection, matching a plain click on empty ground).
 */
export function selectInBox(
  world: World<Entity>,
  queries: Queries,
  topLeft: Point,
  bottomRight: Point,
  shiftKey = false
): void {
  const hits = new Set<Entity>();
  for (const entity of queries.selectable) {
    if (entity.team !== 'blue') {
      continue;
    }
    const size = entity.renderable?.size ?? 0;
    const { x, y } = entity.transform.position;
    const overlaps =
      x - size <= bottomRight.x &&
      x + size >= topLeft.x &&
      y - size <= bottomRight.y &&
      y + size >= topLeft.y;
    if (overlaps) {
      hits.add(entity);
    }
  }

  if (shiftKey) {
    for (const entity of hits) {
      if (!entity.selected) {
        world.addComponent(entity, 'selected', true);
      }
    }
    return;
  }

  for (const entity of [...queries.selected]) {
    if (!hits.has(entity)) {
      world.removeComponent(entity, 'selected');
    }
  }
  for (const entity of hits) {
    if (!entity.selected) {
      world.addComponent(entity, 'selected', true);
    }
  }
}

/**
 * Builds the fixed-step {@link System} that drains `drag`'s queued boxes,
 * converts each corner from screen to world space via the live viewport
 * transform, and hit-tests it against selectable units.
 */
export function createSelectionBoxSystem(
  drag: SelectionBoxDrag,
  queries: Queries,
  getViewport: () => ViewportTransform
): System {
  return (world) => {
    const boxes = drag.drain();
    if (boxes.length === 0) {
      return;
    }

    const viewport = getViewport();
    for (const box of boxes) {
      const topLeft = screenToWorld(box.topLeft, viewport);
      const bottomRight = screenToWorld(box.bottomRight, viewport);
      selectInBox(world, queries, topLeft, bottomRight, box.shiftKey);
    }
  };
}
