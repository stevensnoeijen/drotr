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
  /** Whether shift was held on pointerup — toggles into the selection instead of replacing it. */
  shiftKey: boolean;
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
    this.queue.push({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      shiftKey: event.shiftKey,
    });
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
 * Finds the nearest `selectable` unit whose square bounding box (position
 * +/- `renderable.size` on each axis) contains `worldPosition`, or undefined
 * if no unit is hit.
 */
export function findUnitAt(
  queries: Queries,
  worldPosition: Vector2
): Entity | undefined {
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

  return nearest;
}

/**
 * Finds the nearest `hoverable` unit whose square bounding box (position
 * +/- `renderable.size` on each axis) contains `worldPosition`, or undefined
 * if no unit is hit. Similar to {@link findUnitAt} but includes all hoverable
 * units regardless of team (for debug tooltips).
 */
export function findHoverableUnitAt(
  queries: Queries,
  worldPosition: Vector2
): Entity | undefined {
  let nearest: Entity | undefined;
  let nearestDistance = Infinity;

  for (const entity of queries.hoverable) {
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

  return nearest;
}

/**
 * Selects the nearest `selectable` unit whose square bounding box (position
 * +/- `renderable.size` on each axis) contains `worldPosition`.
 *
 * Plain click: replaces the selection with just the hit unit, or clears it
 * entirely on a miss (clicking empty ground).
 *
 * Shift-click: adds the hit unit to the existing selection instead of
 * replacing it, or toggles it off if it was already selected. A shift-click
 * miss leaves the existing selection untouched.
 */
export function selectAt(
  world: World<Entity>,
  queries: Queries,
  worldPosition: Vector2,
  shiftKey = false
): void {
  const nearest = findUnitAt(queries, worldPosition);

  if (shiftKey) {
    if (nearest) {
      if (nearest.selected) {
        world.removeComponent(nearest, 'selected');
      } else {
        world.addComponent(nearest, 'selected', true);
      }
    }
    return;
  }

  for (const entity of [...queries.selected]) {
    if (entity !== nearest) {
      world.removeComponent(entity, 'selected');
    }
  }
  if (nearest && !nearest.selected) {
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
      selectAt(world, queries, screenToWorld(click, viewport), click.shiftKey);
    }
  };
}
