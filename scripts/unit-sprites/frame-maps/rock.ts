import { DIRECTIONS } from '../../../src/game/render/sprites/animation-key';
import type { Direction } from '../../../src/game/render/sprites/animation-key';
import { frameBlock, type UnitFrameMap } from '../frame-map';

/**
 * Catapult rock frame in `BATTLE.ART`: the larger of the two grey balls just
 * below the bolt column. Measured against the decoded atlas, it is 8 px wide
 * (x 280–287) and 7 px tall (y 3792–3798).
 *
 * The 8×8 cell starts a row early, at y 3791, so the ball sits centred in
 * it, and still ends above the smaller ball (the cannon's, left out here)
 * whose first row is y 3799. Row 3791 itself is empty: the last bolt cell
 * (north-west) ends on it, so no bolt pixels are inside the cell.
 *
 * A ball looks the same whichever way it flies, so this one frame is used
 * for all eight directions.
 */
const Y = 3791;

const ROWS = Object.fromEntries(DIRECTIONS.map((d) => [d, Y])) as Record<Direction, number>;

export const ROCK_FRAME_MAP: UnitFrameMap = {
  unit: 'rock',
  anchor: [0.5, 0.5],
  // Team: one colourway, the same for whoever fires it.
  // Action: a rock only ever flies, so `move` is its one action, with a
  // single still frame.
  playback: {
    move: { fps: 0, loop: false },
  },
  teams: {
    neutral: {
      move: frameBlock(280, ROWS, 1, [8, 8]),
    },
  },
};
