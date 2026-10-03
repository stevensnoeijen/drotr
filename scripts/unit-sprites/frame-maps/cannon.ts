import { DIRECTIONS, type Direction } from '../../../src/game/render/sprites/animation-key';
import { frameBlock, type UnitFrameMap } from '../frame-map';

/**
 * Cannon frames in `BATTLE.ART`: 64×64 cells on a 64 px grid, one row per
 * direction in `DIRECTIONS` order. Measured directly against the decoded
 * atlas (the extents of the art in each cell), not taken from the old raw
 * dump, whose rows sit up to three pixels off the grid.
 *
 * There is a single colourway and only two poses, one frame each:
 * - idle: the barrel on its carriage, column x 512–575 of the knight's blue
 *   move block (rows from y 4672, 4672 + 64·n). The art is centred in its
 *   cell in every direction, so the pivot holds.
 * - dead: the scattered wreck, column x 576–639 of the catapult's block
 *   (rows from y 5696, 5696 + 64·n).
 *
 * The art has no move and no attack frames, so neither is declared.
 */

const rows = (y: number): Record<Direction, number> =>
  Object.fromEntries(DIRECTIONS.map((d, i) => [d, y + i * 64])) as Record<
    Direction,
    number
  >;

const SIZE = [64, 64] as const;

export const CANNON_FRAME_MAP: UnitFrameMap = {
  unit: 'cannon',
  // The barrel is drawn centred in its 64x64 cell (its centre is within a
  // pixel of (32, 32) in all eight directions), so the cell centre is the
  // pivot and nothing jitters between directions.
  anchor: [0.5, 0.5],
  // Team: the art has one colourway (bare metal and timber, no team colour
  // to key on), so the cannon is team-neutral instead of tinted per team.
  // Static emplacement: it has no move frames (it never walks) and no attack
  // frames (firing is not animated in the art), so only idle and dead are
  // declared. Idle is a single frame, so no playback. Dead: the single wreck
  // frame at 2 fps (0.5 s), then holdLast keeps it on screen.
  playback: {
    idle: { fps: 0, loop: false },
    dead: { fps: 2, loop: false, holdLast: true },
  },
  teams: {
    neutral: {
      idle: frameBlock(512, rows(4672), 1, SIZE),
      dead: frameBlock(576, rows(5696), 1, SIZE),
    },
  },
};
