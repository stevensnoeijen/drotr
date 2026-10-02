import { DIRECTIONS, type Direction } from '../../../src/game/render/sprites/animation-key';
import { frameBlock, pickFrames, type UnitFrameMap } from '../frame-map';

/**
 * Knight frames in `BATTLE.ART`: 64×64 cells on a 64 px grid (rows
 * 4672 + 64·n and 6464 + 64·n are all cell-aligned), one row per direction
 * in `DIRECTIONS` order, every animation playing its columns left to right.
 *
 * Blue: move block at y 4672 (x 0–511, 8 frames); the attack and dead blocks
 * share the rows from y 5184 (attack x 0–383, 6 frames; dead x 384–639,
 * 4 frames). Red has the same layout at y 6464 (move) and y 6976 (attack and
 * dead). Measured directly against the decoded atlas (cell gutters and
 * pixel-equality of the frames), not taken from the old raw dump, whose
 * per-team attack frame counts (5 blue, 6 red) were slicing noise: the sixth
 * column is a distinct recovery pose in both teams.
 */

const rows = (y: number): Record<Direction, number> =>
  Object.fromEntries(DIRECTIONS.map((d, i) => [d, y + i * 64])) as Record<
    Direction,
    number
  >;

/**
 * Idle has no frames of its own; it reuses one move frame per direction
 * (1-based). Frame 2 is the one closest to the attack's ready pose in nearly
 * every direction and team, so a unit going idle <-> attack does not pop.
 */
export const IDLE_PICK = {
  red: { n: 2, ne: 2, e: 2, se: 2, s: 2, sw: 2, w: 2, nw: 2 },
  blue: { n: 2, ne: 2, e: 2, se: 2, s: 2, sw: 2, w: 2, nw: 2 },
} as const satisfies Record<'red' | 'blue', Record<Direction, number>>;

const SIZE = [64, 64] as const;
const blueMove = frameBlock(0, rows(4672), 8, SIZE);
const redMove = frameBlock(0, rows(6464), 8, SIZE);

export const KNIGHT_FRAME_MAP: UnitFrameMap = {
  unit: 'knight',
  // The rider is drawn centred in its 64x64 cell (top-down view).
  anchor: [0.5, 0.5],
  // Move: speed 3 (1.5x the swordsmen's 2), so 15 fps keeps the same
  // distance per cycle as the swordsmen's 10 fps. Attack: 6 frames at 12 fps
  // is exactly one MAX_SWING_SECONDS (0.5 s) swing; CombatSystem applies
  // damage as the swing starts and hitFrame 2 (0-based, lance thrust fully
  // extended) marks the visual impact about 167 ms in. Dead: 4 frames at
  // 8 fps is 0.5 s, then holdLast keeps the corpse on its final frame until
  // DEATH_REMOVAL_DELAY_SECONDS.
  playback: {
    idle: { fps: 0, loop: false },
    move: { fps: 15, loop: true },
    attack: { fps: 12, loop: false, hitFrame: 2 },
    dead: { fps: 8, loop: false, holdLast: true },
  },
  teams: {
    blue: {
      idle: pickFrames(blueMove, IDLE_PICK.blue),
      move: blueMove,
      attack: frameBlock(0, rows(5184), 6, SIZE),
      dead: frameBlock(384, rows(5184), 4, SIZE),
    },
    red: {
      idle: pickFrames(redMove, IDLE_PICK.red),
      move: redMove,
      attack: frameBlock(0, rows(6976), 6, SIZE),
      dead: frameBlock(384, rows(6976), 4, SIZE),
    },
  },
};
