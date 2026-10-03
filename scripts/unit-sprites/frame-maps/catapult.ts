import { DIRECTIONS, type Direction } from '../../../src/game/render/sprites/animation-key';
import { frameBlock, pickFrames, type UnitFrameMap } from '../frame-map';

/**
 * Catapult frames in `BATTLE.ART`: 64×64 cells on a 64 px grid, one row per
 * direction in `DIRECTIONS` order, every animation playing its columns left
 * to right. Measured directly against the decoded atlas (gutters between
 * cells and the extents of the art), not taken from the old raw dump, whose
 * rows sit up to three pixels off the grid and so clip the top of the
 * south-west frames.
 *
 * There is a single colourway, in one block: rows from y 5696 (5696 + 64·n,
 * every row cell-aligned); attack in columns 0–7 (x 0–511, 8 frames) and the
 * dead frame in column 8 (x 512–575: the scattered debris). Column 9
 * (x 576–639) is the cannon's wreck, not the catapult's, so it is left out
 * (checked against the old raw dump's per-unit frames). The art has no move
 * frames.
 *
 * Attack frame 5 is pixel-identical to frame 1: the swing goes from the
 * loaded pose back to it by frame 5, and frames 6–8 wind the arm up again.
 */

const rows = (y: number): Record<Direction, number> =>
  Object.fromEntries(DIRECTIONS.map((d, i) => [d, y + i * 64])) as Record<
    Direction,
    number
  >;

/**
 * Idle and move have no frames of their own; both reuse one attack frame per
 * direction (1-based): frame 1, the loaded, ready pose, which the swing
 * starts from and returns to, so going idle <-> attack does not pop.
 */
export const IDLE_PICK = {
  neutral: { n: 1, ne: 1, e: 1, se: 1, s: 1, sw: 1, w: 1, nw: 1 },
} as const satisfies Record<'neutral', Record<Direction, number>>;

const SIZE = [64, 64] as const;
const attack = frameBlock(0, rows(5696), 8, SIZE);
const ready = pickFrames(attack, IDLE_PICK.neutral);

export const CATAPULT_FRAME_MAP: UnitFrameMap = {
  unit: 'catapult',
  // The catapult is drawn centred in its 64x64 cell (top-down view); its art
  // spans the same extent in every frame of a direction, so the pivot holds.
  anchor: [0.5, 0.5],
  // Team: the art has one colourway (brown timber, no team colour to key on),
  // so the catapult is team-neutral instead of tinted per team.
  // Move: a siege engine whose art has no move cycle, so it slides along on
  // its ready frame (one frame, no playback) rather than being a static
  // emplacement; it is the same frame idle shows. Attack: 8 frames at 16 fps
  // is exactly one MAX_SWING_SECONDS (0.5 s) swing; hitFrame 1 (0-based) is a
  // provisional release point, to be checked against the battle timing when
  // the catapult is brought into combat. Dead: the single debris frame
  // at 2 fps (0.5 s), then holdLast keeps it on screen.
  playback: {
    idle: { fps: 0, loop: false },
    move: { fps: 0, loop: false },
    attack: { fps: 16, loop: false, hitFrame: 1 },
    dead: { fps: 2, loop: false, holdLast: true },
  },
  teams: {
    neutral: {
      idle: ready,
      move: ready,
      attack,
      dead: frameBlock(512, rows(5696), 1, SIZE),
    },
  },
};
