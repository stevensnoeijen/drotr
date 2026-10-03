/**
 * Present on an attacker for a short while after it takes a swing (lands a
 * melee hit or fires a projectile), and absent otherwise. It records that a
 * swing just happened — the running cooldown itself is private to
 * {@link file://../../systems/combat-system.ts#createCombatSystem} — so
 * anything that needs to know "is this unit attacking right now" (e.g. the
 * sprite animation key) can read it straight from the entity.
 *
 * Added and aged by the combat system; it is combat state, not playback
 * state: nothing about frames or animation lives here.
 */
export interface AttackSwing {
  /** Gametime seconds since the swing was taken. */
  elapsed: number;
  /**
   * Set while a ranged swing is winding up: the entity id of the target its
   * projectile will be fired at once the swing reaches `Ranged.releaseTime`.
   * Cleared when the shot is released.
   */
  pendingTargetId?: number;
}
