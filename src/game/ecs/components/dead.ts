/**
 * Marks an entity whose HP has reached 0: it is not removed from the world
 * immediately, only flagged, so the corpse stays visible (and keeps its
 * `RenderSystem` treatment: sorted behind the living, with a death mark on
 * a shape or the held last `dead` frame on a sprite) until {@link DeathSystem}
 * actually removes it — see `~/game/systems/death-system`.
 */
export interface Dead {
  /** Gametime seconds elapsed since `health.current` first reached 0. */
  elapsed: number;
}
