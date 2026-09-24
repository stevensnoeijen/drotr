import type { With, World } from 'miniplex';

import { cancelAttackOrder, issueAttackOrder } from '~/game/combat/attack-order';
import type { Team } from '~/game/ecs/components';
import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { applyMoveOrder, planMoveOrder } from '~/game/navigation/move-order';
import {
  findNearestAvailableCell,
  NO_CELL,
  NO_OCCUPANT,
  type OccupancyGrid,
} from '~/game/navigation/occupancy-grid';
import {
  CELL_SIZE,
  screenToWorld,
  toWorldPositionCellCenter,
  type ViewportTransform,
} from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
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
   * how the browser's own context menu is suppressed. Queuing here means one right-click
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
 * The team the player commands. Selection, move orders and attack
 * orders are all restricted to it; red is the opposing side, which the player
 * may click *at* (as an attack target) but never *with*.
 */
export const PLAYER_TEAM: Team = 'blue';

/**
 * The nearest of `entities` whose square bounding box (position +/-
 * `renderable.size` on each axis) contains `worldPosition`, or undefined if
 * none does.
 *
 * The one hit test behind every pointer query in this module — which unit
 * did the player click? — with the candidate pool (selectable, hoverable,
 * enemy) left entirely to the caller, so the pools can never drift apart in
 * *how* a hit is decided, only in what may be hit.
 */
