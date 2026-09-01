import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';

/**
 * Feeds a routed order's waypoints to `MoveTargetSystem` one leg at a time:
 * whenever an entity has a `MovePath` but no `MoveTarget` — either because
 * the order was just issued, or because it reached the previous waypoint —
 * the next waypoint becomes the new `MoveTarget`. Once the last one is
 * consumed the `MovePath` is dropped, leaving the unit at rest.
 *
 * Splitting it this way keeps the two concerns separate: this system knows
 * about routes and nothing about steering; `MoveTargetSystem` knows about
 * steering toward a point and nothing about routes. It also means a
 * straight-line order (no collision data available for the map) is not a
 * special case anywhere — it is simply a `MoveTarget` with no `MovePath`
 * behind it.
 *
 * Must run *before* `MoveTargetSystem` in the fixed step, so a waypoint
 * handed over here is steered toward within the same tick rather than
 * costing an idle frame per leg.
 *
 * Components are assigned and deleted directly rather than through
 * `world.addComponent`/`removeComponent`, matching how `MoveTarget` is
 * already handled: no archetype query keys off `movePath`, so there is no
 * index for miniplex to keep in sync, and the per-tick add/remove churn of a
 * unit walking a route would be pure overhead.
 */
export function createMovePathSystem(queries: Queries): System {
  // Neither the world nor `dt` is needed: handing a waypoint over is a
  // discrete, time-independent step, and the components it touches are
  // reached straight off the entities the query already holds.
  return () => {
    for (const self of queries.movable) {
      const { movePath } = self;
      if (!movePath || self.moveTarget) {
        continue;
      }

      if (movePath.index >= movePath.waypoints.length) {
        delete self.movePath;
        continue;
      }

      const waypoint = movePath.waypoints[movePath.index];
      movePath.index += 1;
      self.moveTarget = { position: { x: waypoint.x, y: waypoint.y } };
    }
  };
}
