import type { With, World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import { allocateEntityId } from '~/game/data/spawn';
import { units } from '~/game/data/units';
import { quantizeAngle } from '~/lib/math/angle';

/**
 * An entity whose landed swing fires a projectile rather than hitting
 * instantly. Its `unitType` and `renderable` (which `spawnUnit` gives every
 * unit) are what the projectile is drawn to scale against.
 */
export type RangedAttacker = With<
  Entity,
  'transform' | 'team' | 'damage' | 'attackRange' | 'ranged' | 'unitType' | 'renderable'
>;

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
 *
 * The projectile is drawn as the sprite of `attacker.ranged.projectile`, at
 * the firer's own sprite scale: its `renderable` is laid out in the firer's
 * box (the same `size`, `extent` and colour), and `projectile.sourceUnitType`
 * names whose frames that box is fitted to (see `RenderSystem`). It gets no
 * `unitType`, so it is never selected, hovered, targeted or given a cell.
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

  // Initial rotation matches the initial aim, so the sprite shows the frame
  // pointing the way it travels from the first frame; `ProjectileSystem`
  // keeps it in step as it re-aims.
  const rotation = quantizeAngle(Math.atan2(dx, -dy));

  world.add({
    id: allocateEntityId(),
    transform: { position: { ...attacker.transform.position }, rotation },
    velocity,
    damage: { value: attacker.damage.value },
    projectile: {
      type: attacker.ranged.projectile,
      sourceUnitType: attacker.unitType,
      sourceTeam: attacker.team,
      targetId,
      maxRange: attacker.attackRange.value * cellSize * MAX_FLIGHT_RANGE_FACTOR,
      launchDistance: distance,
      traveled: 0,
    },
    renderable: {
      // Never drawn (a projectile is always a sprite), but required.
      shape: units[attacker.ranged.projectile].shape,
      color: attacker.renderable.color,
      size: attacker.renderable.size,
      extent: attacker.renderable.extent,
    },
  });
}
