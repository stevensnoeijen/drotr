import { Graphics } from 'pixi.js';

import type { Entity } from '~/game/ecs/entity';
import { planMoveOrder } from '~/game/navigation/move-order';
import type { GridLike } from '~/lib/navigation/astar';
import type { Point } from '~/lib/math/types';

/** Colour of a unit's move-order line, drawn regardless of team — pink marks it as a debug overlay. */
const LINE_COLOR = 0xff69b4;

/** Stroke width, in world units, of the line. */
const LINE_WIDTH = 2;

/** Radius, in world units, of the dot drawn at the destination. */
const DOT_RADIUS = 4;

/** Radius, in world units, of the dot drawn at each intermediate waypoint. */
const WAYPOINT_RADIUS = 2;

/**
 * The points an entity is still headed for, nearest first: the leg it is
 * currently walking (`moveTarget`) followed by whatever remains of its
 * routed `movePath`. Empty when the entity has no order at all.
 *
 * `movePath.index` is the *next* waypoint to be handed to `moveTarget`, so
 * the two never overlap — the current leg is already `index - 1`.
 *
 * When the entity also has a `pendingMoveOrder` (a reroute issued
 * mid-transition and staged rather than applied immediately — see #178),
 * `entity.movePath`'s remaining waypoints are stale: they get discarded the
 * instant the pending order actually applies, once the in-flight leg
 * finishes. So instead of appending those, this previews the route the
 * pending order will actually produce — from `moveTarget.position` (the
 * exact, uninterruptible cell the unit is about to land on, not its live
 * interpolated position, which is still moving and would make the preview
 * flicker) to `pendingMoveOrder.destination` — via the same `planMoveOrder`
 * helper `PendingMoveOrderSystem` uses to apply it for real. The result is
 * one continuous preview: the in-flight step seamlessly continuing into the
 * routed road to the new destination, rather than two disjoint routes.
 *
 * Calling `planMoveOrder` (which can run A*) here means every draw frame
 * potentially replans for any entity with a pending order — acceptable
 * because `pendingMoveOrder` is short-lived and rare (cleared within ~1
 * tick once the current leg completes), not a steady per-frame cost across
 * the whole unit roster.
 */
function remainingWaypoints(entity: Entity, grid: GridLike | undefined): Point[] {
  const points: Point[] = [];

  if (entity.moveTarget) {
    points.push(entity.moveTarget.position);
  }

  if (entity.pendingMoveOrder) {
    if (entity.moveTarget) {
      const preview = planMoveOrder(grid, entity.moveTarget.position, entity.pendingMoveOrder.destination);
      switch (preview.kind) {
        case 'path':
          points.push(...preview.movePath.waypoints);
          break;
        case 'target':
          points.push(preview.moveTarget.position);
          break;
        case 'stop':
        case 'none':
          break;
      }
    }
  } else if (entity.movePath) {
    points.push(...entity.movePath.waypoints.slice(entity.movePath.index));
  }

  return points;
}

/**
 * Redraws `graphics` from scratch (`?debug=paths`) with one polyline per
 * entity in `entities` that currently has a move order: from the unit's
 * position through every waypoint it has left to walk, with a small dot on
 * each intermediate waypoint and a larger one at the final destination.
 *
 * This is what makes a route visible: right-clicking across a wall draws a
 * line that bends around it rather than straight through it. Drawn fresh
 * every call — like `drawTargetLines` — since the unit's own position moves
 * every frame, and the leading waypoint is consumed as it walks.
 *
 * A unit with a plain straight-line `moveTarget` and no route (a map with no
 * terrain to route around) draws exactly what it did before pathfinding: a
 * single segment to its destination.
 *
 * An entity with a `pendingMoveOrder` (a reroute issued mid-transition and
 * staged rather than applied — see #178) still gets exactly one line, not a
 * separate "committed" vs "pending" one: `remainingWaypoints` splices the
 * in-flight leg's exact destination together with a preview of the route
 * the pending order will actually produce, so the in-flight step reads as
 * continuing seamlessly into the routed road to the new destination. `grid`
 * is what makes that preview possible — see `remainingWaypoints`.
 */
export function drawMoveLines(graphics: Graphics, entities: Iterable<Entity>, grid?: GridLike): void {
  graphics.clear();

  for (const entity of entities) {
    if (!entity.transform) {
      continue;
    }

    const from = entity.transform.position;
    const waypoints = remainingWaypoints(entity, grid);

    if (waypoints.length === 0) {
      continue;
    }

    graphics.moveTo(from.x, from.y);
    for (const waypoint of waypoints) {
      graphics.lineTo(waypoint.x, waypoint.y);
    }
    graphics.stroke({ width: LINE_WIDTH, color: LINE_COLOR });

    for (let i = 0; i < waypoints.length - 1; i++) {
      graphics.circle(waypoints[i].x, waypoints[i].y, WAYPOINT_RADIUS).fill(LINE_COLOR);
    }

    const destination = waypoints[waypoints.length - 1];
    graphics.circle(destination.x, destination.y, DOT_RADIUS).fill(LINE_COLOR);
  }
}
