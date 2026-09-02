import type { Point } from '~/lib/math/types';

/**
 * World-space placement of an entity. Positions live here, in the ECS — never
 * in a Pixi object. The renderer reads this to place its view each frame.
 */
export interface Transform {
  position: Point;
  /** Facing direction in radians. */
  rotation: number;
}
