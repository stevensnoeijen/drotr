import { Graphics } from 'pixi.js';

import type { Entity, Team } from '~/game/ecs/types';
import { findEntityById } from '~/game/ecs/world';

/** Per-team colour for a unit's target line, matching its own fill colour. */
const TEAM_LINE_COLOR: Record<Team, number> = {
  blue: 0x66ccff,
  red: 0xff6b6b,
};

/** Radius, in world units, of the dot drawn at the origin unit. */
const DOT_RADIUS = 4;

/** Stroke width, in world units, of the line and arrow head. */
const LINE_WIDTH = 2;

/** Length, in world units, of each arrow head stroke. */
const ARROW_HEAD_LENGTH = 10;

/** Half-angle, in radians, between the arrow head's two strokes and the shaft. */
const ARROW_HEAD_ANGLE = Math.PI / 7;

/** Length, in world units, of each dash (and the gap between dashes) in the shaft. */
const DASH_LENGTH = 6;

/**
 * Draws a dashed line from `from` to `to` — so overlapping target lines
 * (e.g. several units aiming at the same spot) stay visually distinguishable
 * instead of merging into one solid stroke.
 *
 * `phaseOffset` shifts where the dash pattern starts along the line, in
 * world units. Two lines that run along (near enough) the same path would
 * otherwise draw identical dashes on top of each other and still look like
 * one solid line; giving each origin a different offset (derived from its
 * entity id) staggers the dashes so both lines' segments remain visible.
 */
function drawDashedLine(
  graphics: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
  phaseOffset: number
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return;
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const period = DASH_LENGTH * 2;
  const offset = ((phaseOffset % period) + period) % period;

  for (let start = -offset; start < distance; start += period) {
    const dashStart = Math.max(start, 0);
    const dashEnd = Math.min(start + DASH_LENGTH, distance);
    if (dashEnd <= dashStart) {
      continue;
    }
    graphics
      .moveTo(from.x + ux * dashStart, from.y + uy * dashStart)
      .lineTo(from.x + ux * dashEnd, from.y + uy * dashEnd);
  }
  graphics.stroke({ width: LINE_WIDTH, color });
}

function drawArrowHead(
  graphics: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const leftAngle = angle + Math.PI - ARROW_HEAD_ANGLE;
  const rightAngle = angle + Math.PI + ARROW_HEAD_ANGLE;

  graphics
    .moveTo(to.x, to.y)
    .lineTo(
      to.x + Math.cos(leftAngle) * ARROW_HEAD_LENGTH,
      to.y + Math.sin(leftAngle) * ARROW_HEAD_LENGTH
    )
    .moveTo(to.x, to.y)
    .lineTo(
      to.x + Math.cos(rightAngle) * ARROW_HEAD_LENGTH,
      to.y + Math.sin(rightAngle) * ARROW_HEAD_LENGTH
    )
    .stroke({ width: LINE_WIDTH, color });
}

/**
 * Redraws `graphics` from scratch (`?debug=targets`) with one dot-and-arrow
 * per entity in `entities` that currently has a `target`: a dot at the
 * origin unit's position, and an arrow from the dot to the target's
 * position, coloured by the *origin* unit's team — so a blue unit's line is
 * always blue even when it points at a red target, and vice versa.
 *
 * `entities` doubles as both the set of possible origins and the pool a
 * `target.entityId` is resolved against (typically `queries.combatants`,
 * since only a `queries.targeting` entity — a subset of it — ever has a
 * `target`); a target outside this pool (or already removed from the world)
 * is silently skipped rather than throwing.
 */
export function drawTargetLines(graphics: Graphics, entities: Iterable<Entity>): void {
  graphics.clear();

  const pool = [...entities];
  for (const origin of pool) {
    if (!origin.target || !origin.transform || !origin.team) {
      continue;
    }

    const targetEntity = findEntityById(pool, origin.target.entityId);
    if (!targetEntity?.transform) {
      continue;
    }

    const color = TEAM_LINE_COLOR[origin.team];
    const from = origin.transform.position;
    const to = targetEntity.transform.position;

    const phaseOffset = (origin.id ?? 0) * DASH_LENGTH;

    graphics.circle(from.x, from.y, DOT_RADIUS).fill(color);
    drawDashedLine(graphics, from, to, color, phaseOffset);
    drawArrowHead(graphics, from, to, color);
  }
}
