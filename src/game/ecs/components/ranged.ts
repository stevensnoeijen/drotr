/**
 * Marks a unit's attacks as fired projectiles that travel to the target
 * rather than landing instantly on swing — currently just the crossbow
 * soldier. `CombatSystem` checks for this component on the attacker to
 * decide whether a landed swing calls `fireProjectile` (spawning a
 * travelling `Projectile` entity, damage applied by `ProjectileSystem` on
 * impact) or applies `Damage` straight to the target's `health.current`
 * itself, as a melee unit's swing always has.
 */
export interface Ranged {
  /** World units per second a projectile fired by this unit travels. */
  projectileSpeed: number;
}
