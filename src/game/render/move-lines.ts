import { Graphics } from 'pixi.js';

import type { Entity } from '~/game/ecs/types';

/** Colour of a unit's move-order line, drawn regardless of team. */
const LINE_COLOR = 0xffffff;

/** Stroke width, in world units, of the line. */
const LINE_WIDTH = 2;

/** Radius, in world units, of the dot drawn at the destination. */
const DOT_RADIUS = 4;

/**
 * Redraws `graphics` from scratch (`?debug=paths`) with one line per entity
 * in `entities` that currently has a `moveTarget`: a line from the unit's
 * current position to its ordered destination, with a small dot marking the
 * destination itself. Drawn fresh every call — like `drawTargetLines` — since
 * both the unit's position and (once #88 lands) the destination polyline
 * move over time.
 *
 * This is deliberately the straight-line predecessor of #88's waypoint-
 * polyline debug rendering: same flag, same "line to where a unit is
 * headed" idea, just one straight segment instead of a routed polyline.
 */
export function drawMoveLines(graphics: Graphics, entities: Iterable<Entity>): void {
  graphics.clear();

  for (const entity of entities) {
    if (!entity.moveTarget || !entity.transform) {
      continue;
    }

    const from = entity.transform.position;
    const to = entity.moveTarget.position;

    graphics
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width: LINE_WIDTH, color: LINE_COLOR });
    graphics.circle(to.x, to.y, DOT_RADIUS).fill(LINE_COLOR);
  }
}
