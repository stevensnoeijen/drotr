/**
 * How long a unit must wait between attacks. Static per-unit configuration
 * seeded from {@link file://../../data/units.ts#UnitDefinition.attackCooldown};
 * the running countdown itself is not stored here but held by
 * {@link file://../../systems/combat-system.ts#createCombatSystem}, as one
 * {@link file://../../../lib/Cooldown.ts#Cooldown} per unit, keeping every
 * component in this folder plain, serializable data.
 */
export interface AttackCooldown {
  /** Seconds between two consecutive attacks. Must be greater than zero. */
  duration: number;
}
