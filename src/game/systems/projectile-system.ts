import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import { findEntityById } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { quantizeAngle } from '~/lib/math/angle';

/**
 * Slack, in world units, added to the hit test below to absorb float drift
 * between `distance` (recomputed fresh each tick) and `Projectile.traveled`
 * (accumulated by repeated addition) — see the comment at its use site.
 * Same order of magnitude as `CombatSystem`'s `ATTACK_RANGE_EPSILON`, for
 * the same reason: far below anything perceptible, far above the rounding
 * error it needs to absorb.
 */
const HIT_EPSILON = 0.01;

/**
 * Advances every fired `Projectile` (`queries.projectiles`) one fixed step:
 * moves it toward wherever it was aimed, and removes it the instant one of
 * three things happens —
 *
 * - it reaches its target this tick, in which case `Damage` is applied to
 *   the target's `health.current` exactly once, on the tick it lands (never
 *   per tick while merely closing the distance);
 * - its target has died or left the world since it was fired, in which case
 *   it expires without dealing any damage — in particular, it never damages
 *   whichever *other* entity happens to have since taken the dead target's
 *   id, since a hit is only ever checked against the live entity `targetId`
 *   currently resolves to;
 * - it has travelled `Projectile.maxRange` world units without hitting
 *   anything, in which case it expires as a miss.
 *
 * Homing: every tick the projectile's `Velocity` (keeping its speed) and
 * `Transform.rotation` are re-aimed at the target's *live* position before
 * it moves, so a bolt fired at a unit in range reaches it whether that unit
 * stands still or walks. Because bolts are much faster than units, a homing
 * bolt always closes the distance; `maxRange` is a generous safety cap (see
 * `fireProjectile`), not the attack range, so a target retreating mid-flight
 * is still caught. A swept hit test plus lead-aiming was the alternative;
 * homing was chosen as simpler and exact for a bolt that already reads the
 * target position to test arrival.
 *
 * `world.remove` is called directly, with no delayed-removal/corpse phase
 * the way `DeathSystem` gives a killed unit: a spent projectile has nothing
 * left to show once it has hit or missed, so cleanup can (and should) be
 * immediate — matching `RenderSystem`'s reactive `onEntityRemoved` cleanup
 * for its Pixi container, leaving nothing orphaned.
 *
 * Ordering: must run after `CombatSystem` (which is what fires new
 * projectiles this same tick) and before `DeathSystem`, so a projectile's
 * killing blow is reflected in `health.current` before death is marked for
 * the frame.
 */
export function createProjectileSystem(queries: Queries): System {
  return (world: World<Entity>, dt: number) => {
    // Snapshotted: `world.remove` reindexes `queries.projectiles` mid-loop
    // (an entity removed from it stops matching), which would otherwise
    // mutate the query out from under this same iteration.
    for (const entity of [...queries.projectiles]) {
      const target = findEntityById(world.entities, entity.projectile.targetId);

      // A target missing entirely — dead and removed, or never resolved —
      // is treated identically to one still alive but at 0 HP pending
      // removal: either way there is nothing left to damage.
      if (!target?.transform || !target.health || target.health.current <= 0) {
        world.remove(entity);
        continue;
      }

      const dx = target.transform.position.x - entity.transform.position.x;
      const dy = target.transform.position.y - entity.transform.position.y;
      const distance = Math.hypot(dx, dy);
      const speed = Math.hypot(entity.velocity.x, entity.velocity.y);
      const step = speed * dt;

      // Would reach or pass its target this tick: land the hit now rather
      // than moving it past the target first and catching it a tick late.
      //
      // `HIT_EPSILON` slack: a projectile is almost always fired at exactly
      // `maxRange` (`CombatSystem` only fires once a target is within
      // `attackRange`, and `fireProjectile` sets `maxRange` from that same
      // value), so `distance` and `maxRange - traveled` start out equal and
      // should reach zero on the same tick. But `distance` is recomputed
      // fresh each tick while `traveled` accumulates by repeated `+= step`,
      // so the two drift apart by float noise (~1e-13) over enough ticks —
      // without slack, that noise can put `distance` a hair *above* `step`
      // on the very tick the shot should land, so it falls through to the
      // expiry check below and is wrongly scored a miss instead of a hit.
      if (distance <= step + HIT_EPSILON) {
        target.health.current = Math.max(0, target.health.current - entity.damage.value);
        world.remove(entity);
        continue;
      }

      // Re-aim at the target's live position, keeping the bolt's speed.
      // `distance > step + HIT_EPSILON > 0` here, so the division is safe.
      entity.velocity.x = (dx / distance) * speed;
      entity.velocity.y = (dy / distance) * speed;
      entity.transform.rotation = quantizeAngle(Math.atan2(dx, -dy));

      entity.transform.position.x += entity.velocity.x * dt;
      entity.transform.position.y += entity.velocity.y * dt;
      entity.projectile.traveled += step;

      if (entity.projectile.traveled >= entity.projectile.maxRange) {
        world.remove(entity);
      }
    }
  };
}
