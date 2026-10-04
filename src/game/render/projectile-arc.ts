import type { ProjectileUnitType } from '~/game/data/units';

/**
 * The projectile types drawn flying in an arc. Only the catapult's rock
 * lobs; a bolt flies flat and straight.
 */
const ARCING_PROJECTILES: readonly ProjectileUnitType[] = ['rock'];

/** Whether a projectile of `type` is drawn flying in an arc. */
export function isArcingProjectile(type: ProjectileUnitType): boolean {
  return ARCING_PROJECTILES.includes(type);
}

/**
 * Height of an arc's peak as a fraction of the distance from launch to
 * target: a rock lobbed 100 world units peaks 25 units above the ground
 * line. Tunable to taste; the arc is only drawn, never simulated.
 */
export const ARC_PEAK_HEIGHT_FACTOR = 0.25;

/**
 * How far along its flight a projectile is, from 0 at launch to 1 at the
 * target. `traveled` can overshoot `launchDistance` for a homing projectile
 * chasing a retreating target, so the result is clamped.
 */
export function flightProgress(traveled: number, launchDistance: number): number {
  if (launchDistance <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, traveled / launchDistance));
}

/**
 * How far above its position on the ground line a lobbed projectile is
 * drawn, in world units (subtract it from the screen y): a parabola that is
 * 0 at launch (`progress` 0), highest at the midpoint and 0 at the target
 * (`progress` 1). Its peak is {@link ARC_PEAK_HEIGHT_FACTOR} times
 * `launchDistance`, so a longer shot flies higher.
 */
export function arcOffset(progress: number, launchDistance: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return 4 * ARC_PEAK_HEIGHT_FACTOR * launchDistance * t * (1 - t);
}
