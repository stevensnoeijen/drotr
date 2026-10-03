import { DIRECTIONS, type Direction } from '../../../src/game/render/sprites/animation-key';
import {
  frameBlock,
  pickFrames,
  type FrameMapAnimation,
  type UnitFrameMap,
} from '../frame-map';

/**
 * Juggernaut (battering ram) frames in `BATTLE.ART`: 64×64 cells on a 64 px
 * grid, one row per direction in `DIRECTIONS` order, every animation playing
 * its columns left to right. Measured directly against the decoded atlas
 * (gutters between cells and pixel-equality of the frames), not taken from
 * the old raw dump, whose frame counts and positions carry slicing noise.
 *
 * - Blue: move at y 7488, x 0–383 (6 frames); attack in the single row at
 *   y 8128, x 0–511 (8 frames); dead at y 8855, x 0–255 (4 frames).
 * - Red: move at y 8256, x 0–383 (6 frames); attack in the single row at
 *   y 8192, x 0–511 (8 frames); dead at y 8855, x 256–511 (4 frames).
 *
 * The art has no attack frames for any direction but north (the original
 * animation model names them but there is nothing behind the names), so
 * every direction plays the north swing. The dead block's eighth row ends
 * on the atlas's last pixel row, which fixes its origin at y 8855.
 */

const rows = (y: number): Record<Direction, number> =>
  Object.fromEntries(DIRECTIONS.map((d, i) => [d, y + i * 64])) as Record<
    Direction,
    number
  >;

/** The same frame row for every direction. */
const sameRow = (y: number): Record<Direction, number> =>
  Object.fromEntries(DIRECTIONS.map((d) => [d, y])) as Record<Direction, number>;

/**
 * Idle has no frames of its own; it reuses one move frame per direction
 * (1-based). Frame 5 is the move frame closest, pixel for pixel, to the rest
 * of the cycle in every direction and team (the most static pose).
 */
export const IDLE_PICK = {
  red: { n: 5, ne: 5, e: 5, se: 5, s: 5, sw: 5, w: 5, nw: 5 },
  blue: { n: 5, ne: 5, e: 5, se: 5, s: 5, sw: 5, w: 5, nw: 5 },
} as const satisfies Record<'red' | 'blue', Record<Direction, number>>;

const SIZE = [64, 64] as const;
const blueMove = frameBlock(0, rows(7488), 6, SIZE);
const redMove = frameBlock(0, rows(8256), 6, SIZE);
const blueAttack: FrameMapAnimation = frameBlock(0, sameRow(8128), 8, SIZE);
const redAttack: FrameMapAnimation = frameBlock(0, sameRow(8192), 8, SIZE);

export const JUGGERNAUT_FRAME_MAP: UnitFrameMap = {
  unit: 'juggernaut',
  // The ram and its crew are drawn centred in the 64x64 cell (top-down view).
  anchor: [0.5, 0.5],
  // Move: speed 1 (half the swordsmen's 2) at 6 fps keeps the crew's steps in
  // proportion to the distance covered. Attack: 8 frames at 16 fps is exactly
  // one MAX_SWING_SECONDS (0.5 s) swing; CombatSystem applies damage as the
  // swing starts and hitFrame 4 (0-based, the ram driven fully home after
  // three frames of drawing back) marks the visual impact 250 ms in. Dead: 4
  // frames at 8 fps is 0.5 s, then holdLast keeps the wreck on its final
  // frame until DEATH_REMOVAL_DELAY_SECONDS.
  playback: {
    idle: { fps: 0, loop: false },
    move: { fps: 6, loop: true },
    attack: { fps: 16, loop: false, hitFrame: 4 },
    dead: { fps: 8, loop: false, holdLast: true },
  },
  teams: {
    blue: {
      idle: pickFrames(blueMove, IDLE_PICK.blue),
      move: blueMove,
      attack: blueAttack,
      dead: frameBlock(0, rows(8855), 4, SIZE),
    },
    red: {
      idle: pickFrames(redMove, IDLE_PICK.red),
      move: redMove,
      attack: redAttack,
      dead: frameBlock(256, rows(8855), 4, SIZE),
    },
  },
};
