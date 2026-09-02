import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/types';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { planMovePath } from '~/game/navigation/plan-move-path';
import { screenToWorld, toWorldPositionCellCenter, type ViewportTransform } from '~/lib/grid';
import { Vector2 } from '~/lib/math/Vector2';
import type { GridLike } from '~/lib/navigation/astar';
import type { Point } from '~/lib/math/types';

/** A queued, screen-space (canvas-relative) click ready to be hit-tested. */
export interface QueuedClick {
  x: number;
  y: number;
  /** Whether shift was held on pointerup — toggles into the selection instead of replacing it. */
  shiftKey: boolean;
}

/** A queued, screen-space (canvas-relative) right-click ready to be hit-tested as a move order. */
export interface QueuedMoveOrder {
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
  private moveOrderQueue: QueuedMoveOrder[] = [];
  private downPosition: Point | undefined;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    // Only the primary (left) button starts a click/drag gesture; a
    // secondary (right) button press is handled entirely by
    // `handleContextMenu` below, so it must not also arm `downPosition` and
    // get treated as a left-click on the following `pointerup`.
    if (event.button !== 0) {
      return;
    }
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

  /**
   * `contextmenu` (rather than a right-button `pointerdown`/`pointerup`
   * pair) is the right event to key a move order off: it's what the browser
   * fires for a right-click, and calling `preventDefault()` on it is also
   * how the browser's own context menu is suppressed — see #146's "no
   * browser context menu" requirement. Queuing here means one right-click
   * reliably produces exactly one move order, with no drag-distance
   * gesture-detection needed the way left-click has.
   */
  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    this.moveOrderQueue.push({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    // Listened on window rather than the canvas: a drag that ends with the
    // pointer outside the canvas (or a pan that momentarily leaves it under
    // a fast gesture) must still clear `downPosition`, or a later unrelated
    // click could be measured against a stale start point.
    window.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  /** Removes every queued click and returns them, oldest first. */
  public drain(): QueuedClick[] {
    const events = this.queue;
    this.queue = [];
    return events;
  }

  /** Removes every queued right-click move order and returns them, oldest first. */
  public drainMoveOrders(): QueuedMoveOrder[] {
    const events = this.moveOrderQueue;
    this.moveOrderQueue = [];
    return events;
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.queue = [];
    this.moveOrderQueue = [];
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
 * Issues a move order to every currently selected unit, provided at least
 * one of them is on the blue team — mirroring the blue-only restriction on
 * selection itself (#87): the player never directs red units, so a
 * right-click with only red units selected (or nothing selected at all) is
 * a no-op rather than silently moving red units around.
 *
 * All selected units receive the same destination, not one each spread out
 * — formation-based group orders are a later ticket (#89); for now every
 * selected unit heads for the same cell.
 *
 * With a `grid` (the loaded map's collision data), each unit gets its own
 * route around terrain, planned from where *it* stands — a `MovePath` whose
 * waypoints `MovePathSystem` then walks. A destination the unit cannot reach
 * leaves it exactly as it was: an order that can't be carried out is refused
 * outright rather than half-applied as a walk toward a wall it can't get
 * past. Ordering a unit to the cell it already stands in stops it, which is
 * how a player cancels a walk in progress.
 *
 * Without a grid — a map with no terrain at all — the order stays what it
 * was before pathfinding existed: a single straight-line `MoveTarget` to the
 * clicked cell's centre (see {@link toWorldPositionCellCenter}). There is no
 * terrain to route around, so there is nothing for A* to add.
 *
 * Either way an accepted order replaces the previous one outright, so a
 * second right-click never leaves a stale route behind for the unit to
 * resume.
 */
export function moveSelectedTo(
  queries: Queries,
  worldPosition: Vector2,
  grid?: GridLike
): void {
  const selected = [...queries.selected];
  const hasBlueUnit = selected.some((entity) => entity.team === 'blue');
  if (!hasBlueUnit) {
    return;
  }

  const destination = toWorldPositionCellCenter(worldPosition);

  for (const entity of selected) {
    if (entity.team !== 'blue' || !entity.transform) {
      continue;
    }

    if (!grid) {
      delete entity.movePath;
      entity.moveTarget = { position: { x: destination.x, y: destination.y } };
      continue;
    }

    const { status, waypoints } = planMovePath(
      grid,
      entity.transform.position,
      destination
    );
    if (status !== 'found') {
      continue;
    }

    delete entity.moveTarget;
    if (waypoints.length === 0) {
      // Ordered to the cell it is already standing in: nothing to walk, so
      // the order reads as "stop here" rather than "carry on with whatever
      // you were doing". Velocity has to be zeroed explicitly — nothing else
      // will, since `MoveVelocitySystem` integrates whatever it finds and
      // `MoveTargetSystem` only zeroes on arrival at a target that no longer
      // exists.
      delete entity.movePath;
      if (entity.velocity) {
        entity.velocity.x = 0;
        entity.velocity.y = 0;
      }
      continue;
    }

    entity.movePath = { waypoints, index: 0 };
  }
}

/**
 * Builds the fixed-step {@link System} that drains `input`'s queued clicks
 * and right-click move orders, converts each from screen to world space via
 * the live viewport transform, and applies them: clicks hit-test against
 * selectable units, move orders are issued to the current selection.
 *
 * `grid` is the loaded map's collision data, used to route move orders
 * around terrain; omit it for a map with no terrain, and orders fall back to
 * straight lines (see {@link moveSelectedTo}).
 */
export function createInputSystem(
  input: InputSystem,
  queries: Queries,
  getViewport: () => ViewportTransform,
  grid?: GridLike
): System {
  return (world) => {
    const clicks = input.drain();
    const moveOrders = input.drainMoveOrders();

    if (clicks.length > 0) {
      const viewport = getViewport();
      for (const click of clicks) {
        selectAt(world, queries, screenToWorld(click, viewport), click.shiftKey);
      }
    }

    if (moveOrders.length > 0) {
      const viewport = getViewport();
      for (const order of moveOrders) {
        moveSelectedTo(queries, screenToWorld(order, viewport), grid);
      }
    }
  };
}
