import type { Direction } from '../../../src/game/render/sprites/animation-key';
import { frameBlock, type UnitFrameMap } from '../frame-map';

/**
 * Crossbow bolt frames in `BATTLE.ART`: one 14×14 cell per direction, in a
 * single column at x 280 beside the wooden UI arrow glyphs, top to bottom in
 * `DIRECTIONS` order on a 14 px pitch from y 3680. Measured against the
 * decoded atlas: every bolt has a grey tip and red fletching, and each one
 * points the way its row's direction says.
 *
 * The diagonal bolts are 10×10 strokes with a 2 px margin all round, so they
 * sit exactly centred in their cell. The straight bolts are 1 px strokes
 * running the full 14 px, which cannot be centred exactly across an even
 * cell, so each one sits on column (or row) 7 of its cell. On the 14 px
 * grid the west bolt would be the odd one out, on row 6 (y 3770 in the cell
 * from y 3764), so its cell starts a row early, at y 3763, to put it on
 * row 7 like the others.
 *
 * The two small grey balls just below the column, from about y 3792, are not
 * bolts and are left out.
 */
const ROWS: Readonly<Record<Direction, number>> = {
  n: 3680,
  ne: 3694,
  e: 3708,
  se: 3722,
  s: 3736,
  sw: 3750,
  w: 3763,
  nw: 3778,
};

const SIZE = [14, 14] as const;

export const BOLT_FRAME_MAP: UnitFrameMap = {
  unit: 'bolt',
  // Each stroke is centred in its cell (see above), so the cell centre is
  // where the bolt flies from and nothing shifts between directions.
  anchor: [0.5, 0.5],
  // Team: one colourway, the same for whoever fires it.
  // Action: a bolt only ever flies, so `move` is its one action, with a
  // single still frame per direction. Its facing is shown by which
  // direction's frame is drawn, never by rotating the sprite.
  playback: {
    move: { fps: 0, loop: false },
  },
  teams: {
    neutral: {
      move: frameBlock(280, ROWS, 1, SIZE),
    },
  },
};
