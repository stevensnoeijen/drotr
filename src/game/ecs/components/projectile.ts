import type { Team } from '~/game/ecs/components/team';

/**
 * Marks an entity as a fired, travelling projectile (#97) — a crossbow bolt
 * in flight. Always paired with `Transform` (current position), `Velocity`
 * (fixed at fire time — see `fireProjectile`) and `Damage` (how hard it hits
 * on impact), which is what
 * {@link file://../../systems/projectile-system.ts#createProjectileSystem}
 * requires to move, hit-test and damage it.
 */
export interface Projectile {
  /**
   * Team that fired this projectile. Not read for hit detection today (a
   * projectile only ever tracks the one `targetId` it was fired at), but
   * kept alongside it so a friendly-fire check, or a future homing/splash
   * mechanic that needs to tell foe from source, has it to hand without
   * resolving back through the (possibly already-dead) firer.
   */
  sourceTeam: Team;
  /** {@link file://../entity.ts#Entity.id} of the unit this projectile was aimed at. */
  targetId: number;
  /**
   * Total distance, in world units, this projectile may travel before it
   * expires unfired — a miss, not a hit. Set from the firer's `attackRange`
   * at fire time, so a projectile can never travel further than the unit
   * that fired it was allowed to shoot.
   */
  maxRange: number;
  /** World units travelled so far, advanced by `ProjectileSystem` each tick. */
  traveled: number;
}
