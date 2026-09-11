import { cellPosition, spawnUnit } from '~/game/data/spawn';
import type { Scenario } from './types';

/**
 * Number of swordsmen spawned per side. Chosen and measured against the
 * `test` map's open area (see the PR description for the methodology and
 * headless-simulation numbers behind it): 250 vs 250 (500 total) held a
 * simulated fixed-step cost well inside the 33ms-per-frame budget a stable
 * 30fps needs, with headroom left for PixiJS's own per-unit draw/health-bar
 * cost, which this headless measurement can't include.
 */
const UNITS_PER_TEAM = 250;

/** Columns per row in each team's spawn block. */
const BLOCK_COLS = 25;

/** First row of the spawn blocks, within the open area above the maze. */
const START_ROW = 1;

/** Blue block's rightmost column; red starts a gap further right. */
const BLUE_START_COL = 1;
const GAP_COLS = 4;
const RED_START_COL = BLUE_START_COL + BLOCK_COLS + GAP_COLS;

/**
 * Two large swordsmen blocks — blue and red — facing each other across a
 * narrow gap in the open area above the map's maze block (which starts at
 * col 16, row 16 per `test.ts`), so every unit is already within (or one
 * short seek from) its `aggroRange` and the two lines crash together
 * immediately: perception, seek, per-unit movement/collision (cell
 * occupancy) and the combat system's targeting/cooldowns/damage all run at
 * once, under load, exactly as this ticket asks. Prefixed `test-`: it
 * exists to stress-test the engine, not to demonstrate a real gameplay
 * setup.
 */
export const testBigFightScenario: Scenario = {
  id: 'test-big-fight',
  title: 'Test: Big Fight',
  description: `${UNITS_PER_TEAM} vs ${UNITS_PER_TEAM} swordsmen clashing head-on, to exercise the engine under load.`,
  setup: (world) => {
    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      const col = i % BLOCK_COLS;
      const row = START_ROW + Math.floor(i / BLOCK_COLS);

      spawnUnit(world, {
        type: 'swordsmen',
        team: 'blue',
        position: cellPosition(BLUE_START_COL + col, row),
      });
      spawnUnit(world, {
        type: 'swordsmen',
        team: 'red',
        // Mirrored column order so the two blocks face each other symmetrically
        // rather than one trailing off further from the gap than the other.
        position: cellPosition(RED_START_COL + (BLOCK_COLS - 1 - col), row),
      });
    }
  },
};
