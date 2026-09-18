import { cellPosition, spawnUnit } from '~/game/data/spawn';
import type { ParsedMap } from '~/game/map/load-tiled-map';
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

/**
 * Fallback grid used when no map loaded (or the blank map is selected), so
 * the scenario still has somewhere to scatter units — and so its unit test
 * doesn't need a real `ParsedMap` fixture. Large enough, with no collision
 * data, to hold `UNITS_PER_TEAM * 2` unique cells comfortably.
 */
const FALLBACK_GRID = { width: 64, height: 64 };

/** All grid cells not blocked by terrain (or, with no map, the whole fallback grid). */
function walkableCells(map: ParsedMap | undefined): { col: number; row: number }[] {
  const { width, height } = map ?? FALLBACK_GRID;
  const cells: { col: number; row: number }[] = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!map || map.collision[row * width + col] === 0) {
        cells.push({ col, row });
      }
    }
  }

  return cells;
}

/** Fisher-Yates shuffle, so the leading `n` cells drawn from the result are a uniform random sample. */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * `UNITS_PER_TEAM` swordsmen per side, scattered randomly over every
 * walkable cell of whichever map is loaded (no two units sharing a cell),
 * rather than two facing blocks — so combat isn't just a single front line
 * of ~25 units trading blows while the rest queue up behind it. Scattered
 * placement means most units start outside every other unit's aggro range,
 * so as they perceive, seek out and engage whichever enemy ends up nearby,
 * many separate, moving skirmishes break out across the map at once — a
 * better stress test of perception, seek, per-unit movement/collision (cell
 * occupancy) and the combat system's targeting/cooldowns/damage all
 * running concurrently, under load, than a single collision line. Prefixed
 * `test-`: it exists to stress-test the engine, not to demonstrate a real
 * gameplay setup.
 */
export const testBigFightScenario: Scenario = {
  id: 'test-big-fight',
  title: 'Test: Big Fight',
  description: `${UNITS_PER_TEAM} vs ${UNITS_PER_TEAM} swordsmen scattered randomly across the map, to exercise the engine under load.`,
  setup: (world, map) => {
    const totalUnits = UNITS_PER_TEAM * 2;
    const cells = shuffle(walkableCells(map));

    if (cells.length < totalUnits) {
      throw new Error(
        `test-big-fight needs ${totalUnits} walkable cells to scatter units onto, but only ${cells.length} are available`
      );
    }

    for (let i = 0; i < totalUnits; i++) {
      const { col, row } = cells[i];

      spawnUnit(world, {
        type: 'swordsmen',
        team: i < UNITS_PER_TEAM ? 'blue' : 'red',
        position: cellPosition(col, row),
      });
    }
  },
};
