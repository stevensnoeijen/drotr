import type { Point } from '~/lib/math/types';

/**
 * The single leg a unit is currently walking: one world-space point it heads
 * straight for, driven by `~/game/systems/move-target-system` and removed
 * once the unit arrives.
 *
 * Still deliberately just a point. A routed order is a `MovePath`,
 * and `~/game/systems/move-path-system` feeds its waypoints through here one
 * at a time — so "walk straight at a point" stays one system with one
 * responsibility, and a unit with no route (a straight-line order on a map
 * with no collision data) needs no special case.
 */
export interface MoveTarget {
  position: Point;
}
