const TAU = Math.PI * 2;

/**
 * Number of facing directions a unit can be quantized to: N, NE, E, SE, S,
 * SW, W, NW — the 8 directions 45° apart. See #178.
 */
const FACING_DIRECTIONS = 8;

/**
 * Snaps an angle (radians) to the nearest of `divisions` evenly spaced
 * angles around the circle — by default the 8 compass directions 45° apart.
 *
 * Units must only ever face (and, per #178, only ever move) in one of those
 * 8 directions rather than an arbitrary continuous angle, so every place
 * that turns a direction-of-travel vector into `Transform.rotation` routes
 * it through this rather than using `Math.atan2`'s raw result directly.
 */
export const quantizeAngle = (
  angle: number,
  divisions: number = FACING_DIRECTIONS
): number => {
  const step = TAU / divisions;

  return Math.round(angle / step) * step;
};
