import type { EffectUnitType, ProjectileUnitType } from './units';

/**
 * Playback of each effect's animation: how many frames it has and how fast
 * they play. The sprite pipeline packs the animation at exactly these
 * settings, and `EffectSystem` removes the effect once they have played
 * through, so the two cannot drift apart.
 */
export const EFFECT_ANIMATIONS: Readonly<
  Record<EffectUnitType, { frames: number; fps: number }>
> = {
  'impact-dirt': { frames: 8, fps: 16 },
};

/** Seconds an effect's animation takes to play once, which is its lifetime. */
export function effectDuration(type: EffectUnitType): number {
  const { frames, fps } = EFFECT_ANIMATIONS[type];
  return frames / fps;
}

/**
 * The effect a projectile leaves where it hits its target. A projectile
 * missing here (the bolt) leaves none.
 */
export const IMPACT_EFFECTS: Readonly<Partial<Record<ProjectileUnitType, EffectUnitType>>> = {
  rock: 'impact-dirt',
};
