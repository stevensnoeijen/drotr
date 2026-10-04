import { DIRECTIONS } from '../../../src/game/render/sprites/animation-key';
import type { Direction } from '../../../src/game/render/sprites/animation-key';
import { EFFECT_ANIMATIONS } from '../../../src/game/data/effects';
import { frameBlock, type UnitFrameMap } from '../frame-map';

/**
 * Dirt burst in `BATTLE.ART`: 8 frames in a row at y 8064, on a 64 px pitch
 * from x 0, growing from 5×5 to about 56×57 px. Measured against the decoded
 * atlas, each burst is centred on its cell's column (x 32 + 64n) and sits
 * within rows 8067–8127, so every frame is cut as a 64×64 cell. The row
 * above the cells (the smoke clouds) ends at y 8053, and the next art below
 * starts at 8128, so no other art is inside a cell. Column 8, at x 512,
 * belongs to other art and is left out.
 *
 * The first frame's 5×5 dot sits at y 8096–8100, so the cell's anchor is
 * lowered to the middle of it, row 8098.
 *
 * The burst is the same whichever way it is seen, so the one frame row is
 * used for all eight directions.
 */
const ROWS = Object.fromEntries(DIRECTIONS.map((d) => [d, 8064])) as Record<Direction, number>;

export const IMPACT_DIRT_FRAME_MAP: UnitFrameMap = {
  unit: 'impact-dirt',
  anchor: [0.5, 34 / 64],
  // Team: one colourway. Action: an effect only plays once, so `move` is its
  // one action, played through and held on its last frame until removed.
  playback: {
    move: { fps: EFFECT_ANIMATIONS['impact-dirt'].fps, loop: false },
  },
  teams: {
    neutral: {
      move: frameBlock(0, ROWS, EFFECT_ANIMATIONS['impact-dirt'].frames, [64, 64]),
    },
  },
};
