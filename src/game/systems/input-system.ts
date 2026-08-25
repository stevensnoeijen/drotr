import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/types';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { screenToWorld, type ViewportTransform } from '~/lib/grid';
import { Vector2 } from '~/lib/math/Vector2';
import type { Point } from '~/lib/math/types';

/** A queued, screen-space (canvas-relative) click ready to be hit-tested. */
export interface QueuedClick {
  x: number;
  y: number;
}

/**
 * Largest pointerdown-to-pointerup movement, in screen pixels, still treated
 * as a click rather than the start of a drag/pan gesture. Above this, the
 * gesture is assumed to be panning (handled by pixi-viewport itself) and no
 * click is queued.
 */
export const CLICK_MOVE_THRESHOLD = 6;

/**
 * Attaches pointer listeners to the Pixi canvas and buffers clicks
 * (pointerdown followed by a pointerup close enough to count as a tap, not a
 * drag) into a queue. Nothing here touches the ECS — {@link createInputSystem}
 * drains the queue once per fixed step and does the actual hit-testing, so
 * the queue is the only state shared between the DOM's event cadence and the
 * simulation's fixed-step cadence.
 */
export class InputSystem {
  private queue: QueuedClick[] = [];
  private downPosition: Point | undefined;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.downPosition = { x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const down = this.downPosition;
    this.downPosition = undefined;
    if (!down) {
      return;
    }

    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    this.queue.push({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    // Listened on window rather than the canvas: a drag that ends with the
    // pointer outside the canvas (or a pan that momentarily leaves it under
    // a fast gesture) must still clear `downPosition`, or a later unrelated
    // click could be measured against a stale start point.
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  /** Removes every queued click and returns them, oldest first. */
  public drain(): QueuedClick[] {
    const events = this.queue;
    this.queue = [];
    return events;
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.queue = [];
    this.downPosition = undefined;
  }
}

/**
 * Selects the nearest `selectable` unit whose square bounding box (position
 * +/- `renderable.size` on each axis) contains `worldPosition`, clearing any
 * previous selection first. Clicking empty ground (no unit hit) still clears
 * the previous selection, leaving nothing selected — this is the single
 * place selection state changes.
 */
export function selectAt(world: World<Entity>, queries: Queries, worldPosition: Vector2): void {
  let nearest: Entity | undefined;
  let nearestDistance = Infinity;

  for (const entity of queries.selectable) {
    const size = entity.renderable?.size ?? 0;
    const position = new Vector2(entity.transform.position.x, entity.transform.position.y);
    const dx = Math.abs(worldPosition.x - position.x);
    const dy = Math.abs(worldPosition.y - position.y);
    if (dx > size || dy > size) {
      continue;
    }
    const distance = Vector2.distance(position, worldPosition);
    if (distance < nearestDistance) {
      nearest = entity;
      nearestDistance = distance;
    }
  }

  for (const entity of [...queries.selected]) {
    world.removeComponent(entity, 'selected');
  }
  if (nearest) {
    world.addComponent(nearest, 'selected', true);
  }
}

/**
 * Builds the fixed-step {@link System} that drains `input`'s queued clicks,
 * converts each from screen to world space via the live viewport transform,
 * and hit-tests it against selectable units.
 */
export function createInputSystem(
  input: InputSystem,
  queries: Queries,
  getViewport: () => ViewportTransform
): System {
  return (world) => {
    const clicks = input.drain();
    if (clicks.length === 0) {
      return;
    }

    const viewport = getViewport();
    for (const click of clicks) {
      selectAt(world, queries, screenToWorld(click, viewport));
    }
  };
}
