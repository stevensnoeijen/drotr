/**
 * Marks an entity whose HP has reached 0: it is not removed from the world
 * immediately, only flagged, so the corpse stays visible (and keeps its
 * `RenderSystem` death-mark/z-order treatment) until {@link DeathSystem}
 * actually removes it — see `~/game/systems/death-system`.
 */
export interface Dead {
  /** Gametime seconds elapsed since `health.current` first reached 0. */
  elapsed: number;
}
