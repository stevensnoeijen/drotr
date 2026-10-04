import type { Direction } from '../../../src/game/render/sprites/animation-key';
import { frameBlock, pickFrames, sequenceFrames, type UnitFrameMap } from '../frame-map';

/**
 * Crossbow soldier frames in `BATTLE.ART`: 32×32, one atlas row per
 * direction, every animation playing its columns left to right.
 *
 * Bootstrapped by template-matching the old per-frame dump against the
 * decoded atlas, then re-measured against the figure gutters: the dump's
 * red frames were sliced at a few pixels of jitter (x 387, 450, 482, ...),
 * while the red figures actually sit on a clean 32 px grid starting at x 384
 * (the same column the blue attack block starts at). Blue frames matched the
 * dump exactly. Directions run in `DIRECTIONS` order, 32 px apart.
 */

/** Blue move block at x 128–383; the attack block follows at x 384–639. */
const BLUE_ROWS: Record<Direction, number> = {
  n: 4416,
  ne: 4448,
  e: 4480,
  se: 4512,
  s: 4544,
  sw: 4576,
  w: 4608,
  nw: 4640,
};

/** Blue dead block at x 512. */
const BLUE_DEAD_ROWS: Record<Direction, number> = {
  n: 6465,
  ne: 6497,
  e: 6529,
  se: 6561,
  s: 6593,
  sw: 6625,
  w: 6657,
  nw: 6689,
};

/** Red move block at x 384–639. */
const RED_MOVE_ROWS: Record<Direction, number> = {
  n: 8256,
  ne: 8288,
  e: 8320,
  se: 8352,
  s: 8384,
  sw: 8416,
  w: 8448,
  nw: 8480,
};

/** Red attack block at x 384–639, directly below the red move block. */
const RED_ATTACK_ROWS: Record<Direction, number> = {
  n: 8512,
  ne: 8544,
  e: 8576,
  se: 8608,
  s: 8640,
  sw: 8672,
  w: 8704,
  nw: 8736,
};

/** Red dead block at x 512. */
const RED_DEAD_ROWS: Record<Direction, number> = {
  n: 6722,
  ne: 6754,
  e: 6786,
  se: 6818,
  s: 6850,
  sw: 6882,
  w: 6914,
  nw: 6946,
};

/**
 * Idle has no frames of its own; it reuses one move frame per direction
 * (1-based). Frame 3 is a passing pose (feet together, crossbow held close)
 * in every direction for both teams, the most static point of the cycle.
 */
export const IDLE_PICK = {
  red: { n: 3, ne: 3, e: 3, se: 3, s: 3, sw: 3, w: 3, nw: 3 },
  blue: { n: 3, ne: 3, e: 3, se: 3, s: 3, sw: 3, w: 3, nw: 3 },
} as const satisfies Record<'red' | 'blue', Record<Direction, number>>;

/**
 * The 8 source attack frames stretched to a 32-slot (2 s at 16 fps) cycle.
 * Frame 0 is the loaded pose, frame 1 the settled aim and frame 2 the
 * release; 3 to 7 are the bow coming back down. The aim is held (0 then 1)
 * before the release, which plays for a single slot, then the recovery
 * frames are held in turn, so the shot reads as a pause, a quick loose and
 * a slow reload instead of a stutter through the release.
 */
const ATTACK_ORDER = [
  ...Array<number>(6).fill(0),
  ...Array<number>(6).fill(1),
  2,
  ...Array<number>(3).fill(3),
  ...Array<number>(4).fill(4),
  ...Array<number>(4).fill(5),
  ...Array<number>(4).fill(6),
  ...Array<number>(4).fill(7),
];

/** Index of the release frame within {@link ATTACK_ORDER}. */
const ATTACK_HIT_FRAME = ATTACK_ORDER.indexOf(2);

const blueMove = frameBlock(128, BLUE_ROWS, 8);
const redMove = frameBlock(384, RED_MOVE_ROWS, 8);

export const CROSSBOWSOLDIER_FRAME_MAP: UnitFrameMap = {
  unit: 'crossbowsoldier',
  // The figure is drawn centred in its 32x32 cell (top-down view), so the
  // anchor stays at the frame centre.
  anchor: [0.5, 0.5],
  // Attack: 8 source frames stretched to 32 slots at 16 fps, one 2 s loop.
  // CombatSystem fires the bolt at the release time (attackReleaseTime in the
  // unit data, kept equal to hitFrame / fps by a test), and the unit's
  // attackCooldown equals the animation length, so the attack loops while
  // engaged, one bolt per cycle. Move: 8 frames at 10 fps is 0.8 s per cycle,
  // matching the swordsmen's gait at the same 2 cells/s. Dead: 4 frames at
  // 8 fps is 0.5 s, then holdLast keeps the corpse on its final frame until
  // DEATH_REMOVAL_DELAY_SECONDS.
  playback: {
    idle: { fps: 0, loop: false },
    move: { fps: 10, loop: true },
    attack: { fps: 16, loop: false, hitFrame: ATTACK_HIT_FRAME },
    dead: { fps: 8, loop: false, holdLast: true },
  },
  teams: {
    blue: {
      idle: pickFrames(blueMove, IDLE_PICK.blue),
      move: blueMove,
      attack: sequenceFrames(frameBlock(384, BLUE_ROWS, 8), ATTACK_ORDER),
      dead: frameBlock(512, BLUE_DEAD_ROWS, 4),
    },
    red: {
      idle: pickFrames(redMove, IDLE_PICK.red),
      move: redMove,
      attack: sequenceFrames(frameBlock(384, RED_ATTACK_ROWS, 8), ATTACK_ORDER),
      dead: frameBlock(512, RED_DEAD_ROWS, 4),
    },
  },
};
