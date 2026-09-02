import { Graphics } from 'pixi.js';

import type { Entity } from '~/game/ecs/types';
import type { Point } from '~/lib/math/types';

/** Colour of a unit's move-order line, drawn regardless of team. */
const LINE_COLOR = 0xffffff;

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
 */
function remainingWaypoints(entity: Entity): Point[] {
  const points: Point[] = [];

  if (entity.moveTarget) {
    points.push(entity.moveTarget.position);
  }
  if (entity.movePath) {
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
 */
export function drawMoveLines(graphics: Graphics, entities: Iterable<Entity>): void {
  graphics.clear();

  for (const entity of entities) {
    if (!entity.transform) {
      continue;
    }

    const waypoints = remainingWaypoints(entity);
    if (waypoints.length === 0) {
      continue;
    }

    const from = entity.transform.position;
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
