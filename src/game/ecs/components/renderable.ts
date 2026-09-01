import type { Shape } from '~/game/ecs/components/shape';

/** Data describing how an entity should be drawn. The view is read-only. */
export interface Renderable {
  shape: Shape;
  /** RGB colour, e.g. `0x66ccff`. */
  color: number;
  /** Radius (circle) or half-extent (square) in world units. */
  size: number;
  /**
   * Set by {@link file://../../render/render-system.ts} when something about
   * this entity's view is stale (e.g. its health bar no longer matches
   * `health.current`) and needs a redraw on the next `sync()`. Systems never
   * clear it themselves — the renderer does, once it has redrawn.
   */
  dirty?: boolean;
}
