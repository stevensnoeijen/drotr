import type { ProjectileUnitType, UnitType } from '~/game/data/units';
import type { Team } from '~/game/ecs/components/team';

/**
 * Marks an entity as a fired, travelling projectile — a crossbow bolt
 * in flight. Always paired with `Transform` (current position), `Velocity`
 * (re-aimed at the target every tick by `ProjectileSystem`) and `Damage` (how hard it hits
 * on impact), which is what
 * {@link file://../../systems/projectile-system.ts#createProjectileSystem}
 * requires to move, hit-test and damage it.
 */
export interface Projectile {
  /**
   * What was fired, copied from the firer's `Ranged`: the sprite the
   * projectile is drawn as. Deliberately not the entity's `unitType`, which
   * a projectile never has, so everything keyed on that (selection, hover,
   * targeting, cell occupancy) keeps ignoring it.
   */
  type: ProjectileUnitType;
  /**
   * Unit type of the firer. The renderer draws the projectile at the same
   * world-per-art-pixel scale as this unit's sprite, so the two match in
   * size the way they do in the original art.
   */
  sourceUnitType: UnitType;
  /**
   * Team that fired this projectile. Not read for hit detection today (a
   * projectile only ever tracks the one `targetId` it was fired at), but
   * kept alongside it so a friendly-fire check, or a future splash
   * mechanic that needs to tell foe from source, has it to hand without
   * resolving back through the (possibly already-dead) firer.
   */
  sourceTeam: Team;
  /** {@link file://../entity.ts#Entity.id} of the unit this projectile was aimed at. */
  targetId: number;
  /**
   * Total distance, in world units, this projectile may travel before it
   * expires unfired — a miss, not a hit. A generous multiple of the firer's
   * `attackRange` (see `fireProjectile`), so a homing projectile still
   * reaches a target that retreats mid-flight.
   */
  maxRange: number;
  /**
   * Distance, in world units, from the firer to the target at the moment of
   * firing. Only the renderer reads it, to tell how far along its flight a
   * lobbed projectile is (see `projectile-arc.ts`); the simulation never
   * does.
   */
  launchDistance: number;
  /** World units travelled so far, advanced by `ProjectileSystem` each tick. */
  traveled: number;
}
