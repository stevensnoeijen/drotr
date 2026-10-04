import type { EffectUnitType, UnitType } from '~/game/data/units';

/**
 * Marks an entity as a short-lived visual effect, such as the dirt burst a
 * rock leaves. Always paired with `Transform` (where it plays) and
 * `Renderable`. It has no `unitType`, so selection, hover, targeting,
 * spawning and cell occupancy all ignore it. `EffectSystem` ages it and
 * removes it once its animation has played through.
 */
export interface Effect {
  /** Which effect this is, which decides the sprite it is drawn as. */
  type: EffectUnitType;
  /**
   * Unit type whose sprite scale the effect is drawn at: the renderer uses
   * the same world-per-art-pixel factor as this unit, so the effect matches
   * the art of whatever caused it.
   */
  sourceUnitType: UnitType;
  /** Seconds since the effect spawned, advanced by `EffectSystem`. */
  elapsed: number;
}
