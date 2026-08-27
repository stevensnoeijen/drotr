import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/types';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { CELL_SIZE } from '~/lib/grid';

/**
 * Seconds between periodic perception scans. An O(n²) linear nearest-enemy
 * scan doesn't need per-frame precision at this unit-count scale — see
 * ticket #94 — so it runs on a timer rather than every fixed step. Swap in a
 * `SpatialHash`-backed scan (#91) once unit counts grow enough for the O(n²)
 * cost to matter; this system's public shape shouldn't need to change when
 * that happens.
 */
export const PERCEPTION_INTERVAL = 1;

/**
 * Runs a single nearest-enemy scan over every entity in `queries.targeting`,
 * setting or clearing its `target` component. For each attacker, the
 * candidate pool is `queries.combatants` filtered to a different team and
 * still alive (`health.current > 0`); the closest such candidate within the
 * attacker's `attackRange` (converted from grid cells to world units) wins.
 *
 * Re-picks from scratch every call rather than validating the existing
 * target first: a dead or out-of-range target is naturally dropped (no
 * candidate matches it, or it's simply not nearest), and a same-team entity
 * is never a candidate at all, so friendly fire targeting is unrepresentable
 * regardless of scan order. No separate "clear" pass is needed.
 *
 * Exported (as opposed to only wiring it into {@link createPerceptionSystem})
 * so callers can also run it once, synchronously, right after a scenario's
 * `setup` — units can spawn already within each other's aggro range, and the
 * periodic system alone would leave them untargeted until its first
 * interval elapses.
 */
export function runPerceptionScan(_world: World<Entity>, queries: Queries): void {
  const candidates = [...queries.combatants].filter((entity) => entity.health.current > 0);

  for (const self of queries.targeting) {
    if (self.health.current <= 0) {
      if (self.target) {
        delete self.target;
      }
      continue;
    }

    const rangeWorld = self.attackRange.value * CELL_SIZE;
    const rangeSq = rangeWorld * rangeWorld;

    let nearest: Entity | undefined;
    let nearestDistSq = Infinity;

    for (const other of candidates) {
      if (other === self || other.team === self.team) {
        continue;
      }

      const dx = other.transform.position.x - self.transform.position.x;
      const dy = other.transform.position.y - self.transform.position.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= rangeSq && distSq < nearestDistSq) {
        nearest = other;
        nearestDistSq = distSq;
      }
    }

    if (nearest) {
      self.target = { entityId: nearest.id! };
    } else if (self.target) {
      delete self.target;
    }
  }
}

/**
 * Builds the periodic {@link System} that runs {@link runPerceptionScan}
 * every `interval` seconds of simulated time (accumulated across fixed
 * steps, not once per rendered frame). The immediate on-load scan is not
 * part of this system — call {@link runPerceptionScan} directly once, right
 * after scenario setup, for that.
 */
export function createPerceptionSystem(queries: Queries, interval = PERCEPTION_INTERVAL): System {
  let accumulator = 0;

  return (world, dt) => {
    accumulator += dt;
    if (accumulator < interval) {
      return;
    }
    accumulator -= interval;
    runPerceptionScan(world, queries);
  };
}
