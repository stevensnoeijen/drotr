/**
 * Marks an entity's rotation as driven by another entity's current combat
 * target, rather than its own movement or simulation — used by the crossbow
 * unit's dropped projectile (#161) so its arrow points at whichever enemy
 * the unit is currently attacking. Position is untouched; only `rotation` is
 * ever written by {@link file://../../systems/projectile-aim-system.ts#createProjectileAimSystem}.
 */
export interface AimSource {
  /** {@link file://../entity.ts#Entity.id} of the unit whose `Target` to aim at. */
  unitId: number;
}
