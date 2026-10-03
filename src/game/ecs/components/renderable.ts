import type { Shape } from '~/game/ecs/components/shape';

/**
 * Data describing how an entity should be drawn. The view is read-only.
 * Sprite unit types (`SPRITE_UNIT_TYPES`) and fired projectiles are drawn
 * from their animation frames instead of `shape`, but still carry the full
 * set: `size` drives hit-testing, `color` the unit-info tooltip, and
 * `extent` the overlays and the sprite's scale (a projectile's is its
 * firer's box, see `fireProjectile`).
 */
export interface Renderable {
  shape: Shape;
  /** RGB colour, e.g. `0x66ccff`. */
  color: number;
  /** Radius (circle) or half-extent (square) in world units. */
  size: number;
  /**
   * Half-extent, in world units, of the box a unit's selection marks and
   * health bar are laid out against: its unit-type size (see `spawnUnit`),
   * of which `size` is the drawn shape inside a small margin. Falls back to
   * `size` when absent.
   */
  extent?: number;
  /**
   * Set by {@link file://../../render/render-system.ts} when something about
   * this entity's view is stale (e.g. its health bar no longer matches
   * `health.current`) and needs a redraw on the next `sync()`. Systems never
   * clear it themselves — the renderer does, once it has redrawn.
   */
  dirty?: boolean;
}
