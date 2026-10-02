import type { Direction } from '../../../src/game/render/sprites/animation-key';
import { frameBlock, pickFrames, type UnitFrameMap } from '../frame-map';

/**
 * Swordsmen frames in `BATTLE.ART`: 32×32, one atlas row per direction.
 *
 * Bootstrapped by template-matching the old per-frame dump against the
 * decoded atlas (all 400 dump frames, both teams, matched exactly one
 * position each), then normalised:
 * - every animation plays its atlas columns left to right. The dump had
 *   red `move.s` frames 2/3 swapped, blue `move.n`/`ne`/`se` reversed and
 *   blue `attack.s` rotated by one frame, none of which the atlas layout
 *   supports;
 * - the dump's blue idle pointed at the first death frame; idle is now
 *   picked from the move cycle for both teams (see {@link IDLE_PICK}).
 *
 * Row origins are measured, not assumed: the red block's row pitch is
 * mostly 32 px with 31 px steps, where the shared row is transparent.
 */

/** Red move/attack block: move at x 0–255, attack at x 256–639. */
const RED_ROWS: Record<Direction, number> = {
  n: 6210,
  ne: 6242,
  e: 6274,
  se: 6306,
  s: 6338,
  sw: 6369,
  w: 6401,
  nw: 6433,
};

/** Red dead block, a separate block at x 385. Pitch alternates 32/31. */
const RED_DEAD_ROWS: Record<Direction, number> = {
  n: 7746,
  ne: 7778,
  e: 7809,
  se: 7841,
  s: 7872,
  sw: 7904,
  w: 7935,
  nw: 7967,
};

/** Blue move/attack block, same column layout as red, on a clean 32 px pitch. */
const BLUE_ROWS: Record<Direction, number> = {
  n: 4160,
  ne: 4192,
  e: 4224,
  se: 4256,
  s: 4288,
  sw: 4320,
  w: 4352,
  nw: 4384,
};

/** Blue dead block, directly below the blue move/attack block at x 0. */
const BLUE_DEAD_ROWS: Record<Direction, number> = {
  n: 4416,
  ne: 4448,
  e: 4480,
  se: 4512,
  s: 4544,
  sw: 4576,
  w: 4608,
  nw: 4640,
};

/**
 * Idle has no frames of its own; it reuses one move frame per direction
 * (1-based). Chosen by eye on the contact sheet
 * (`#/game?case=unit-sprites`): frame 3 is the passing pose (feet together)
 * with the sword held close to the body in every direction for both teams,
 * and is the narrowest silhouette facing east and west. The dump's frame 7
 * is also a passing pose, but the sword swings out over the shoulder
 * facing north and northwest. Committed explicitly so a future pick can
 * differ per team or direction.
 */
export const IDLE_PICK = {
  red: { n: 3, ne: 3, e: 3, se: 3, s: 3, sw: 3, w: 3, nw: 3 },
  blue: { n: 3, ne: 3, e: 3, se: 3, s: 3, sw: 3, w: 3, nw: 3 },
} as const satisfies Record<'red' | 'blue', Record<Direction, number>>;

const redMove = frameBlock(0, RED_ROWS, 8);
const blueMove = frameBlock(0, BLUE_ROWS, 8);

export const SWORDSMEN_FRAME_MAP: UnitFrameMap = {
  unit: 'swordsmen',
  // The figure is drawn centred in its cell (top-down view): the opaque
  // pixels of the idle frames centre on about (15.5, 15).
  anchor: [0.5, 0.5],
  // Timings come from the simulation: a swing is flagged for
  // MAX_SWING_SECONDS (0.5 s) and the renderer restarts the attack on the
  // tick CombatSystem applies damage, so 12 frames at 24 fps fill exactly one
  // swing and the unit is back on idle as the swing flag clears. The blade
  // is fully extended on 0-based frame 3 (frame 7 is the follow-through);
  // damage lands at swing start, so hitFrame marks the visual contact about
  // 125 ms in. Move: 8 frames at 10 fps is 0.8 s per cycle, about 1.6 cells
  // at the swordsmen's 2 cells/s, so feet do not skate. Dead: 4 frames at
  // 8 fps is 0.5 s, then holdLast keeps the corpse on its final frame for the
  // 300 s DEATH_REMOVAL_DELAY_SECONDS. Frames are 32x32 and the figure is
  // centred in them (opaque pixels centre on about (15.5, 15)), so the
  // anchor stays at the frame centre.
  playback: {
    idle: { fps: 0, loop: false },
    move: { fps: 10, loop: true },
    attack: { fps: 24, loop: false, hitFrame: 3 },
    dead: { fps: 8, loop: false, holdLast: true },
  },
  teams: {
    blue: {
      idle: pickFrames(blueMove, IDLE_PICK.blue),
      move: blueMove,
      attack: frameBlock(256, BLUE_ROWS, 12),
      dead: frameBlock(0, BLUE_DEAD_ROWS, 4),
    },
    red: {
      idle: pickFrames(redMove, IDLE_PICK.red),
      move: redMove,
      attack: frameBlock(256, RED_ROWS, 12),
      dead: frameBlock(385, RED_DEAD_ROWS, 4),
    },
  },
};
