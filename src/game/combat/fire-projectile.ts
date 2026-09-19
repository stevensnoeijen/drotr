import type { With, World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import { allocateEntityId } from '~/game/data/spawn';
import { CELL_SIZE } from '~/lib/grid';

/** An entity whose landed swing fires a projectile rather than hitting instantly. */
export type RangedAttacker = With<
  Entity,
  'transform' | 'team' | 'damage' | 'attackRange' | 'ranged'
>;

/** Radius, in world units, a fired projectile is drawn at by the reactive render path. */
const PROJECTILE_RADIUS = 3;

/**
 * Colour of a fired projectile — the same purple as the crossbow's static
 * dropped-arrow prop (#161), since it's the same piece of equipment, now
 * actually in flight instead of sitting on the ground.
 */
const PROJECTILE_COLOR = 0x9b59b6;

/**
 * Spawns a travelling `Projectile` entity aimed at `target`'s current
 * position, fired by `attacker`. Called by `CombatSystem` in place of
 * applying damage directly, the instant a `Ranged` attacker's swing lands
 * (i.e. the target is already confirmed within `attacker.attackRange`) —
 * the projectile, not this call, is what actually damages the target, once
 * `ProjectileSystem` lands it.
 *
 * Velocity is fixed at fire time, aimed at wherever `target` stood at this
 * instant — the projectile does not home in on a target that moves after
 * launch; `ProjectileSystem` re-reads the target's *live* position only to
 * decide whether the shot has arrived, not to steer it.
 *
 * `maxRange` is taken from `attacker.attackRange`, not measured from the
 * firing distance: a projectile fired at the very edge of range must still
 * expire at (not fly past) that same boundary if its target manages to
 * sidestep it, mirroring the firer's own reach rather than this one shot's
 * particular aim.
 */
export function fireProjectile(
  world: World<Entity>,
  attacker: RangedAttacker,
  target: With<Entity, 'transform'>,
  targetId: number
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

  world.add({
    id: allocateEntityId(),
    transform: { position: { ...attacker.transform.position }, rotation: 0 },
    velocity,
    damage: { value: attacker.damage.value },
    projectile: {
      sourceTeam: attacker.team,
      targetId,
      maxRange: attacker.attackRange.value * CELL_SIZE,
      traveled: 0,
    },
    renderable: { shape: 'circle', color: PROJECTILE_COLOR, size: PROJECTILE_RADIUS },
  });
}
