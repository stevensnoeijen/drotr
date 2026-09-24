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
 * particular aim. `cellSize` converts that range from cells to world units.
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

  // Non-homing (see the doc comment above): rotation, like velocity, is set
  // once here from the aim at fire time and never touched again, so the
  // `stripe` shape is drawn pointing the way it's actually travelling
  // instead of stuck at rotation 0.
  const rotation = quantizeAngle(Math.atan2(dx, -dy));

  world.add({
    id: allocateEntityId(),
    transform: { position: { ...attacker.transform.position }, rotation },
    velocity,
    damage: { value: attacker.damage.value },
    projectile: {
      sourceTeam: attacker.team,
      targetId,
      maxRange: attacker.attackRange.value * cellSize,
      traveled: 0,
    },
    renderable: { shape: 'stripe', color: PROJECTILE_COLOR, size: PROJECTILE_SIZE },
  });
}