function findNearestUnitAt<T extends With<Entity, 'transform'>>(
  entities: Iterable<T>,
  worldPosition: Vector2
): T | undefined {
  let nearest: T | undefined;
  let nearestDistance = Infinity;

  for (const entity of entities) {
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
 * Finds the nearest `selectable` unit hit by `worldPosition` — the player's
 * own units only, since that is all `selectable` ever holds (see `spawnUnit`).
 * Dead units (marked `dead` by `DeathSystem`, whose corpse lingers in the
 * world — and in `queries.selectable` — for its removal delay) are
 * skipped: a corpse can still be seen and rendered, but it should never be
 * selectable again.
 */
export function findUnitAt(
  queries: Queries,
  worldPosition: Vector2
): Entity | undefined {
  const alive = [...queries.selectable].filter((entity) => !entity.dead);
  return findNearestUnitAt(alive, worldPosition);
}

/**
 * Finds the nearest `hoverable` unit hit by `worldPosition`. Like
 * {@link findUnitAt} but team-unrestricted (for debug tooltips).
 */
export function findHoverableUnitAt(
  queries: Queries,
  worldPosition: Vector2
): Entity | undefined {
  return findNearestUnitAt(queries.hoverable, worldPosition);
}

/**
 * Finds the nearest live unit hit by `worldPosition` that is *not* on `team`
 * — the hit test behind a right-click attack order.
 *
 * Deliberately not built on `selectable` (the player's own team only) or
 * `hoverable` (a debug-tooltip concern that happens to include every unit):
 * it asks `combatants` for exactly what an attack order needs — something
 * with a team, on the other side, still alive, and carrying an `id` for
 * `Target` to reference. A corpse awaiting cleanup is not a valid order, so
 * clicking one falls through to an ordinary move order rather than sending
 * the selection off to fight it.
 */
export function findEnemyUnitAt(
  queries: Queries,
  worldPosition: Vector2,
  team: Team = PLAYER_TEAM
): Entity | undefined {
  const enemies = [...queries.combatants].filter(
    (entity) => entity.team !== team && entity.health.current > 0 && entity.id !== undefined
  );

  return findNearestUnitAt(enemies, worldPosition);
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
 * selection itself: the player never directs red units, so a
 * right-click with only red units selected (or nothing selected at all) is
 * a no-op rather than silently moving red units around.
 *
 * With an `occupancy` grid, no two units are ever sent to the same cell: the
 * clicked cell goes to the first unit that can have it, and everyone else is
 * relocated to the nearest cell that is walkable, unclaimed, and not already
 * handed out earlier in this same batch (see {@link findNearestAvailableCell}).
 * Cells occupied by units *outside* the selection are excluded too, which is
 * conservative — the occupier may itself be about to walk away — but it makes
 * a group order fan out around the click instead of resolving into a shoving
 * match at the destination. This is destination *deconfliction*, not
 * formations: the shape a group settles into is whatever the ring search
 * finds, and real formation-based group orders remain a later effort.
 * Without an occupancy grid every selected unit heads for the same cell, as
 * before.
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
 *
 * A unit already mid-transition between two cells (`MoveTarget` set, still
 * walking toward it) never has that redirected immediately — movement is
 * only ever an atomic step from one cell to an adjacent one in one of the 8
 * allowed directions, and swapping the target mid-step would send it
 * off at whatever arbitrary angle its current position happens to be from
 * the new destination. Instead just the `destination` is staged as a
 * `PendingMoveOrder`, which `PendingMoveOrderSystem` plans and applies once
 * the unit actually finishes that step — deliberately *not* planned here:
 * `entity.transform.position` right now is still interpolating mid-cell, so
 * routing from it immediately can round to the cell the unit is leaving
 * rather than the one it's about to arrive in (see `PendingMoveOrder`). A
 * unit that isn't mid-transition (already at rest, or exactly at a cell
 * boundary with no `MoveTarget`) still gets its order planned and applied
 * immediately, same as before.
 */
export function moveSelectedTo(
  queries: Queries,
  worldPosition: Vector2,
  grid?: GridLike,
  occupancy?: OccupancyGrid
): void {
  const selected = [...queries.selected];
  const hasBlueUnit = selected.some((entity) => entity.team === PLAYER_TEAM);
  if (!hasBlueUnit) {
    return;
  }

  const clicked = toWorldPositionCellCenter(worldPosition, CELL_SIZE);
  /** Destination cells already handed out within this one order. */
  const assigned = new Set<number>();

  for (const entity of selected) {
    if (entity.team !== PLAYER_TEAM || !entity.transform) {
      continue;
    }

    let destination: Point = { x: clicked.x, y: clicked.y };
    if (occupancy) {
      const cell = findNearestAvailableCell(
        occupancy,
        occupancy.indexAt(destination),
        entity.cellOccupancy?.occupantId ?? NO_OCCUPANT,
        assigned
      );
      if (cell === NO_CELL) {
        // Nowhere within the search radius for this unit to stand. Refusing
        // outright beats sending it to a cell it would only be turned away
        // from on arrival.
        continue;
      }
      assigned.add(cell);
      destination = occupancy.centreOf(cell);
    }

    if (entity.moveTarget) {
      // Mid-transition: stage just the destination rather than planning and
      // redirecting now — see the doc comment above. A later order staged
      // this same tick simply overwrites an earlier one, since only the
      // most recent order should take effect once the unit is free to
      // receive it.
      //
      // Any standing attack order gives way immediately, though, rather than
      // when the staged order lands: a `Pursuit` left alive here would have
      // `SeekSystem` go on replanning and re-filling `MoveTarget` for the old
      // target, and `PendingMoveOrderSystem` — which waits for `MoveTarget`
      // to clear — might then never get its turn at all.
      cancelAttackOrder(entity);
      entity.pendingMoveOrder = { destination };
      continue;
    }

    delete entity.pendingMoveOrder;
    const result = planMoveOrder(grid, entity.transform.position, destination);
    applyMoveOrder(entity, result);
  }
}

/**
 * Orders every selected unit on the player's team to attack one specific
 * enemy unit — a right-click that landed on an enemy rather than on ground.
 *
 * Restricted to the player's own team on exactly the same terms as
 * {@link moveSelectedTo}: the player never directs red units, so a
 * right-click with only red units selected (or nothing selected) is a no-op
 * rather than silently sending red units to fight each other.
 *
 * Unlike a move order, no destination is computed and no cell is
 * deconflicted: each unit is given the target and left to `SeekSystem` to
 * reach it, routing around whatever terrain is in the way and closing to
 * attack range on its own. Where several units get the same order they
 * converge on the same enemy and `CellOccupancySystem` sorts out who ends up
 * standing where, which is the melee equivalent of the destination
 * deconfliction a move order does up front. Group *formation* remains a later effort.
 *
 * The order is sticky — see {@link issueAttackOrder}.
 */
export function attackSelectedTarget(queries: Queries, enemy: Entity): void {
  const targetId = enemy.id;
  if (targetId === undefined) {
    return;
  }

  const selected = [...queries.selected];
  if (!selected.some((entity) => entity.team === PLAYER_TEAM)) {
    return;
  }

  for (const entity of selected) {
    // The team check also rules out ordering a unit to attack itself: the
    // clicked unit is by definition not on the player's team.
    if (entity.team !== PLAYER_TEAM) {
      continue;
    }
    issueAttackOrder(entity, targetId);
  }
}

/**
 * Builds the fixed-step {@link System} that drains `input`'s queued clicks
 * and right-click move orders, converts each from screen to world space via
 * the live viewport transform, and applies them: clicks hit-test against
 * selectable units, move orders are issued to the current selection.
 *
 * A right-click is one gesture with two meanings, decided by what it lands
 * on: an enemy unit makes it an attack order against that unit specifically
 * ({@link attackSelectedTarget}), anything else — empty ground, terrain, one
 * of the player's own units — makes it a move order ({@link moveSelectedTo}),
 * as it always was.
 *
 * `grid` is the loaded map's collision data, used to route move orders
 * around terrain; omit it for a map with no terrain, and orders fall back to
 * straight lines (see {@link moveSelectedTo}). `occupancy` is the live
 * unit-occupancy layer over that same grid, used to give each unit in a
 * group order a destination cell of its own; omit it and they all share one.
 */
export function createInputSystem(
  input: InputSystem,
  queries: Queries,
  getViewport: () => ViewportTransform,
  grid?: GridLike,
  occupancy?: OccupancyGrid
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
        const worldPosition = screenToWorld(order, viewport);
        const enemy = findEnemyUnitAt(queries, worldPosition);
        if (enemy) {
          attackSelectedTarget(queries, enemy);
        } else {
          moveSelectedTo(queries, worldPosition, grid, occupancy);
        }
      }
    }
  };
}
