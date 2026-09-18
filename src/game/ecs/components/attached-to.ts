/**
 * Marks an entity as a purely visual attachment to another entity: its
 * `transform` is kept in lockstep with the parent's by
 * {@link file://../../systems/attachment-system.ts#createAttachmentSystem}
 * every tick, rather than being simulated on its own.
 *
 * Introduced for the crossbow unit's static projectile visual (#161) — a
 * stand-in for the real projectile entity #97 will fire, travel and deal
 * damage with. This component only ever copies a position/rotation; it must
 * never grow a velocity or targeting of its own, which would make it a second
 * (competing) projectile system.
 */
export interface AttachedTo {
  /** {@link file://../entity.ts#Entity.id} of the entity this one follows. */
  entityId: number;
}
