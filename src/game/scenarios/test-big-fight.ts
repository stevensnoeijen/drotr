import { cellPosition, spawnUnit } from '~/game/data/spawn';
import type { UnitType } from '~/game/data/units';
import type { ParsedMap } from '~/game/map/load-tiled-map';
import type { Scenario } from './types';

/**
 * Unit types spawned per side, and how many of each. Originally this
 * scenario spawned 250 swordsmen per side; mixing in knights (faster, higher
 * aggro range) and crossbow soldiers (ranged, so every one of them keeps a
 * projectile alive for the length of an engagement) exercises differing
 * move speeds, differing aggro ranges and the ranged-projectile path that an
 * all-swordsmen roster never touched. Hundreds of concurrent projectiles are
 * meaningfully more expensive per unit than melee, so the per-side total was
 * lowered from 250 to 180 (60 of each type) to stay inside the measured
 * frame-budget headroom — see the `test` map's open area against the
 * 33ms-per-frame budget a stable 30fps needs, with headroom left for
 * PixiJS's own per-unit draw/health-bar cost, which a headless simulation
 * can't include. The split is even across the three types so no team's
 * composition is skewed toward one archetype.
 */
const UNIT_COUNTS: Record<UnitType, number> = {
  swordsmen: 60,
  knight: 60,
  crossbowsoldier: 60,
};

const UNITS_PER_TEAM = Object.values(UNIT_COUNTS).reduce((sum, count) => sum + count, 0);

/**
 * The per-team unit roster as a flat list of unit types, one entry per unit
 * to spawn, in a fixed order (all swordsmen, then all knights, then all
 * crossbow soldiers). Both teams spawn this same roster, so the scenario
 * stays a symmetrical stress test rather than a matchup between rosters.
 */
const TEAM_ROSTER: UnitType[] = (Object.entries(UNIT_COUNTS) as [UnitType, number][]).flatMap(
  ([type, count]) => Array<UnitType>(count).fill(type)
);

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
 * `UNITS_PER_TEAM` units per side (see `UNIT_COUNTS` for the mix of
 * swordsmen, knights and crossbow soldiers), scattered randomly over every
 * walkable cell of whichever map is loaded (no two units sharing a cell),
 * rather than two facing blocks — so combat isn't just a single front line
 * of a few dozen units trading blows while the rest queue up behind it.
 * Scattered placement means most units start outside every other unit's
 * aggro range, so as they perceive, seek out and engage whichever enemy
 * ends up nearby, many separate, moving skirmishes break out across the map
 * at once — a better stress test of perception, seek, per-unit
 * movement/collision (cell occupancy) and the combat system's
 * targeting/cooldowns/damage all running concurrently, under load, than a
 * single collision line. A mixed roster additionally stresses differing
 * move speeds, differing aggro ranges and the ranged-projectile path, which
 * an all-swordsmen roster never touched. Knights currently have no
 * multi-cell footprint, so, like every other unit here, they're placed as
 * single-cell occupants — a deliberate simplification until that capability
 * exists. Prefixed `test-`: it exists to stress-test the engine, not to
 * demonstrate a real gameplay setup.
 */
export const testBigFightScenario: Scenario = {
  id: 'test-big-fight',
  title: 'Test: Big Fight',
  description: `${UNITS_PER_TEAM} vs ${UNITS_PER_TEAM} units (a mix of swordsmen, knights and crossbow soldiers) scattered randomly across the map, to exercise the engine under load.`,
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
      const team = i < UNITS_PER_TEAM ? 'blue' : 'red';
      const rosterIndex = i % UNITS_PER_TEAM;

      spawnUnit(world, {
        type: TEAM_ROSTER[rosterIndex],
        team,
        position: cellPosition(col, row),
      });
    }
  },
};
