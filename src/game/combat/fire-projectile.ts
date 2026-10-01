import type { With, World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import { allocateEntityId } from '~/game/data/spawn';
import { quantizeAngle } from '~/lib/math/angle';

/** An entity whose landed swing fires a projectile rather than hitting instantly. */
export type RangedAttacker = With<
  Entity,
  'transform' | 'team' | 'damage' | 'attackRange' | 'ranged'
>;

/** Half-length, in world units, a fired projectile's `stripe` is drawn at. */
const PROJECTILE_SIZE = 8;

/** Colour a fired projectile is drawn in — a crossbow bolt's own purple. */
const PROJECTILE_COLOR = 0x9b59b6;

/**
 * How many times the firer's attack range a bolt may fly before expiring as
 * a miss. A homing bolt chasing a target retreating at fraction `r` of its
 * speed flies `1 / (1 - r)` times the firing distance, so 3 covers targets
 * moving up to two thirds of bolt speed — far above any unit's walking speed.
 */
const MAX_FLIGHT_RANGE_FACTOR = 3;

/**
 * Spawns a travelling `Projectile` entity aimed at `target`'s current
 * position, fired by `attacker`. Called by `CombatSystem` in place of
 * applying damage directly, the instant a `Ranged` attacker's swing lands
 * (i.e. the target is already confirmed within `attacker.attackRange`) —
 * the projectile, not this call, is what actually damages the target, once
 * `ProjectileSystem` lands it.
 *
 * Velocity starts aimed at wherever `target` stands at this instant;
 * `ProjectileSystem` then homes the projectile on the target's live position
 * each tick, so it still lands if the target moves after launch.
 *
 * `maxRange` is a safety cap on flight distance, `MAX_FLIGHT_RANGE_FACTOR`
 * times `attacker.attackRange` (converted from cells to world units by
 * `cellSize`). It is deliberately more than the attack range itself, so a
 * target walking away mid-flight is still caught, while a bolt that somehow
 * can never arrive still expires eventually.
 */
export function fireProjectile(
  world: World<Entity>,
  attacker: RangedAttacker,
  target: With<Entity, 'transform'>,
  targetId: number,
  cellSize: number
): void {
  const dx = target.transform.position.x - attacker.transform.position.x;
  const dy = target.transform.position.y - attacker.transform.position.y;
  const distance = Math.hypot(dx, dy);
  const speed = attacker.ranged.projectileSpeed;
  // Degenerate case (fired from exactly on top of the target): pick an
  // arbitrary direction rather than dividing by zero — it will hit on the
  // very next tick regardless of heading.
  const velocity =
    distance > 0
      ? { x: (dx / distance) * speed, y: (dy / distance) * speed }
      : { x: 0, y: speed };

  // Initial rotation matches the initial aim, so the `stripe` shape is drawn
  // pointing the way it travels from the first frame; `ProjectileSystem`
  // keeps it in step as it re-aims.
  const rotation = quantizeAngle(Math.atan2(dx, -dy));

  world.add({
    id: allocateEntityId(),
    transform: { position: { ...attacker.transform.position }, rotation },
    velocity,
    damage: { value: attacker.damage.value },
    projectile: {
      sourceTeam: attacker.team,
      targetId,
      maxRange: attacker.attackRange.value * cellSize * MAX_FLIGHT_RANGE_FACTOR,
      traveled: 0,
    },
    renderable: { shape: 'stripe', color: PROJECTILE_COLOR, size: PROJECTILE_SIZE },
  });
}
